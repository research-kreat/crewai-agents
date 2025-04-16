from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re
import os
from dotenv import load_dotenv
from helpers.chroma_helpers import chroma_trends

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
            role="Neo4j Database Scout",
            goal="Extract valuable insights from the Neo4j patent database",
            backstory=(
                "You're a specialized agent designed to scout and analyze patent "
                "and knowledge data stored in a Neo4j graph database. Your expertise lies in "
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
        Use ChromaDB trend vectors to return relevant trend documents based on user prompt.
        """
        try:
            results = chroma_trends.similarity_search_with_score(prompt, k=5)
            trends = [doc.page_content for doc, score in results]
            return "\n\n".join(trends)
        except Exception as e:
            print(f"Error fetching trend context: {e}")
            return ""

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
            "ONLY use the following node labels:\n"
            f"{', '.join(self.node_labels)}\n\n"
            "ONLY use the following relationship types:\n"
            f"{', '.join(self.rel_types)}\n\n"
            "You MAY use these property keys if relevant:\n"
            f"{', '.join(self.property_keys)}\n\n"
            "**DO NOT** invent any new labels or relationships (e.g., 'Patent', 'RELATED_TO'). "
            "Use only what's listed. Return a Cypher query with correct structure and strict adherence to the schema."
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
        Convert Neo4j + Chroma trend data into structured insights.
        """
        if not data:
            return {
                "isData": False,
                "insights": [],
                "recommendations": [],
                "relevant_trends": [],
                "cypher_query_by_llm": cypher_query_by_llm,
                "message": "No relevant data found in the database.",
                "data_from_neo": data,
            }

        # 1. Get trend matches using Chroma
        try:
            trend_matches = chroma_trends.similarity_search_with_score(prompt, top_k=5)
            trend_with_scores = [
                {
                    "trend": match["data"].get("title", "No title"),
                    "summary": match["data"].get("summary_text", ""),
                    "score": match["similarity_score"]
                }
                for match in trend_matches
            ]
            trend_with_scores.sort(key=lambda x: x["score"], reverse=True)
        except Exception as e:
            trend_with_scores = []
            print(f"Error fetching trends: {e}")

        # 2. Gather keys from Neo4j data
        all_fields = set()
        domains = set()
        for item in data:
            for obj in item.values():
                if isinstance(obj, dict):
                    all_fields.update(obj.keys())
                    if "domain" in obj:
                        domains.add(obj["domain"])

        crew_inputs = {
            "fields": list(all_fields),
            "domains": list(domains) if domains else "No domain data detected.",
            "num_records": len(data),
            "trend_matches": trend_with_scores  # Include trend scores
        }

        # 3. Generate insights with combined prompt
        agent_task = Task(
            description="Generate insights from Neo4j + trend vector data",
            expected_output="Combined insights and recommendations from both sources.",
            agent=self.agent
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[agent_task],
            process=Process.sequential,
            verbose=True
        )

        # Pre-format the trend matches into a string
        trend_summary = "\n".join([
            f"- {t['trend']} (Score: {t['score']:.4f})\n  Summary: {t.get('summary', 'N/A')}"
            for t in trend_with_scores
        ])


        # Build the prompt using the formatted string
        prompt_for_insights = (
            f"You are analyzing both Neo4j patent graph data and vector-matched trend information.\n\n"
            f"Neo4j Fields: {crew_inputs['fields']}\n"
            f"Domains: {crew_inputs['domains']}\n"
            f"Total Records: {crew_inputs['num_records']}\n\n"
            f"Relevant Trends (from vector search):\n{trend_summary}\n\n"
            "Based on this, provide detailed insights, trends, and recommendations."
        )


        try:
            result = crew.kickoff(inputs={"prompt": prompt_for_insights})
            if not result:
                insights = "No insights generated"
            else:
                insights = str(result).strip()

            return {
                "isData": True,
                "insights": [f"Generated insights: {insights}"],
                "recommendations": ["Review trends and identify upcoming technologies."],
                "relevant_trends": trend_with_scores,  # Include trends with scores
                "cypher_query_by_llm": cypher_query_by_llm,
                "message": "Insights and recommendations based on Neo4j data and trends.",
                "data_from_neo": data,
            }

        except Exception as e:
            return {
                "error": f"Failed to generate insights: {str(e)}",
                "raw_output": str(result)
            }

    def close(self):
        self.driver.close()
