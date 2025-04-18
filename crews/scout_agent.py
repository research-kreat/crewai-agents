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
        self.property_keys = ["id", "country", "data_quality_score", "domain", "knowledge_type", "publication_date", "title", "relevance_score"]

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

        self.crew = Crew(
            agents=[self.agent],
            process=Process.sequential,
            verbose=True
        )

    def is_valid_cypher(self, query):
        node_labels = re.findall(r"(?<!\[):(\w+)", query)
        invalid_labels = [label for label in node_labels if label not in self.node_labels]

        if invalid_labels:
            return False, f"Invalid node label(s): {', '.join(invalid_labels)}"
        return True, "Query is valid"

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

    def _extract_keywords(self, prompt):
        """Extract relevant keywords from prompt for search purposes"""
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
        prompt = prompt.lower()
        prompt = re.sub(r'[^\w\s]', ' ', prompt)  # Replace punctuation with space
        words = prompt.split()
        
        # Remove stop words and keep only words of length > 2
        keywords = [word for word in words if word not in stop_words and len(word) > 2]

        print("[KEYWORDS]", keywords)
        
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

    def keyword_search_neo4j(self, prompt, limit=5):
        """
        Performs keyword-based search in Neo4j instead of vector search.
        Extracts keywords from prompt and finds Knowledge nodes with matching properties.
        """
        try:
            # Extract keywords from prompt
            keywords = self._extract_keywords(prompt)
            if not keywords:
                print("⚠️ No keywords extracted from prompt")
                return []
                
            # Build a keyword-based query
            query = """
            // Find Knowledge nodes that match keywords in title, abstract, or domain
            MATCH (k:Knowledge)
            WHERE 
            ANY(keyword IN $keywords WHERE toLower(k.title) CONTAINS toLower(keyword))
            OR ANY(keyword IN $keywords WHERE k.abstract IS NOT NULL AND toLower(k.abstract) CONTAINS toLower(keyword))
            OR ANY(keyword IN $keywords WHERE k.domain IS NOT NULL AND toLower(k.domain) CONTAINS toLower(keyword))
            WITH k, 
                size([keyword IN $keywords WHERE 
                    toLower(k.title) CONTAINS toLower(keyword) OR 
                    (k.abstract IS NOT NULL AND toLower(k.abstract) CONTAINS toLower(keyword)) OR
                    (k.domain IS NOT NULL AND toLower(k.domain) CONTAINS toLower(keyword))
                ]) AS matches,
                size($keywords) AS total_keywords
            WITH k, (1.0 * matches / total_keywords) AS relevance_score
            WHERE relevance_score > 0.2
            RETURN 
                k.id AS id,
                k.title AS title,
                COALESCE(k.abstract, "No summary available") AS summary_text,
                relevance_score AS similarity_score,
                k.domain AS domain,
                k.knowledge_type AS knowledge_type,
                k.publication_date AS publication_date,
                k.country AS country,
                k.data_quality_score AS data_quality_score
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
                        COALESCE(k.id, toString(k.id)) AS id,
                        k.title AS title,
                        "No summary available" AS summary_text,
                        0.5 AS similarity_score,
                        k.domain AS domain,
                        k.knowledge_type AS knowledge_type,
                        k.publication_date AS publication_date,
                        k.country AS country,
                        k.data_quality_score AS data_quality_score
                    ORDER BY k.data_quality_score DESC
                    LIMIT 5
                    """

                    results = session.run(fallback_query).data()
                    
                return results
                
        except Exception as e:
            print(f"⚠️ Error performing keyword search in Neo4j: {e}")
            return []
    
    def perform_three_chain_extraction(self, prompt, visited_nodes=None):
        """
        Performs a 3-chain data extraction from Neo4j with deduplication.
        This implements a chain of 3 connected node queries to find deeper relationships.
        """
        # Initialize visited nodes set if not provided
        if visited_nodes is None:
            visited_nodes = set()
            
        # First, find the most relevant Knowledge nodes using keyword search
        similar_items = self.keyword_search_neo4j(prompt, limit=5)
        
        if not similar_items:
            return []
            
        # Extract the IDs of the most relevant Knowledge nodes
        knowledge_ids = [item.get('id') for item in similar_items if item.get('id')]
        
        # Keep track of already seen nodes
        for item in similar_items:
            if 'id' in item:
                visited_nodes.add(item['id'])
                
        if not knowledge_ids:
            return {"vector_results": similar_items, "chain_results": []}
            
        # Build a 3-chain query with deduplication built in
        three_chain_query = """
        // Start from the relevant Knowledge nodes
        MATCH (k:Knowledge)
        WHERE k.id IN $knowledge_ids OR toString(k.id) IN $knowledge_ids
        
        // First chain: Find related entities directly connected to Knowledge
        MATCH p1 = (k)-[r1]->(level1)
        WHERE NOT level1.id = k.id  // Avoid self-loops
        
        // Second chain: Find entities connected to the first level entities
        OPTIONAL MATCH p2 = (level1)-[r2]->(level2)
        WHERE NOT level2.id = level1.id AND NOT level2.id = k.id  // Avoid loops
        
        // Third chain: Find entities connected to the second level entities
        OPTIONAL MATCH p3 = (level2)-[r3]->(level3)
        WHERE NOT level3.id = level2.id AND NOT level3.id = level1.id AND NOT level3.id = k.id  // Avoid loops
        
        // Return complete paths with their relationships
        RETURN 
            COALESCE(k.id, toString(k.id)) AS source_id,
            k.title AS source_title,
            type(r1) AS relation1,
            labels(level1) AS level1_labels,
            COALESCE(level1.title, level1.name, "Unknown") AS level1_title,
            COALESCE(level1.id, toString(level1.id)) AS level1_id,
            type(r2) AS relation2,
            labels(level2) AS level2_labels,
            COALESCE(level2.title, level2.name, "Unknown") AS level2_title,
            COALESCE(level2.id, toString(level2.id)) AS level2_id,
            type(r3) AS relation3,
            labels(level3) AS level3_labels,
            COALESCE(level3.title, level3.name, "Unknown") AS level3_title,
            COALESCE(level3.id, toString(level3.id)) AS level3_id,
            // Include property details for all nodes
            properties(k) AS source_properties,
            properties(level1) AS level1_properties,
            properties(level2) AS level2_properties,
            properties(level3) AS level3_properties
        LIMIT 10
        """
        
        # Execute the 3-chain query
        chain_results = self.run_neo4j_query(three_chain_query, {"knowledge_ids": knowledge_ids})
        
        # Post-process to deduplicate the results
        deduplicated_chain_results = self.deduplicate_chain_results(chain_results, visited_nodes)
        
        # Combine the initial search results with the deduplicated chain results
        combined_results = {
            "vector_results": similar_items,
            "chain_results": deduplicated_chain_results
        }
        
        return combined_results

    def deduplicate_chain_results(self, chain_results, visited_nodes):
        """
        Deduplicate chain results to avoid revisiting the same nodes.
        """
        deduplicated_results = []
        
        for result in chain_results:
            # Extract all node IDs from this chain
            node_ids = []
            for level_suffix in ['source_id', 'level1_id', 'level2_id', 'level3_id']:
                if level_suffix in result and result[level_suffix]:
                    node_ids.append(result[level_suffix])
            
            # Check if any node in this chain has been visited
            is_new_chain = False
            for node_id in node_ids:
                if node_id and node_id not in visited_nodes:
                    is_new_chain = True
                    visited_nodes.add(node_id)
            
            # If this chain has at least one new node, add it to results
            if is_new_chain:
                deduplicated_results.append(result)
        
        return deduplicated_results

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
            "Generate a Cypher query using strictly ONLY these Node labels:\n"
            f"{', '.join(self.node_labels)}\n"
            "Relationships allowed:\n"
            f"{', '.join(self.rel_types)}\n\n"
            "Allowed properties:\n"
            f"{', '.join(self.property_keys)}\n\n"
            "Only use valid labels, relationships, and properties provided. Avoid any labels that is not explicitly listed.\n"
            "Only output the Cypher query. Do not include explanations or formatting like markdown.\n\n"
            "Format: MATCH p = (from)-[RELATION]->(to) RETURN p;"
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

        self.crew = Crew(
            tasks=[task],
        )

        try:
            result = self.crew.kickoff(inputs={"prompt": prompt})
            if not result:
                return {'error': 'LLM returned no output', 'raw_output': str(result)}

            query = str(result).strip()
            query = re.sub(r'^```(?:cypher)?\s*', '', query)
            query = re.sub(r'\s*```$', '', query)

            # Validate the Cypher query using the provided node labels and relationships
            is_valid, message = self.is_valid_cypher(query)
            if not is_valid:
                return {'error': f'Invalid Cypher query: {message}', 'raw_output': query}

            # Fix common issues like invalid labels or relationships
            # Ensure all labels and relationships are in the allowed lists
            query = self.fix_invalid_labels_and_relations(query)

            return query
        except Exception as e:
            return {
                'error': f'Failed to generate or parse query: {str(e)}',
                'raw_output': str(locals().get('result', 'N/A'))
            }

    def fix_invalid_labels_and_relations(self, query):
        # Replace or remove invalid node labels or relationships
        for label in self.node_labels:
            # Ensure any invalid node labels are replaced or removed from the query
            if label not in query:
                query = re.sub(r'\b' + re.escape(label) + r'\b', '', query)
        for rel in self.rel_types:
            # Ensure invalid relationships are replaced or removed
            if rel not in query:
                query = re.sub(r'\b' + re.escape(rel) + r'\b', '', query)
        return query

    def find_relevant_knowledge(self, prompt, visited_nodes=None):
        """
        Find the most relevant knowledge in the database based on keyword matching.
        This is an alternative approach to vector search.
        """
        if visited_nodes is None:
            visited_nodes = set()
            
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
            COALESCE(k.id, toString(k.id)) AS id,
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
            # Skip nodes we've already seen
            node_id = result.get('id')
            if node_id in visited_nodes:
                continue
                
            # Mark this node as visited
            if node_id:
                visited_nodes.add(node_id)
                
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

    def deduplicate_results(self, results, visited_nodes):
        """
        Deduplicate Neo4j query results based on node IDs.
        Works with both array-based results and dictionary-based results.
        """
        if not results:
            return results
            
        # Handle array of results
        if isinstance(results, list):
            deduplicated = []
            for item in results:
                # Skip if no ID field
                if not isinstance(item, dict):
                    continue
                    
                # Try to find an ID field (different naming conventions)
                node_id = None
                for id_field in ['id', 'nodeId']:
                    if id_field in item and item[id_field]:
                        node_id = item[id_field]
                        break
                        
                # If no ID found or already visited, skip
                if not node_id or node_id in visited_nodes:
                    continue
                    
                # Add to visited set and deduplicated results
                visited_nodes.add(node_id)
                deduplicated.append(item)
                
            return deduplicated
            
        # Handle dictionary with nested arrays
        elif isinstance(results, dict):
            deduplicated_dict = {}
            for key, value in results.items():
                if isinstance(value, list):
                    deduplicated_dict[key] = self.deduplicate_results(value, visited_nodes)
                else:
                    deduplicated_dict[key] = value
            return deduplicated_dict
            
        # Return unchanged if not a list or dict
        return results

    def convert_data_to_insights(self, data, cypher_query_by_llm, prompt):
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

        if isinstance(data, dict) and 'vector_results' in data:
            print("data: ", data)
            for item in data['vector_results']:
                trend_with_scores.append({
                    "title": item.get("title", "No title listed"),
                    "id": item.get("id", "No id"),
                    "knowledge_type": item.get("knowledge_type", "No knowledge type"),
                    "domain": item.get("domain", "No domain specified"),
                    "publication_date": item.get("publication_date", "No publication date"),
                    "data_quality_score": item.get("data_quality_score", 0.0),
                    "similarity_score": round(item.get("similarity_score", 0.0), 4),
                    "country": item.get("country", "No country specified"),
                    "summary_text": item.get("summary_text", "No summary available")
                })

            # Sort by similarity score (highest first)
        trend_with_scores.sort(key=lambda x: x["similarity_score"], reverse=True)
        print("[trend_with_scores]",trend_with_scores)

        # Rest of your method remains the same...
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
            f"- ID: {t['id']} | Title: {t['title']} | Domain: {t['domain']} | Knowledge Type: {t['knowledge_type']} | "
            f"Publication Date: {t.get('publication_date', 'N/A')} | Quality Score: {t.get('data_quality_score', 'N/A')} | "
            f"Country: {t.get('country', 'N/A')} | Score: {round(t['similarity_score'], 4)}"
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
            "You are a data strategy expert analyzing research and patent trends to uncover actionable insights.\n\n"
            f"Total matching records: {crew_inputs['num_records']}\n"
            f"Key Domains: {', '.join(crew_inputs['domains'])}\n"
            f"Focus Areas: {', '.join(crew_inputs['fields'])}\n\n"
            "Below is a summary of relevant trends based on keyword search:\n"
            f"{trend_summary_for_prompt}\n\n"
            f"Now, based on the above trends and the user's specific query:\n\"{prompt}\"\n\n"
            "Please perform the following analysis:\n"
            "1. **Key Insights**: Identify notable patterns, relationships, and emerging signals in the data.\n"
            "2. **Strategic Recommendations**: Suggest actionable strategies or directions based on the insights.\n"
            "3. **Trend Landscape Summary**: Concisely describe the overall landscape — what's growing, shifting, or declining.\n"
            "4. **Insightful Summary Note**: Write a detailed 300-word strategic note combining trends, insights, and recommendations in a narrative form relevant to the user’s prompt.\n\n"
            "Make the response clear, structured, and practical."
        )


        insight_task = Task(
            description=prompt_for_insights,
            expected_output="Return structured JSON with 'insights' in list of sentences, 'recommendations' in list of sentences, 'trend_summary' and 'notes' in string.",
            agent=self.agent,
        )

        self.crew = Crew(
            tasks=[insight_task],
        )

        try:
            result = self.crew.kickoff(inputs={"prompt": prompt})
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
                "notes": parsed_output.get("notes", ""),
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

    def replace_none_with_default(self, data, default_value="N/A"):
        """Recursively replace None values with a default value in nested structures."""
        if isinstance(data, dict):
            return {key: self.replace_none_with_default(value, default_value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self.replace_none_with_default(item, default_value) for item in data]
        elif data is None:
            return default_value
        return data

    def process_scout_query(self, data):
        """Processes the scout query using only Neo4j for data extraction."""
        user_prompt = data.get("prompt")
        if not user_prompt:
            return {"error": "Missing 'prompt' in request"}, 400

        # Keep track of visited nodes across all queries
        visited_nodes = set()

        # Generate a Cypher query based on the user prompt
        generated_query = self.generate_query_for_neo(user_prompt)
        if isinstance(generated_query, dict) and "error" in generated_query:
            return {"error": "Query generation failed", "details": generated_query}, 500

        if not generated_query:  # Check if generated_query is None or empty
            return {"error": "Generated query is empty or None"}, 500

        # Execute the 3-chain extraction with deduplication
        try:
            chain_data = self.perform_three_chain_extraction(user_prompt, visited_nodes)

            if chain_data is None:
                chain_data = {}  # Ensure chain_data is not None

            # If chain extraction failed, try the generated query as a fallback
            if not chain_data:
                data_from_neo = self.run_neo4j_query(generated_query)
                if data_from_neo is None:
                    data_from_neo = {}  # Ensure it's not None
                else:
                    data_from_neo = self.deduplicate_results(data_from_neo, visited_nodes)
            else:
                # Use the chain data with deduplication already applied
                data_from_neo = chain_data

                # Optionally run the generated query as well with deduplication
                generated_query_results = self.run_neo4j_query(generated_query)
                if generated_query_results:
                    deduped_generated_results = self.deduplicate_results(generated_query_results, visited_nodes)
                    data_from_neo["generated_query_results"] = deduped_generated_results

        except Exception as e:
            print(f"⚠️ Neo4j query failed: {e}")
            fallback_knowledge = self.find_relevant_knowledge(user_prompt, visited_nodes)
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

        # Replace any None values in the data from Neo4j
        data_from_neo = self.replace_none_with_default(data_from_neo, default_value="N/A")

        # Convert the data to insights
        insights_output = self.convert_data_to_insights(
            data_from_neo,
            generated_query,
            user_prompt
        )

        # Replace any None values in the insights data as well
        insights_output = self.replace_none_with_default(insights_output, default_value="N/A")

        insights_output["source"] = "neo4j"

        return insights_output, 200
