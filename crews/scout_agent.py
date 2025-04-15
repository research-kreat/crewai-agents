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
        
        # Define the node labels and relationships from the database info
        self.node_labels = ["Assignee", "Author", "CPC", "Inventor", "IPC", "Keyword", 
                           "Knowledge", "Publisher", "Subdomain", "Technology"]
        self.rel_types = ["ASSIGNED_TO", "HAS_CPC", "HAS_IPC", "HAS_KEYWORD", "IN_SUBDOMAIN", 
                         "INVENTED_BY", "PUBLISHED_BY", "USES_TECH", "WRITTEN_BY"]
        self.property_keys = ["country", "data_quality_score"]
        
        # Create the agent
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

    def _gather_database_info(self, query_type):
        """Gather relevant database information based on query type"""
        info = {}
        
        with self.driver.session() as session:
            # Get counts for each node label
            node_counts = {}
            for label in self.node_labels:
                count = session.run(f"MATCH (n:{label}) RETURN count(n) as count").single()["count"]
                node_counts[label] = count
            info["node_counts"] = node_counts
            info["total_nodes"] = sum(node_counts.values())
            
            # Get counts for each relationship type
            rel_counts = {}
            for rel_type in self.rel_types:
                count = session.run(f"MATCH ()-[r:{rel_type}]->() RETURN count(r) as count").single()["count"]
                rel_counts[rel_type] = count
            info["relationship_counts"] = rel_counts
            info["total_relationships"] = sum(rel_counts.values())
            
            # Query type specific information
            if query_type == "inventor_analysis":
                # Get top inventors
                result = session.run("""
                    MATCH (i:Inventor)-[:INVENTED_BY]-(k:Knowledge)
                    RETURN i.name as inventor, count(k) as invention_count
                    ORDER BY invention_count DESC
                    LIMIT 10
                """)
                info["top_inventors"] = [{"name": record["inventor"], "count": record["invention_count"]} 
                                       for record in result]
                
            elif query_type == "technology_trends":
                # Get technology trends
                result = session.run("""
                    MATCH (k:Knowledge)-[:USES_TECH]->(t:Technology)
                    RETURN t.name as technology, count(k) as usage_count
                    ORDER BY usage_count DESC
                    LIMIT 15
                """)
                info["technology_trends"] = [{"name": record["technology"], "count": record["usage_count"]} 
                                           for record in result]
                
                # Get emerging technologies (if date is available)
                try:
                    result = session.run("""
                        MATCH (k:Knowledge)-[:USES_TECH]->(t:Technology)
                        WHERE exists(k.date) AND k.date > date('2020-01-01')
                        RETURN t.name as technology, count(k) as recent_usage_count
                        ORDER BY recent_usage_count DESC
                        LIMIT 10
                    """)
                    info["emerging_technologies"] = [{"name": record["technology"], "count": record["recent_usage_count"]} 
                                                   for record in result]
                except:
                    # If date comparison fails, provide alternative query
                    pass

        return info

    def generate_query_for_neo(self, prompt):
        """
        Use LLM to generate a valid Cypher query for Neo4j based on user prompt,
        enforcing the known schema and avoiding invalid labels/relationships.
        """
        schema_description = (
            "You are an expert in Cypher queries for a Neo4j database.\n\n"
            "ONLY use the following node labels:\n"
            f"{', '.join(self.node_labels)}\n\n"
            "ONLY use the following relationship types:\n"
            f"{', '.join(self.rel_types)}\n\n"
            "You MAY use these property keys if relevant:\n"
            f"{', '.join(self.property_keys)}\n\n"
            "**DO NOT** invent any new labels or relationships (e.g., 'Patent', 'RELATED_TO'). "
            "Use only what's listed. Return a Cypher query with correct structure and strict adherence to the schema.\n\n"
            "Additionally, only query for data relevant to specific trends. For example, do not ask for 'all data' from the database. "
            "Please specify which trends or insights you want to explore."
        )

        full_prompt = (
            f"{schema_description}\n\n"
            f"User prompt: {prompt}\n\n"
            "Return ONLY the Cypher query without any explanations, formatting, or markdown code blocks."
        )

        query_task = Task(
            description=full_prompt,
            expected_output="A valid Cypher query using only the given schema.",
            agent=self.agent
        )

        inputs = {'prompt': prompt}
        crew = Crew(
            agents=[self.agent],
            tasks=[query_task],
            process=Process.sequential,
            verbose=True
        )

        try:
            result = crew.kickoff(inputs=inputs)
            if not result:
                return {'error': 'LLM returned no output', 'raw_output': str(result)}

            output = str(result).strip()
            output = re.sub(r'^```(?:cypher)?\s*', '', output)
            output = re.sub(r'\s*```$', '', output)

            return output
        except Exception as e:
            return {
                'error': f'Failed to generate or parse query: {str(e)}',
                'raw_output': str(result)
            }

    def is_valid_cypher(self, query):
        """
        Validate Cypher query to ensure compliance with known schema.
        """
        # Check node labels (e.g., :Technology)
        for label in re.findall(r'\((?:\w*):(\w+)\)', query):
            if label not in self.node_labels:
                return False, f"Invalid node label: {label}"

        # Check relationship types (e.g., -[:USES_TECH]-)
        for rel in re.findall(r'-\[:(\w+)\]', query):
            if rel not in self.rel_types:
                return False, f"Invalid relationship: {rel}"

        return True, "Valid Cypher query"

    def run_neo4j_query(self, query):
        """
        Execute the Cypher query on Neo4j and return the results.
        """
        with self.driver.session() as session:
            result = session.run(query)
            return result.data()

    def convert_data_to_insights(self, data, cypher_query_by_llm):
        """
        Dynamically converts raw Neo4j response data into structured insights,
        without relying on any fixed key names or object structure.
        Additionally, generates a Cypher query using LLM based on the prompt.
        """
        if not data:
            return {
                "isData": False,
                "insights": [],
                "recommendations": [],
                "relevant_trends": [],
                "cypher_query_by_llm": cypher_query_by_llm,
                "message": "No relevant data found in the database.",
                "data_from_neo": data  # Add this line to include raw data from Neo4j
            }

        # Gather all keys dynamically from the data for key_fields
        all_fields = set()
        domains = set()
        for item in data:
            for obj in item.values():
                if isinstance(obj, dict):
                    all_fields.update(obj.keys())
                    if "domain" in obj:
                        domains.add(obj["domain"])

        # Prepare dynamic input for CrewAI to generate insights and trends
        crew_inputs = {
            "fields": list(all_fields),
            "domains": list(domains) if domains else "No domain data detected.",
            "num_records": len(data)
        }

        # Use CrewAI agent to generate dynamic insights and recommendations
        agent_task = Task(
            description="Generate detailed insights and recommendations based on the raw data provided.",
            expected_output="Dynamic insights and recommendations generated based on raw Neo4j data.",
            agent=self.agent
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[agent_task],
            process=Process.sequential,
            verbose=True
        )

        prompt_for_insights = f"""
        You are an expert in analyzing graph data and extracting insights. Based on the following raw data, 
        generate a detailed analysis of the data, trends, insights, and actionable recommendations. 
        Use the provided dynamic fields and domains to guide your insights.

        Detected Fields: {crew_inputs["fields"]}
        Detected Domains: {crew_inputs["domains"]}

        Total Records: {crew_inputs["num_records"]}
        """

        inputs = {"prompt": prompt_for_insights}

        try:
            result = crew.kickoff(inputs=inputs)
            if not result:
                insights = "No insights generated"
            else:
                insights = str(result).strip()

            return {
                "isData": True,
                "insights": [
                    f"Generated insights: {insights}"  # This holds dynamic insights generated by the agent
                ],
                "recommendations": [
                    "Use the identified fields for deeper trend modeling.",
                    "Consider filtering further by time or domain for sharper insight slices."
                ],
                "relevant_trends": [
                    "Trending technologies in recent patents.",
                    "Emerging patent domains and inventor activity."
                ],
                "cypher_query_by_llm": cypher_query_by_llm,  # Always include the generated query, even if it fails
                "message": "Data processed successfully and insights generated.",
                "data_from_neo": data  # Add this line to include raw data from Neo4j
            }

        except Exception as e:
            # Return the result along with the query if it fails
            return {
                'error': f'Failed to generate insights: {str(e)}',
                'insights': "No insights generated",
                'recommendations': [],
                'relevant_trends': [],
                'cypher_query_by_llm': "Query generation failed due to an error",
                'raw_output': str(result),
                'data_from_neo': data  # Include raw data even on failure
            }

    def close(self):
        """Close the Neo4j driver"""
        self.driver.close()