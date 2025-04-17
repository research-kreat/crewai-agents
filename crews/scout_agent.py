from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re, math
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

        self.node_labels = [
            "Assignee", "Author", "CPC", "Inventor", "IPC", "Keyword",
            "Knowledge", "Publisher", "Subdomain", "Technology"
        ]
        self.rel_types = [
            "ASSIGNED_TO", "HAS_CPC", "HAS_IPC", "HAS_KEYWORD", "IN_SUBDOMAIN",
            "INVENTED_BY", "PUBLISHED_BY", "USES_TECH", "WRITTEN_BY"
        ]
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
        """ Validates the Cypher query to ensure only allowed labels and relationships are used. """
        for label in re.findall(r'\((?:\w*):(\w+)\)', query):
            if label not in self.node_labels:
                return False, f"Invalid node label: {label}"
        for rel in re.findall(r'-\[:(\w+)\]', query):
            if rel not in self.rel_types:
                return False, f"Invalid relationship: {rel}"
        return True, "Valid Cypher query"

    def run_neo4j_query(self, query):
        """ Runs the given Cypher query on the Neo4j database. """
        try:
            with self.driver.session() as session:
                return session.run(query).data()
        except Exception as e:
            print(f"⚠️ Error running Neo4j query: {e}")
            return []

    def get_relevant_trend_context(self, prompt):
        """Fetches relevant trend context using ChromaDB similarity search."""
        try:
            trend_results = similarity_search_with_score(prompt, k=5)
            relevant_trends = []
            for trend in trend_results:
                trend_info = {
                    "summary_text": trend.get("summary_text", "No summary_text"),
                    "title": trend.get("title", "No title listed"),
                    "similarity_score": trend.get("similarity_score", 0.00),
                }
                relevant_trends.append(trend_info)
            return relevant_trends
        except Exception as e:
            print(f"⚠️ Error fetching trend context from ChromaDB: {e}")
            return []

    def sanitize_data(self, data):
        """Recursively sanitize data to handle None values or NaNs."""
        if isinstance(data, dict):
            return {k: self.sanitize_data(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self.sanitize_data(v) for v in data]
        elif isinstance(data, float) and math.isnan(data):
            return None
        return data

    def generate_query_for_neo(self, prompt):
        trend_results = self.get_relevant_trend_context(prompt)
        if not trend_results:
            return {'error': 'No relevant trends found', 'raw_output': trend_results}

        cleaned_results = self.sanitize_data(trend_results)

        trend_summary = "\n".join([
            f"{t.get('summary_text', '')[:100]} (score: {round(t.get('similarity_score', 0), 3)})"
            for t in cleaned_results[:3]
        ])

        schema_description = (
            "Generate a Cypher query using only these node labels:\n"
            f"{', '.join(self.node_labels)}\n"
            "And only these relationships:\n"
            f"{', '.join(self.rel_types)}\n"
            "Your task is to generate Cypher queries that extract paths between nodes.\n"
            "These paths should be represented in the following format:\n\n"
            "MATCH p = (from)-[relationship if needed]->(to) RETURN p;\n\n"
            "Optional property keys: country, data_quality_score\n"
            "Do NOT use other labels or relationships."
        )

        full_prompt = (
            f"{schema_description}\n\n"
            f"Similar trends:\n{trend_summary}\n\n"
            f"Prompt: {prompt}\n"
            "Output only the Cypher query, no explanations or markdown."
        )

        task = Task(
            description=full_prompt,
            expected_output="A Cypher query using only the given schema.",
            agent=self.agent
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[task],
            process=Process.sequential,
            verbose=True
        )

        try:
            result = crew.kickoff(inputs={"prompt": prompt})
            if not result:
                return {'error': 'LLM returned no output', 'raw_output': str(result)}

            query = str(result).strip()
            query = re.sub(r'^```(?:cypher)?\s*', '', query)
            query = re.sub(r'\s*```$', '', query)

            is_valid, message = self.is_valid_cypher(query)
            if not is_valid:
                return {'error': f'Invalid Cypher query: {message}', 'raw_output': query}

            return query
        except Exception as e:
            return {
                'error': f'Failed to generate or parse query: {str(e)}',
                'raw_output': str(locals().get('result', 'N/A'))
            }

    def process_scout_query(self, data):
        """Processes the scout query by integrating Neo4j and ChromaDB results."""
        user_prompt = data.get("prompt")
        if not user_prompt:
            return {"error": "Missing 'prompt' in request"}, 400

        generated_query = self.generate_query_for_neo(user_prompt)
        if isinstance(generated_query, dict) and "error" in generated_query:
            return {"error": "Query generation failed", "details": generated_query}, 500

        try:
            data_from_neo = self.run_neo4j_query(generated_query)
        except Exception as e:
            print(f"⚠️ Neo4j query failed: {e}")
            data_from_neo = []

        data_from_chroma = self.get_relevant_trend_context(user_prompt)

        if not data_from_neo and not data_from_chroma:
            return {
                "error": "No data found from either Neo4j or ChromaDB",
                "cypher_query_by_llm": generated_query
            }, 404

        combined_data = data_from_neo + [{"chroma_data": c} for c in data_from_chroma]
        insights_output = self.convert_data_to_insights(
            combined_data,
            generated_query,
            user_prompt
        )

        insights_output["source"] = (
            "neo4j+chroma" if data_from_neo and data_from_chroma else
            "neo4j" if data_from_neo else
            "chroma"
        )

        return insights_output, 200

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

        # Separate Neo4j data and Chroma data
        for item in data:
            if isinstance(item, dict) and "chroma_data" in item:
                chroma_data.append({
                    "similarity_score": item["chroma_data"].get("similarity_score", 0.00),
                    "summary_text": item["chroma_data"].get("summary_text", "No summary_text"),
                    "title": item["chroma_data"].get("title", "No title listed")
                })
            else:
                neo_data.append(item)

        trend_with_scores = []
        for item in chroma_data:
            trend_with_scores.append({
                "summary_text": item.get("summary_text", "No summary_text"),
                "title": item.get("title", "No title listed"),
                "similarity_score": item.get("similarity_score", 0.00)
            })
        trend_with_scores.sort(key=lambda x: x["similarity_score"], reverse=True)

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

        trend_summary_for_prompt = "\n".join([
            f"- Title: {t['title']} | Score: {t['similarity_score']:.4f}\n  Summary: {t['summary_text']}"
            for t in trend_with_scores[:5]
        ])

        prompt_for_insights = (
            "You are a data strategy expert helping analyze research and patent trends.\n\n"
            f"There are {crew_inputs['num_records']} total matched data records.\n"
            f"Detected domains: {', '.join(crew_inputs['domains'])}\n"
            f"Detected fields/attributes: {', '.join(crew_inputs['fields'])}\n\n"
            "Here are the top relevant trend matches from vector search:\n"
            f"{trend_summary_for_prompt}\n\n"
            "Based on the above trends and metadata, perform the following:\n"
            "1. Extract 5 or more **insights** that show interesting patterns, relationships, or trends.\n"
            "2. Suggest 3 or more **recommendations** based on these insights.\n"
            "3. Summarize the **overall trend landscape** in a short paragraph."
        )

        insight_task = Task(
            description=prompt_for_insights,
            expected_output="Return structured JSON with 'insights' in list, 'recommendations' in list, and 'trend_summary' in string.",
            agent=self.agent,
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[insight_task],
            process=Process.sequential,
            verbose=True
        )

        try:
            result = crew.kickoff(inputs={"prompt": prompt})
            if not result:
                return {
                    "isData": True,
                    "insights": [],
                    "recommendations": [],
                    "relevant_trends": trend_with_scores,
                    "cypher_query_by_llm": cypher_query_by_llm,
                    "trend_summary": trend_summary_for_prompt,
                    "message": "LLM did not return any structured output.",
                    "data_from_source": data,
                }

            output_str = str(result).strip()
            try:
                import json
                if output_str.startswith("{") and output_str.endswith("}"):
                    parsed_output = json.loads(output_str)
                else:
                    match = re.search(r"({.*})", output_str, re.DOTALL)
                    parsed_output = json.loads(match.group(1)) if match else {}
            except Exception as e:
                print(f"Error parsing LLM output as JSON: {e}")
                parsed_output = {}

            return {
                "isData": True,
                "insights": parsed_output.get("insights", []),
                "recommendations": parsed_output.get("recommendations", []),
                "relevant_trends": trend_with_scores,
                "trend_summary": trend_summary_for_prompt,
                "cypher_query_by_llm": cypher_query_by_llm,
                "message": "Insights successfully generated.",
                "data_from_source": chroma_data + neo_data,  # Merge the cleaned data
                "source": "neo+chroma"  # Specify the data source type
            }

        except Exception as e:
            return {
                "isData": True,
                "insights": [],
                "recommendations": [],
                "relevant_trends": trend_with_scores,
                "trend_summary": trend_summary_for_prompt,
                "cypher_query_by_llm": cypher_query_by_llm,
                "message": f"Failed to generate insights: {str(e)}",
                "data_from_source": data,
                "source": "neo+chroma"  # Specify the data source type
            }
