from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re
import os
from dotenv import load_dotenv
from helpers.chroma_helpers import similarity_search_with_score

load_dotenv()

# Neo4j connection parameters
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USERNAME")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

class ScoutAgent:
    def __init__(self):
        self.driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        
        self.node_labels = ["Assignee", "Author", "CPC", "Inventor", "IPC", "Keyword", 
                            "Knowledge", "Publisher", "Subdomain", "Technology"]
        self.rel_types = ["ASSIGNED_TO", "HAS_CPC", "HAS_IPC", "HAS_KEYWORD", "IN_SUBDOMAIN", 
                          "INVENTED_BY", "PUBLISHED_BY", "USES_TECH", "WRITTEN_BY"]
        self.property_keys = ["country", "data_quality_score"]

        self.agent = Agent(
            role="Database Scout",
            goal="Extract valuable insights from the database",
            backstory=(
                "You're a specialized agent designed to scout and analyze patent "
                "and knowledge data stored in a graph database. Your expertise lies in "
                "discovering patterns, trends, and valuable insights from complex patent data "
                "relationships across inventors, technologies, classifications, and domains."
            ),
            verbose=True,
            llm="azure/gpt-4o-mini"
        )

    
    def is_valid_cypher(self, query):
        for label in re.findall(r'\((?:\w*):(\w+)\)', query):
            if label not in self.node_labels:
                return False, f"Invalid node label: {label}"
        for rel in re.findall(r'-\[:(\w+)\]', query):
            if rel not in self.rel_types:
                return False, f"Invalid relationship: {rel}"
        return True, "Valid Cypher query"
    
    def run_neo4j_query(self, query):
        with self.driver.session() as session:
            result = session.run(query)
            return result.data()

    def get_relevant_trend_context(self, prompt):
        """
        Use ChromaDB trend vectors to return relevant trend documents + scores based on user prompt.
        """
        try:
            results = similarity_search_with_score(prompt, k=5)
            return results  # Each result is (doc, score)
        except Exception as e:
            print(f"Error fetching trend context: {e}")
            return []

    def _gather_database_info(self, query_type):
        info = {}
        try:
            with self.driver.session() as session:
                node_counts = {}
                for label in self.node_labels:
                    count = session.run(f"MATCH (n:{label}) RETURN count(n) as count").single()["count"]
                    node_counts[label] = count
                info["node_counts"] = node_counts
                info["total_nodes"] = sum(node_counts.values())
                
                rel_counts = {}
                for rel_type in self.rel_types:
                    count = session.run(f"MATCH ()-[r:{rel_type}]->() RETURN count(r) as count").single()["count"]
                    rel_counts[rel_type] = count
                info["relationship_counts"] = rel_counts
                info["total_relationships"] = sum(rel_counts.values())
                
                if query_type == "inventor_analysis":
                    result = session.run("""
                        MATCH (i:Inventor)-[:INVENTED_BY]-(k:Knowledge)
                        RETURN i.name as inventor, count(k) as invention_count
                        ORDER BY invention_count DESC
                        LIMIT 10
                    """)
                    info["top_inventors"] = [{"name": record["inventor"], "count": record["invention_count"]} for record in result]
                    
                elif query_type == "technology_trends":
                    result = session.run("""
                        MATCH (k:Knowledge)-[:USES_TECH]->(t:Technology)
                        RETURN t.name as technology, count(k) as usage_count
                        ORDER BY usage_count DESC
                        LIMIT 15
                    """)
                    info["technology_trends"] = [{"name": record["technology"], "count": record["usage_count"]} for record in result]

                    try:
                        result = session.run("""
                            MATCH (k:Knowledge)-[:USES_TECH]->(t:Technology)
                            WHERE exists(k.date) AND k.date > date('2020-01-01')
                            RETURN t.name as technology, count(k) as recent_usage_count
                            ORDER BY recent_usage_count DESC
                            LIMIT 10
                        """)
                        info["emerging_technologies"] = [{"name": record["technology"], "count": record["recent_usage_count"]} for record in result]
                    except Exception as e:
                        print(f"Error fetching emerging technologies: {e}")
        except Exception as e:
            print(f"Error gathering database info: {e}")
        return info

    def generate_query_for_neo(self, prompt):
        """
        Use LLM to generate a Cypher query, guided by ChromaDB-based trend info and schema.
        """
        trend_context = self.get_relevant_trend_context(prompt)

        schema_description = (
            "You are an expert in Cypher queries for a Neo4j database.\n\n"
            "Your task is to analyze the graph data and generate Cypher queries that extract paths between nodes.\n"
            "These paths should be represented in the following format:\n\n"
            "MATCH p = (from)-[relationship if needed]->(to) RETURN p;\n\n"
            "ONLY use the following node labels:\n"
            f"{', '.join(self.node_labels)}\n\n"
            "ONLY use the following relationship types:\n"
            f"{', '.join(self.rel_types)}\n\n"
            "You MAY use these property keys if relevant:\n"
            f"{', '.join(self.property_keys)}\n\n"
            "**DO NOT** invent any new labels or relationships (e.g., 'Patent', 'RELATED_TO'). "
            "Use only what's listed. Your goal is to generate a valid Cypher query that extracts paths in the graph "
            "using the correct labels, relationships, and properties."
        )

        # Updated prompt with concatenation to avoid issues with triple quotes
        full_prompt = (
            f"{schema_description}\n\n"
            f"Here are some trends relevant to the user's question:\n{trend_context}\n\n"
            f"User prompt: {prompt}\n\n"
            "Return ONLY the Cypher query without any explanations, formatting, or markdown code blocks."
        )

        query_task = Task(
            description=full_prompt,
            expected_output="A valid Cypher query using only the given schema.",
            agent=self.agent
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[query_task],
            process=Process.sequential,
            verbose=True
        )

        try:
            result = crew.kickoff(inputs={"prompt": prompt})
            if not result:
                return {'error': 'LLM returned no output', 'raw_output': str(result)}

            output = str(result).strip()
            output = re.sub(r'^```(?:cypher)?\s*', '', output)
            output = re.sub(r'\s*```$', '', output)

            # Ensure Cypher query validity
            is_valid, validation_message = self.is_valid_cypher(output)
            if not is_valid:
                return {'error': f'Invalid Cypher query: {validation_message}', 'raw_output': output}

            return output
        except Exception as e:
            return {
                'error': f'Failed to generate or parse query: {str(e)}',
                'raw_output': str(result)
            }

    def convert_data_to_insights(self, data, cypher_query_by_llm, prompt):
        """
        Convert combined Neo4j + Chroma trend data into structured insights.
        """
        if not data:
            return {
                "isData": False,
                "insights": [],
                "recommendations": [],
                "relevant_trends": [],
                "cypher_query_by_llm": cypher_query_by_llm,
                "message": "No relevant data found in the database.",
                "data_from_source": data,
            }

        neo_data = []
        chroma_data = []

        # Separate Neo4j and Chroma data
        for item in data:
            if isinstance(item, dict) and item.get("fallback") and "chroma_data" in item:
                chroma_data.append(item["chroma_data"])
            else:
                neo_data.append(item)

        # Extract trend info from Chroma data (optional - can also pass externally)
        trend_with_scores = []
        try:
            for item in chroma_data:
                # Ensure 'score' exists in the item or calculate it from the result if not available
                # If you get the scores directly from `similarity_search_with_score`, this can be extracted from the `item`
                trend_with_scores.append({
                    "trend": item.get("title", "No title"),
                    "summary": item.get("summary_text", "No summary available"),
                    "score": item.get("similarity_score", 0.00)
                })
            trend_with_scores.sort(key=lambda x: x["score"], reverse=True)  # Sort by score in descending order
        except Exception as e:
            print(f"Error parsing trend data from Chroma: {e}")
            trend_with_scores = []


        # Collect all keys and domains
        all_fields = set()
        domains = set()
        for obj in (neo_data + chroma_data):
            if isinstance(obj, dict):
                all_fields.update(obj.keys())
                if "domain" in obj:
                    domains.add(obj["domain"])

        crew_inputs = {
            "fields": list(all_fields),
            "domains": list(domains) or ["No domain data detected"],
            "num_records": len(data),
            "trend_matches": trend_with_scores
        }

        # Generate insights prompt
        trend_summary = "\n".join([
            f"- {t['trend']} (Score: {t['score']:.4f})\n  Summary: {t['summary']}"
            for t in trend_with_scores[:3]
        ])

        prompt_for_insights = (
            f"Analyze the provided data thoroughly and generate actionable insights. Consider every data point, trend, and domain in your analysis.\n\n"
            f"Data Overview:\n"
            f"  - Fields: {crew_inputs['fields']}\n"
            f"  - Domains: {crew_inputs['domains']}\n"
            f"  - Total Records: {crew_inputs['num_records']}\n\n"
            f"Relevant Trends:\n"
            f"{trend_summary}\n\n"
            "From this data and trend summary, your task is to:\n"
            "1. Identify key trends and patterns in the data.\n"
            "2. Provide strategic insights based on these trends and data points.\n"
            "3. Offer clear, actionable recommendations to leverage these insights effectively.\n"
            "Focus on providing insights that are both valuable and relevant to the business context."
        )

        # Run the Crew agent task
        agent_task = Task(
            description="Generate insights from given data",
            expected_output="Detailed insights and actionable recommendations.",
            agent=self.agent
        )
        crew = Crew(
            agents=[self.agent],
            tasks=[agent_task],
            process=Process.sequential,
            verbose=True
        )

        try:
            result = crew.kickoff(inputs={"prompt": prompt_for_insights})
            if not result:
                insights = "No insights generated."
            else:
                insights = str(result).strip()

            print("[CHROMA DATA]",chroma_data)
            print("[NEO DATA]",neo_data)

            return {
                "isData": True,
                "insights": [insights],
                "recommendations": ["Explore upcoming trends and assess relevance to your domain."],
                "relevant_trends": trend_with_scores,
                "cypher_query_by_llm": cypher_query_by_llm,
                "message": "Insights and recommendations based on Neo4j and Chroma trend data.",
                # HAS NULL VALUES SO DONT SEND IT AS RESPONSE TILL FIX
                # "data_from_neo": neo_data,
                # "data_from_chroma": chroma_data
            }

        except Exception as e:
            print("[CHROMA DATA]",chroma_data)
            print("[NEO DATA]",neo_data)
            return {
                "error": f"Failed to generate insights: {str(e)}",
                "raw_output": str(result),
                # HAS NULL VALUES SO DONT SEND IT AS RESPONSE TILL FIX
                # "data_from_neo": neo_data,
                # "data_from_chroma": chroma_data
            }

    def close(self):
        self.driver.close()
