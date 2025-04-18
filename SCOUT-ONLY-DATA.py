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

    def enhanced_knowledge_search(self, prompt, limit=10):
        """
        Enhanced search that retrieves Knowledge nodes and all their connected entities
        in a single query, organizing them into the desired structure.
        """
        # Extract keywords from prompt
        keywords = self._extract_keywords(prompt)
        if not keywords:
            print("⚠️ No keywords extracted from prompt")
            return []
            
        # Build an enhanced query that retrieves Knowledge nodes and all connected entities
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
        
        // Collect all connected entities
        OPTIONAL MATCH (k)-[:INVENTED_BY]->(inventor:Inventor)
        OPTIONAL MATCH (k)-[:ASSIGNED_TO]->(assignee:Assignee)
        OPTIONAL MATCH (k)-[:PUBLISHED_BY]->(publisher:Publisher)
        OPTIONAL MATCH (k)-[:HAS_CPC]->(cpc:CPC)
        OPTIONAL MATCH (k)-[:HAS_IPC]->(ipc:IPC)
        OPTIONAL MATCH (k)-[:HAS_KEYWORD]->(keyword:Keyword)
        OPTIONAL MATCH (k)-[:IN_SUBDOMAIN]->(subdomain:Subdomain)
        OPTIONAL MATCH (k)-[:USES_TECH]->(technology:Technology)
        OPTIONAL MATCH (k)-[:WRITTEN_BY]->(author:Author)
        
        WITH k, relevance_score,
             collect(DISTINCT inventor.name) AS inventors,
             collect(DISTINCT assignee.name) AS assignees,
             collect(DISTINCT publisher.name) AS publishers,
             collect(DISTINCT cpc.name) AS cpcs,
             collect(DISTINCT ipc.name) AS ipcs,
             collect(DISTINCT keyword.name) AS keywords,
             collect(DISTINCT subdomain.name) AS subdomains,
             collect(DISTINCT technology.name) AS technologies,
             collect(DISTINCT author.name) AS authors
        
        RETURN 
            k.id AS id,
            k.title AS title,
            COALESCE(k.abstract, "No summary available") AS summary_text,
            relevance_score AS similarity_score,
            k.domain AS domain,
            k.knowledge_type AS knowledge_type,
            k.publication_date AS publication_date,
            k.country AS country,
            k.data_quality_score AS data_quality_score,
            inventors AS inventor,
            assignees AS assignee,
            publishers AS publisher,
            cpcs AS cpc,
            ipcs AS ipc,
            keywords AS keyword,
            subdomains AS subdomain,
            technologies AS technology,
            authors AS author
        ORDER BY relevance_score DESC
        LIMIT $limit
        """
        
        # Execute the query
        with self.driver.session() as session:
            results = session.run(query, keywords=keywords, limit=limit).data()
            
            if not results:
                print("⚠️ No similar trends found in enhanced search")
                # Fallback to get some Knowledge nodes if no keyword matches
                fallback_query = """
                MATCH (k:Knowledge)
                
                // Collect all connected entities
                OPTIONAL MATCH (k)-[:INVENTED_BY]->(inventor:Inventor)
                OPTIONAL MATCH (k)-[:ASSIGNED_TO]->(assignee:Assignee)
                OPTIONAL MATCH (k)-[:PUBLISHED_BY]->(publisher:Publisher)
                OPTIONAL MATCH (k)-[:HAS_CPC]->(cpc:CPC)
                OPTIONAL MATCH (k)-[:HAS_IPC]->(ipc:IPC)
                OPTIONAL MATCH (k)-[:HAS_KEYWORD]->(keyword:Keyword)
                OPTIONAL MATCH (k)-[:IN_SUBDOMAIN]->(subdomain:Subdomain)
                OPTIONAL MATCH (k)-[:USES_TECH]->(technology:Technology)
                OPTIONAL MATCH (k)-[:WRITTEN_BY]->(author:Author)
                
                WITH k,
                     collect(DISTINCT inventor.name) AS inventors,
                     collect(DISTINCT assignee.name) AS assignees,
                     collect(DISTINCT publisher.name) AS publishers,
                     collect(DISTINCT cpc.name) AS cpcs,
                     collect(DISTINCT ipc.name) AS ipcs,
                     collect(DISTINCT keyword.name) AS keywords,
                     collect(DISTINCT subdomain.name) AS subdomains,
                     collect(DISTINCT technology.name) AS technologies,
                     collect(DISTINCT author.name) AS authors
                
                RETURN 
                    COALESCE(k.id, toString(k.id)) AS id,
                    k.title AS title,
                    "No summary available" AS summary_text,
                    0.5 AS similarity_score,
                    k.domain AS domain,
                    k.knowledge_type AS knowledge_type,
                    k.publication_date AS publication_date,
                    k.country AS country,
                    k.data_quality_score AS data_quality_score,
                    inventors AS inventor,
                    assignees AS assignee,
                    publishers AS publisher,
                    cpcs AS cpc,
                    ipcs AS ipc,
                    keywords AS keyword,
                    subdomains AS subdomain,
                    technologies AS technology,
                    authors AS author
                ORDER BY k.data_quality_score DESC
                LIMIT 5
                """
                results = session.run(fallback_query).data()
                
            return results

    def chain_enrichment(self, knowledge_ids, visited_nodes=None):
        """
        Enriches the search results by exploring relationships between entities
        and finding additional related knowledge nodes.
        """
        if visited_nodes is None:
            visited_nodes = set()
            
        # Add current knowledge IDs to visited nodes
        for kid in knowledge_ids:
            visited_nodes.add(kid)
            
        # Query to find related knowledge nodes through connections
        chain_query = """
        // Start with the seed Knowledge nodes
        MATCH (k:Knowledge)
        WHERE k.id IN $knowledge_ids OR toString(k.id) IN $knowledge_ids
        
        // Find entities connected to these Knowledge nodes
        OPTIONAL MATCH (k)-[r1]->(entity)
        WHERE NOT entity:Knowledge  // Connect to non-Knowledge entities
        
        // Find additional Knowledge nodes connected to these entities
        OPTIONAL MATCH (entity)<-[r2]-(related_k:Knowledge)
        WHERE NOT related_k.id IN $knowledge_ids AND NOT toString(related_k.id) IN $knowledge_ids
              AND related_k.id IS NOT NULL
              
        WITH DISTINCT related_k
        WHERE related_k IS NOT NULL
        
        // Get all entities connected to these additional Knowledge nodes
        OPTIONAL MATCH (related_k)-[:INVENTED_BY]->(inventor:Inventor)
        OPTIONAL MATCH (related_k)-[:ASSIGNED_TO]->(assignee:Assignee)
        OPTIONAL MATCH (related_k)-[:PUBLISHED_BY]->(publisher:Publisher)
        OPTIONAL MATCH (related_k)-[:HAS_CPC]->(cpc:CPC)
        OPTIONAL MATCH (related_k)-[:HAS_IPC]->(ipc:IPC)
        OPTIONAL MATCH (related_k)-[:HAS_KEYWORD]->(keyword:Keyword)
        OPTIONAL MATCH (related_k)-[:IN_SUBDOMAIN]->(subdomain:Subdomain)
        OPTIONAL MATCH (related_k)-[:USES_TECH]->(technology:Technology)
        OPTIONAL MATCH (related_k)-[:WRITTEN_BY]->(author:Author)
        
        WITH related_k,
             collect(DISTINCT inventor.name) AS inventors,
             collect(DISTINCT assignee.name) AS assignees,
             collect(DISTINCT publisher.name) AS publishers,
             collect(DISTINCT cpc.name) AS cpcs,
             collect(DISTINCT ipc.name) AS ipcs,
             collect(DISTINCT keyword.name) AS keywords,
             collect(DISTINCT subdomain.name) AS subdomains,
             collect(DISTINCT technology.name) AS technologies,
             collect(DISTINCT author.name) AS authors
        
        RETURN 
            related_k.id AS id,
            related_k.title AS title,
            COALESCE(related_k.abstract, "No summary available") AS summary_text,
            0.6 AS similarity_score, // Slightly lower score for chained results
            related_k.domain AS domain,
            related_k.knowledge_type AS knowledge_type,
            related_k.publication_date AS publication_date,
            related_k.country AS country,
            related_k.data_quality_score AS data_quality_score,
            inventors AS inventor,
            assignees AS assignee,
            publishers AS publisher,
            cpcs AS cpc,
            ipcs AS ipc,
            keywords AS keyword,
            subdomains AS subdomain,
            technologies AS technology,
            authors AS author
        LIMIT 10
        """
        
        chained_results = self.run_neo4j_query(chain_query, {"knowledge_ids": knowledge_ids})
        
        # Filter out any nodes we've already seen
        new_results = []
        for result in chained_results:
            node_id = result.get('id')
            if node_id and node_id not in visited_nodes:
                visited_nodes.add(node_id)
                new_results.append(result)
                
        return new_results

    def replace_none_with_default(self, data, default_value="N/A"):
        """Recursively replace None values with a default value in nested structures."""
        if isinstance(data, dict):
            return {key: self.replace_none_with_default(value, default_value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self.replace_none_with_default(item, default_value) for item in data]
        elif data is None:
            return default_value
        return data

    def convert_data_to_insights(self, data, prompt):
        """
        Convert Neo4j data into structured insights.
        """
        if not data:
            return {
                "isData": False,
                "insights": [],
                "recommendations": [],
                "relevant_trends": [],
                "message": "No relevant data found in the database.",
                "data_from_source": data,
            }

        # Format trend data for display
        trend_with_scores = []

        for item in data:
            # Only include items with an ID and title
            if 'id' in item and 'title' in item:
                trend_with_scores.append({
                    "title": item.get("title", "No title listed"),
                    "id": item.get("id", "No id"),
                    "knowledge_type": item.get("knowledge_type", "No knowledge type"),
                    "domain": item.get("domain", "No domain specified"),
                    "publication_date": item.get("publication_date", "No publication date"),
                    "data_quality_score": item.get("data_quality_score", 0.0),
                    "similarity_score": round(item.get("similarity_score", 0.0), 4),
                    "country": item.get("country", "No country specified"),
                    "summary_text": item.get("summary_text", "No summary available"),
                    "inventor": item.get("inventor", []),
                    "assignee": item.get("assignee", []),
                    "publisher": item.get("publisher", []),
                    "cpc": item.get("cpc", []),
                    "ipc": item.get("ipc", []),
                    "keyword": item.get("keyword", []),
                    "subdomain": item.get("subdomain", []),
                    "technology": item.get("technology", []),
                    "author": item.get("author", [])
                })

        # Sort by similarity score (highest first)
        trend_with_scores.sort(key=lambda x: x["similarity_score"], reverse=True)
        
        # Extract domains for analysis
        domains = set()
        for trend in trend_with_scores:
            if trend.get("domain") and trend["domain"] != "N/A":
                domains.add(trend["domain"])
        
        # Extract technologies for analysis
        technologies = set()
        for trend in trend_with_scores:
            for tech in trend.get("technology", []):
                if tech and tech != "N/A":
                    technologies.add(tech)
                    
        # Extract keywords for analysis  
        keywords = set()
        for trend in trend_with_scores:
            for kw in trend.get("keyword", []):
                if kw and kw != "N/A":
                    keywords.add(kw)
        
        # Generate insights
        insights = [
            f"Found {len(trend_with_scores)} relevant knowledge items across {len(domains)} domains.",
            f"The most prominent technologies include: {', '.join(list(technologies)[:5])}." if technologies else "No specific technologies identified.",
            f"Common keywords across results: {', '.join(list(keywords)[:5])}." if keywords else "No common keywords identified."
        ]
        
        # Generate recommendations
        recommendations = [
            "Focus research on emerging technologies identified in the results.",
            "Consider cross-domain applications of the identified technologies.",
            "Monitor developments from key inventors and assignees in these domains."
        ]
        
        # Create summary notes
        summary_notes = (
            f"Analysis of {len(trend_with_scores)} knowledge items related to '{prompt}' reveals "
            f"concentrations in {len(domains)} domains. Key technologies identified include "
            f"{', '.join(list(technologies)[:3]) if technologies else 'none specifically mentioned'}. "
            f"The data suggests opportunities for innovation in "
            f"{', '.join(list(domains)[:2]) if domains else 'various fields'}. "
            f"Notable entities to monitor include "
            f"{', '.join(list(set([a for t in trend_with_scores for a in t.get('assignee', [])[:1]]))[:3]) if any(t.get('assignee', []) for t in trend_with_scores) else 'none specifically identified'}."
        )
        
        return {
            "isData": True,
            "insights": insights,
            "recommendations": recommendations,
            "notes": summary_notes,
            "relevant_trends": trend_with_scores,
            "message": "Insights successfully generated.",
            "data_from_source": data,
            "source": "neo4j"
        }

    def process_scout_query(self, data):
        """Processes the scout query using enhanced search with chaining."""
        user_prompt = data.get("prompt")
        if not user_prompt:
            return {"error": "Missing 'prompt' in request"}, 400

        # Keep track of visited nodes across all queries
        visited_nodes = set()

        try:
            # Step 1: Perform the initial enhanced search
            initial_results = self.enhanced_knowledge_search(user_prompt, limit=5)
            
            if not initial_results:
                return {"error": "No relevant data found in the database"}, 404
                
            # Extract knowledge IDs for chaining
            knowledge_ids = [result.get('id') for result in initial_results if result.get('id')]
            
            # Step 2: Perform chain enrichment to find related knowledge
            chained_results = self.chain_enrichment(knowledge_ids, visited_nodes)
            
            # Step 3: Combine initial and chained results
            combined_results = initial_results + chained_results
            
            # Step 4: Remove any duplicates by ID
            unique_results = {}
            for result in combined_results:
                node_id = result.get('id')
                if node_id and node_id not in unique_results:
                    unique_results[node_id] = result
                    
            final_results = list(unique_results.values())

        except Exception as e:
            print(f"⚠️ Search failed: {e}")
            return {"error": f"Search execution failed: {str(e)}"}, 500

        if not final_results:
            return {"error": "No data found"}, 404

        # Replace any None values in the data
        sanitized_results = self.replace_none_with_default(final_results, default_value="N/A")

        # Convert the data to insights
        insights_output = self.convert_data_to_insights(sanitized_results, user_prompt)

        # Replace any None values in the insights data as well
        insights_output = self.replace_none_with_default(insights_output, default_value="N/A")

        insights_output["source"] = "neo4j"
        
        # Ensure proper vector_results format
        if "relevant_trends" in insights_output:
            insights_output["vector_results"] = insights_output["relevant_trends"]
            
        return insights_output, 200