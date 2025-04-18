from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re, math
import os
from dotenv import load_dotenv
import json
from collections import Counter

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

    def run_neo4j_query(self, query, parameters=None):
        """ Runs the given Cypher query on the Neo4j database. """
        try:
            with self.driver.session() as session:
                if parameters:
                    return session.run(query, parameters).data()
                return session.run(query).data()
        except Exception as e:
            print(f"⚠️ Error running Neo4j query: {e}")
            return []

    def keyword_search_neo4j(self, prompt, limit=5):
        """
        Performs keyword-based search in Neo4j instead of vector search.
        Extracts keywords from prompt and finds Knowledge nodes with matching properties.
        """
        try:
            # Extract keywords from prompt (simple implementation)
            keywords = self._extract_keywords(prompt)
            if not keywords:
                print("⚠️ No keywords extracted from prompt")
                return []
                
            # Build a keyword-based query
            query = """
            // Find Knowledge nodes that match keywords in title, summary, or other relevant properties
            MATCH (k:Knowledge)
            WHERE 
              ANY(keyword IN $keywords WHERE toLower(k.title) CONTAINS toLower(keyword))
              OR ANY(keyword IN $keywords WHERE k.summary_text IS NOT NULL AND toLower(k.summary_text) CONTAINS toLower(keyword))
              OR ANY(keyword IN $keywords WHERE k.domain IS NOT NULL AND toLower(k.domain) CONTAINS toLower(keyword))
            WITH k, 
                 // Calculate a simple relevance score based on how many keywords match
                 size([keyword IN $keywords WHERE 
                     toLower(k.title) CONTAINS toLower(keyword) OR 
                     (k.summary_text IS NOT NULL AND toLower(k.summary_text) CONTAINS toLower(keyword)) OR
                     (k.domain IS NOT NULL AND toLower(k.domain) CONTAINS toLower(keyword))
                 ]) AS matches,
                 size($keywords) AS total_keywords
            WITH k, (1.0 * matches / total_keywords) AS relevance_score
            WHERE relevance_score > 0.2
            RETURN 
                COALESCE(k.id, k._id, toString(id(k))) AS _id, 
                COALESCE(k.summary_text, k.abstract, "No summary available") AS summary_text, 
                k.title AS title, 
                relevance_score AS similarity_score,
                k.domain AS domain,
                k.knowledge_type AS knowledge_type
            ORDER BY relevance_score DESC
            LIMIT $limit
            """
            
            with self.driver.session() as session:
                results = session.run(query, keywords=keywords, limit=limit).data()
                
                if not results:
                    print("⚠️ No similar trends found in Neo4j keyword search")
                    # Fallback to get some Knowledge nodes if no keyword matches
                    fallback_query = """
                    MATCH (k:Knowledge)
                    RETURN 
                        COALESCE(k.id, k._id, toString(id(k))) AS _id, 
                        COALESCE(k.summary_text, k.abstract, "No summary available") AS summary_text, 
                        k.title AS title, 
                        0.5 AS similarity_score,
                        k.domain AS domain,
                        k.knowledge_type AS knowledge_type
                    ORDER BY k.data_quality_score DESC
                    LIMIT 5
                    """
                    results = session.run(fallback_query).data()
                    
                return results
                
        except Exception as e:
            print(f"⚠️ Error performing keyword search in Neo4j: {e}")
            return []
    
    def _extract_keywords(self, text):
        """Extract relevant keywords from text for search purposes"""
        # For now, a very simple keyword extraction
        # Remove common stop words and punctuation
        stop_words = set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
                         'be', 'been', 'being', 'in', 'on', 'at', 'to', 'for', 'with', 
                         'by', 'about', 'like', 'through', 'over', 'before', 'after',
                         'between', 'under', 'above', 'of', 'during', 'since', 'throughout',
                         'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its',
                         'our', 'their', 'what', 'which', 'who', 'whom', 'whose', 'when',
                         'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
                         'most', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
                         'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 
                         'now', 'id', 'also', 'from'])
        
        # Basic cleaning
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)  # Replace punctuation with space
        words = text.split()
        
        # Remove stop words and keep only words of length > 2
        keywords = [word for word in words if word not in stop_words and len(word) > 2]
        
        # Count frequencies
        word_counts = Counter(keywords)
        
        # Return the most common keywords, up to 10
        most_common = word_counts.most_common(10)
        return [word for word, count in most_common]

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
        # First, find the most relevant Knowledge nodes using keyword search
        similar_items = self.keyword_search_neo4j(prompt, limit=5)
        
        if not similar_items:
            return []
            
        # Extract the IDs of the most relevant Knowledge nodes
        knowledge_ids = [item.get('_id') for item in similar_items if item.get('_id')]
        
        if not knowledge_ids:
            return {"vector_results": similar_items, "chain_results": []}  # Return just the search results if no IDs found
            
        # Build a 3-chain query to find deeper connections
        three_chain_query = """
        // Start from the relevant Knowledge nodes
        MATCH (k:Knowledge)
        WHERE k.id IN $knowledge_ids OR toString(id(k)) IN $knowledge_ids
        
        // First chain: Find related entities directly connected to Knowledge
        MATCH p1 = (k)-[r1]->(level1)
        
        // Second chain: Find entities connected to the first level entities
        OPTIONAL MATCH p2 = (level1)-[r2]->(level2)
        
        // Third chain: Find entities connected to the second level entities
        OPTIONAL MATCH p3 = (level2)-[r3]->(level3)
        
        // Return complete paths with their relationships
        RETURN 
            COALESCE(k.id, toString(id(k))) AS source_id,
            k.title AS source_title,
            type(r1) AS relation1,
            labels(level1) AS level1_labels,
            COALESCE(level1.title, level1.name, "Unknown") AS level1_title,
            type(r2) AS relation2,
            labels(level2) AS level2_labels,
            COALESCE(level2.title, level2.name, "Unknown") AS level2_title,
            type(r3) AS relation3,
            labels(level3) AS level3_labels,
            COALESCE(level3.title, level3.name, "Unknown") AS level3_title,
            // Include property details for all nodes
            properties(k) AS source_properties,
            properties(level1) AS level1_properties,
            properties(level2) AS level2_properties,
            properties(level3) AS level3_properties
        LIMIT 20
        """
        
        # Execute the 3-chain query
        chain_results = self.run_neo4j_query(three_chain_query, {"knowledge_ids": knowledge_ids})
        
        # Combine the initial search results with the chain results
        combined_results = {
            "vector_results": similar_items,
            "chain_results": chain_results
        }
        
        return combined_results

    def generate_query_for_neo(self, prompt):
        # Get keyword search results from Neo4j
        trend_results = self.keyword_search_neo4j(prompt)
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

    def find_relevant_knowledge(self, prompt):
        """
        Find the most relevant knowledge in the database based on keyword matching.
        This is an alternative approach to vector search.
        """
        keywords = self._extract_keywords(prompt)
        keyword_string = " ".join(keywords)
        print(f"Extracted keywords: {keyword_string}")
        
        # Try to find Knowledge nodes with similar keywords
        query = """
        MATCH (k:Knowledge)
        WHERE 
            k.title IS NOT NULL AND
            k.knowledge_type IS NOT NULL
        RETURN 
            COALESCE(k.id, toString(id(k))) AS _id,
            k.title AS title,
            k.domain AS domain,
            k.knowledge_type AS knowledge_type,
            k.publication_date AS publication_date,
            k.country AS country,
            COALESCE(k.summary_text, k.abstract) AS summary_text
        ORDER BY k.data_quality_score DESC
        LIMIT 10
        """
        
        results = self.run_neo4j_query(query)
        
        # Simple scoring function based on keyword presence
        scored_results = []
        for result in results:
            score = 0
            # Check title for keyword matches
            if result.get('title'):
                for keyword in keywords:
                    if keyword.lower() in result['title'].lower():
                        score += 2  # Title matches are more important
            
            # Check summary for keyword matches
            if result.get('summary_text'):
                for keyword in keywords:
                    if keyword.lower() in result['summary_text'].lower():
                        score += 1
                        
            # Check domain for keyword matches
            if result.get('domain'):
                for keyword in keywords:
                    if keyword.lower() in result['domain'].lower():
                        score += 1.5  # Domain matches are quite relevant
            
            # Add normalized score
            result['similarity_score'] = score / max(1, len(keywords) * 4)  # Normalize to 0-1 range
            scored_results.append(result)
        
        # Sort by score
        scored_results.sort(key=lambda x: x.get('similarity_score', 0), reverse=True)
        
        # Return only results with some relevance
        return [r for r in scored_results if r.get('similarity_score', 0) > 0.1]

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
            fallback_knowledge = self.find_relevant_knowledge(user_prompt)
            if not fallback_knowledge:
                return {
                    "error": f"Neo4j query execution failed and fallback search failed: {str(e)}",
                    "cypher_query_by_llm": generated_query
                }, 500
            data_from_neo = {"vector_results": fallback_knowledge, "chain_results": []}

        if not data_from_neo:
            return {
                "error": "No data found from Neo4j",
                "cypher_query_by_llm": generated_query
            }, 404

        # Get trend information directly from keyword search
        trend_data = self.keyword_search_neo4j(user_prompt)

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
        if isinstance(data, dict) and 'vector_results' in data and 'chain_results' in data:
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
            f"- ID: {t['_id']} | Title: {t['title']} | Score: {round(t['similarity_score'], 3)})" 
            for t in trend_with_scores[:5]
        ])
        
        # Include chain results information in the prompt if available
        chain_info = ""
        if isinstance(data, dict) and 'chain_results' in data and data['chain_results']:
            chain_sample = data['chain_results'][:3]  
            chain_info = "3-Chain relationship examples found:\n"
            for i, chain in enumerate(chain_sample):
                chain_info += f"Chain {i+1}: {chain.get('source_title', 'Unknown')} -> {chain.get('level1_title', 'Unknown')} -> {chain.get('level2_title', 'Unknown')} -> {chain.get('level3_title', 'Unknown')}\n"

        prompt_for_insights = (
            "You are a data strategy expert helping analyze research and patent trends.\n\n"
            f"There are {crew_inputs['num_records']} total matched data records.\n"
            f"Detected domains: {', '.join(crew_inputs['domains'])}\n"
            f"Detected fields/attributes: {', '.join(crew_inputs['fields'])}\n\n"
            f"{chain_info}\n\n"
            "Here are the top relevant trend matches from keyword search:\n"
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