from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re, math
import os
from dotenv import load_dotenv

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

    def vector_search_neo4j(self, prompt, k=5):
        """
        Performs vector similarity search directly in Neo4j instead of using ChromaDB.
        Assumes embeddings are stored in Neo4j and the database has vector capabilities enabled.
        """
        try:
            # This assumes you have a function to convert the prompt to embeddings
            # For this example, we'll assume the embeddings are already in Neo4j
            
            # Vector search query using Neo4j's vector capabilities
            query = """
            // Step 1: Generate embedding for the search query (this would normally be done client-side)
            WITH $prompt AS searchText
            
            // Step 2: Find similar nodes using vector similarity
            MATCH (k:Knowledge)
            WHERE k.embedding IS NOT NULL
            WITH k, gds.similarity.cosine(k.embedding, apoc.text.embedding($prompt)) AS similarity
            WHERE similarity > 0.7
            RETURN k._id AS _id, 
                   k.summary_text AS summary_text, 
                   k.title AS title, 
                   similarity AS similarity_score
            ORDER BY similarity_score DESC
            LIMIT $limit
            """
            
            with self.driver.session() as session:
                results = session.run(query, prompt=prompt, limit=k).data()
                
                if not results:
                    print("⚠️ No similar trends found in Neo4j vector search")
                    return []
                    
                return results
                
        except Exception as e:
            print(f"⚠️ Error performing vector search in Neo4j: {e}")
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

    def perform_three_chain_extraction(self, prompt):
        """
        Performs a 3-chain data extraction from Neo4j.
        This implements a chain of 3 connected node queries to find deeper relationships.
        """
        # First, find the most relevant Knowledge nodes using vector similarity
        similar_items = self.vector_search_neo4j(prompt, k=3)
        
        if not similar_items:
            return []
            
        # Extract the IDs of the most relevant Knowledge nodes
        knowledge_ids = [item.get('_id') for item in similar_items if item.get('_id')]
        
        if not knowledge_ids:
            return similar_items  # Return the vector search results if no IDs found
            
        # Build a 3-chain query to find deeper connections
        three_chain_query = """
        // Start from the relevant Knowledge nodes
        MATCH (k:Knowledge)
        WHERE k._id IN $knowledge_ids
        
        // First chain: Find related entities directly connected to Knowledge
        MATCH p1 = (k)-[r1]->(level1)
        
        // Second chain: Find entities connected to the first level entities
        MATCH p2 = (level1)-[r2]->(level2)
        
        // Third chain: Find entities connected to the second level entities
        MATCH p3 = (level2)-[r3]->(level3)
        
        // Return complete paths with their relationships
        RETURN 
            k._id AS source_id,
            k.title AS source_title,
            type(r1) AS relation1,
            labels(level1) AS level1_labels,
            level1.title AS level1_title,
            type(r2) AS relation2,
            labels(level2) AS level2_labels,
            level2.title AS level2_title,
            type(r3) AS relation3,
            labels(level3) AS level3_labels,
            level3.title AS level3_title,
            // Include property details for all nodes
            properties(k) AS source_properties,
            properties(level1) AS level1_properties,
            properties(level2) AS level2_properties,
            properties(level3) AS level3_properties
        LIMIT 20
        """
        
        # Execute the 3-chain query
        chain_results = self.run_neo4j_query(three_chain_query)
        
        # Combine the initial vector results with the chain results
        combined_results = {
            "vector_results": similar_items,
            "chain_results": chain_results
        }
        
        return combined_results

    def generate_query_for_neo(self, prompt):
        # Instead of getting context from ChromaDB, we use Neo4j vector search
        trend_results = self.vector_search_neo4j(prompt)
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
        """Processes the scout query using only Neo4j for data extraction."""
        user_prompt = data.get("prompt")
        if not user_prompt:
            return {"error": "Missing 'prompt' in request"}, 400

        # Generate a Cypher query based on the user prompt
        generated_query = self.generate_query_for_neo(user_prompt)
        if isinstance(generated_query, dict) and "error" in generated_query:
            return {"error": "Query generation failed", "details": generated_query}, 500

        # Execute the 3-chain extraction
        try:
            chain_data = self.perform_three_chain_extraction(user_prompt)
            
            # If chain extraction failed, try the generated query as a fallback
            if not chain_data:
                data_from_neo = self.run_neo4j_query(generated_query)
            else:
                # Use both the chain data and the generated query results
                data_from_neo = chain_data
                # Optionally run the generated query as well
                generated_query_results = self.run_neo4j_query(generated_query)
                if generated_query_results:
                    data_from_neo["generated_query_results"] = generated_query_results
                
        except Exception as e:
            print(f"⚠️ Neo4j query failed: {e}")
            return {
                "error": f"Neo4j query execution failed: {str(e)}",
                "cypher_query_by_llm": generated_query
            }, 500

        if not data_from_neo:
            return {
                "error": "No data found from Neo4j",
                "cypher_query_by_llm": generated_query
            }, 404

        # Get trend information directly from Neo4j vector search
        trend_data = self.vector_search_neo4j(user_prompt)

        # Convert the data to insights
        insights_output = self.convert_data_to_insights(
            data_from_neo,
            generated_query,
            user_prompt,
            trend_data
        )

        insights_output["source"] = "neo4j"

        return insights_output, 200

    def convert_data_to_insights(self, data, cypher_query_by_llm, prompt, trend_data=None):
        """
        Convert Neo4j data into structured insights.
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

        # Format trend data for display
        trend_with_scores = []
        if trend_data:
            for item in trend_data:
                trend_with_scores.append({
                    "_id": item.get("_id", "No _id"),
                    "summary_text": item.get("summary_text", "No summary_text"),
                    "title": item.get("title", "No title listed"),
                    "similarity_score": item.get("similarity_score", 0.00)
                })
            trend_with_scores.sort(key=lambda x: x["similarity_score"], reverse=True)

        # Extract all fields and domains from the data
        all_fields = set()
        domains = set()
        
        # Handle different data structures (chain results have a different structure)
        if 'vector_results' in data and 'chain_results' in data:
            # Handle chain results structure
            for obj in data['vector_results']:
                if isinstance(obj, dict):
                    all_fields.update(obj.keys())
                    if "domain" in obj:
                        domains.add(obj["domain"])
                    
            for chain_result in data['chain_results']:
                if isinstance(chain_result, dict):
                    all_fields.update(chain_result.keys())
                    
                    # Extract domains from all levels of the chain
                    for prop_key in ['source_properties', 'level1_properties', 'level2_properties', 'level3_properties']:
                        props = chain_result.get(prop_key, {})
                        if isinstance(props, dict) and "domain" in props:
                            domains.add(props["domain"])
        else:
            # Handle simple results
            for obj in data:
                if isinstance(obj, dict):
                    all_fields.update(obj.keys())
                    if "domain" in obj:
                        domains.add(obj["domain"])

        crew_inputs = {
            "fields": list(all_fields),
            "domains": list(domains) or ["No domain data detected"],
            "num_records": len(data['chain_results'] if isinstance(data, dict) and 'chain_results' in data else data),
            "trend_matches": trend_with_scores 
        }

        trend_summary_for_prompt = "\n".join([
            f"- ID: {t['_id']} | Title: {t['title']} | Score: {t['similarity_score']:.4f} | Summary: {t['summary_text']}"
            for t in trend_with_scores[:5]
        ])
        
        # Include chain results information in the prompt if available
        chain_info = ""
        if isinstance(data, dict) and 'chain_results' in data and data['chain_results']:
            chain_sample = data['chain_results'][:3]  
            chain_info = "3-Chain relationship examples found:\n"
            for i, chain in enumerate(chain_sample):
                chain_info += f"Chain {i+1}: {chain.get('source_title', 'Unknown')} -> {chain.get('level1_title', 'Unknown')} -> {chain.get('level2_title', 'Unknown')} -> {chain.get('level3_title', 'Unknown')}\n"

        print("chain_info",chain_info)
        prompt_for_insights = (
            "You are a data strategy expert helping analyze research and patent trends.\n\n"
            f"There are {crew_inputs['num_records']} total matched data records.\n"
            f"Detected domains: {', '.join(crew_inputs['domains'])}\n"
            f"Detected fields/attributes: {', '.join(crew_inputs['fields'])}\n\n"
            f"{chain_info}\n\n"
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
                "data_from_source": data,
                "source": "neo4j"
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
                "source": "neo4j"
            }