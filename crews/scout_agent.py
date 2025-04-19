from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re, math
import os
from dotenv import load_dotenv
import json
from collections import Counter
from nltk.corpus import stopwords

load_dotenv()

# import nltk
# nltk.download('stopwords')

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

    def _extract_keywords(self, prompt):
        """Extract relevant keywords from prompt for search purposes"""
        # Use NLTK's English stop words
        stop_words = set(stopwords.words('english'))

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
    
    def comprehensive_knowledge_search(self, prompt, limit=5):
        """
        Performs an enhanced keyword-based search in Neo4j that also retrieves
        all connected nodes for each Knowledge node found.
        """
        try:
            # Extract keywords from prompt
            keywords = self._extract_keywords(prompt)
            if not keywords:
                print("⚠️ No keywords extracted from prompt")
                return []
                
            # Build a keyword-based query that also retrieves all connected nodes
            query = """
            // Find Knowledge nodes that match keywords in title, abstract, or domain
            MATCH (k:Knowledge)
            WHERE 
            ANY(keyword IN $keywords WHERE toLower(k.title) CONTAINS toLower(keyword))
            OR ANY(keyword IN $keywords WHERE k.abstract IS NOT NULL AND toLower(k.abstract) CONTAINS toLower(keyword))
            OR ANY(keyword IN $keywords WHERE k.domain IS NOT NULL AND toLower(k.domain) CONTAINS toLower(keyword))
            
            // Calculate similarity_score
            WITH k, 
                size([keyword IN $keywords WHERE 
                    toLower(k.title) CONTAINS toLower(keyword) OR 
                    (k.abstract IS NOT NULL AND toLower(k.abstract) CONTAINS toLower(keyword)) OR
                    (k.domain IS NOT NULL AND toLower(k.domain) CONTAINS toLower(keyword))
                ]) AS matches,
                size($keywords) AS total_keywords
            WITH k, (1.0 * matches / total_keywords) AS similarity_score
            WHERE similarity_score > 0.2
            
            // Find all connected nodes with a single pattern
            OPTIONAL MATCH (k)-[:ASSIGNED_TO]->(assignee:Assignee)
            OPTIONAL MATCH (k)-[:WRITTEN_BY]->(author:Author)
            OPTIONAL MATCH (k)-[:HAS_CPC]->(cpc:CPC)
            OPTIONAL MATCH (k)-[:INVENTED_BY]->(inventor:Inventor)
            OPTIONAL MATCH (k)-[:HAS_IPC]->(ipc:IPC)
            OPTIONAL MATCH (k)-[:HAS_KEYWORD]->(keyword:Keyword)
            OPTIONAL MATCH (k)-[:PUBLISHED_BY]->(publisher:Publisher)
            OPTIONAL MATCH (k)-[:IN_SUBDOMAIN]->(subdomain:Subdomain)
            OPTIONAL MATCH (k)-[:USES_TECH]->(technology:Technology)
            
            // Return all node data
            RETURN 
                k.id AS id,
                k.title AS title,
                COALESCE(k.abstract, "No summary available") AS summary_text,
                similarity_score AS similarity_score,
                k.domain AS domain,
                k.knowledge_type AS knowledge_type,
                k.publication_date AS publication_date,
                k.country AS country,
                k.data_quality_score AS data_quality_score,
                // Return connected node names as arrays
                COLLECT(DISTINCT assignee.name) AS assignees,
                COLLECT(DISTINCT author.name) AS authors,
                COLLECT(DISTINCT cpc.name) AS cpcs,
                COLLECT(DISTINCT inventor.name) AS inventors,
                COLLECT(DISTINCT ipc.name) AS ipcs,
                COLLECT(DISTINCT keyword.name) AS keywords,
                COLLECT(DISTINCT publisher.name) AS publishers,
                COLLECT(DISTINCT subdomain.name) AS subdomains,
                COLLECT(DISTINCT technology.name) AS technologies
            ORDER BY similarity_score DESC
            LIMIT $limit
            """

            with self.driver.session() as session:
                results = session.run(query, keywords=keywords, limit=limit).data()
                
                if not results:
                    print("⚠️ No similar trends found in Neo4j keyword search")
                    # Fallback to get some Knowledge nodes if no keyword matches
                    fallback_query = """
                    MATCH (k:Knowledge)
                    
                    // Retrieve all connected entities
                    OPTIONAL MATCH (k)-[:ASSIGNED_TO]->(assignee:Assignee)
                    OPTIONAL MATCH (k)-[:WRITTEN_BY]->(author:Author)
                    OPTIONAL MATCH (k)-[:HAS_CPC]->(cpc:CPC)
                    OPTIONAL MATCH (k)-[:INVENTED_BY]->(inventor:Inventor)
                    OPTIONAL MATCH (k)-[:HAS_IPC]->(ipc:IPC)
                    OPTIONAL MATCH (k)-[:HAS_KEYWORD]->(keyword:Keyword)
                    OPTIONAL MATCH (k)-[:PUBLISHED_BY]->(publisher:Publisher)
                    OPTIONAL MATCH (k)-[:IN_SUBDOMAIN]->(subdomain:Subdomain)
                    OPTIONAL MATCH (k)-[:USES_TECH]->(technology:Technology)
                    
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
                        // Return connected node names as arrays
                        COLLECT(DISTINCT assignee.name) AS assignees,
                        COLLECT(DISTINCT author.name) AS authors,
                        COLLECT(DISTINCT cpc.name) AS cpcs,
                        COLLECT(DISTINCT inventor.name) AS inventors,
                        COLLECT(DISTINCT ipc.name) AS ipcs,
                        COLLECT(DISTINCT keyword.name) AS keywords,
                        COLLECT(DISTINCT publisher.name) AS publishers,
                        COLLECT(DISTINCT subdomain.name) AS subdomains,
                        COLLECT(DISTINCT technology.name) AS technologies
                    ORDER BY k.data_quality_score DESC
                    LIMIT 5
                    """

                    results = session.run(fallback_query).data()
                    
                # Filter out empty arrays and format the results
                formatted_results = []
                for result in results:
                    # Remove empty arrays
                    for key in list(result.keys()):
                        if isinstance(result[key], list) and not result[key]:
                            result[key] = []
                    
                    formatted_results.append(result)
                
                return formatted_results
                
        except Exception as e:
            print(f"⚠️ Error performing comprehensive knowledge search in Neo4j: {e}")
            return []

    def replace_none_with_default(self, data, default_value="N/A"):
        """Recursively replace None values with a default value in nested structures."""
        if isinstance(data, dict):
            return {key: self.replace_none_with_default(value, default_value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self.replace_none_with_default(item, default_value) for item in data]
        elif data is None:
            return default_value
        return data

    def convert_data_to_insights(self, trend_data, prompt):
        """
        Convert trend data into structured insights using CrewAI.
        """
        if not trend_data:
            return {
                "isData": False,
                "insights": [],
                "recommendations": [],
                "relevant_trends": [],
                "message": "No relevant data found in the database.",
                "data_from_source": trend_data,
            }

        # Format trend data for display
        trend_with_scores = []
        
        for item in trend_data:
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
                "assignees": item.get("assignees", []),
                "authors": item.get("authors", []),
                "cpcs": item.get("cpcs", []),
                "inventors": item.get("inventors", []),
                "ipcs": item.get("ipcs", []),
                "keywords": item.get("keywords", []),
                "publishers": item.get("publishers", []),
                "subdomains": item.get("subdomains", []),
                "technologies": item.get("technologies", [])
            })

        # Sort by similarity score (highest first)
        trend_with_scores.sort(key=lambda x: x["similarity_score"], reverse=True)
        print("[trend_with_scores]", trend_with_scores)

        # Extract all domains from the data
        domains = set()
        for obj in trend_data:
            if isinstance(obj, dict) and "domain" in obj and obj["domain"]:
                domains.add(obj["domain"])

        # Prepare the crew inputs
        crew_inputs = {
            "domains": list(domains) or ["No domain data detected"],
            "num_records": len(trend_data),
            "trend_matches": trend_with_scores 
        }

        # Create a detailed trend summary for the prompt
        trend_summary_for_prompt = ""
        for t in trend_with_scores[:5]:
            trend_summary_for_prompt += (
                f"- ID: {t['id']} | Title: {t['title']} | Domain: {t['domain']} | Knowledge Type: {t['knowledge_type']} | "
                f"Publication Date: {t.get('publication_date', 'N/A')} | Quality Score: {t.get('data_quality_score', 'N/A')} | "
                f"Country: {t.get('country', 'N/A')} | Score: {round(t['similarity_score'], 4)}\n"
            )
            
            # Add related entities to the summary
            if t['assignees']:
                trend_summary_for_prompt += f"  Assignees: {', '.join(t['assignees'][:5])}\n"
            if t['inventors']:
                trend_summary_for_prompt += f"  Inventors: {', '.join(t['inventors'][:5])}\n"
            if t['technologies']:
                trend_summary_for_prompt += f"  Technologies: {', '.join(t['technologies'][:5])}\n"
            if t['subdomains']:
                trend_summary_for_prompt += f"  Subdomains: {', '.join(t['subdomains'][:5])}\n"
            if t['keywords']:
                trend_summary_for_prompt += f"  Keywords: {', '.join(t['keywords'][:5])}\n"
            
            trend_summary_for_prompt += "\n"

        print("[trend_summary_for_prompt]: ",trend_summary_for_prompt)

        # Create the prompt for generating insights
        prompt_for_insights = (
            "Act as a data strategy analyst.\n\n"
            f"Records matched: {crew_inputs['num_records']}\n"
            f"Domains: {', '.join(crew_inputs['domains'])}\n\n"
            "Trend Summary:\n"
            f"{trend_summary_for_prompt}\n\n"
            f"Based on User Query:\n\"{prompt}\"\n"
            "Do these tasks:\n"
            "1. Extract 3-5 key **insights** from trends.\n"
            "2. Suggest 2-3 **strategic recommendations**.\n"
            "3. Provide a short **trend landscape summary**.\n"
            "4. Write a 300-word **narrative note** blending trends, insights, and actions.\n"
            "5. Generate a **response_to_user_prompt**: a brief, user-facing answer directly addressing the prompt.\n\n"
            "Output format: JSON with keys: insights, recommendations, trend_summary, notes, response_to_user_prompt."
        )

        # Create the task for generating insights
        insight_task = Task(
            description=prompt_for_insights,
            expected_output=(
                "Return structured JSON with keys: "
                "'insights' (list of strings), "
                "'recommendations' (list of strings), "
                "'trend_summary' (string), "
                "'notes' (string), "
                "'response_to_user_prompt' (string)."
            ),
            agent=self.agent,
        )

        # Set up the crew for this task
        self.crew = Crew(
            tasks=[insight_task],
        )

        try:
            # Execute the task
            result = self.crew.kickoff(inputs={"prompt": prompt})
            if not result:
                return {
                    "isData": True,
                    "insights": [],
                    "recommendations": [],
                    "relevant_trends": trend_with_scores,
                    "trend_summary": trend_summary_for_prompt,
                    "message": "LLM did not return any structured output.",
                    "data_from_source": trend_data,
                }

            # Parse the output from the LLM
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

            # Return the structured insights
            return {
                "isData": True,
                "insights": parsed_output.get("insights", []),
                "recommendations": parsed_output.get("recommendations", []),
                "notes": parsed_output.get("notes", ""),
                "response_to_user_prompt": parsed_output.get("response_to_user_prompt", ""),
                "relevant_trends": trend_with_scores,
                "trend_summary": trend_summary_for_prompt,
                "message": "Successfully generated.",
                "data_from_source": trend_data,
                "source": "neo4j"
            }

        except Exception as e:
            return {
                "isData": True,
                "insights": [],
                "recommendations": [],
                "relevant_trends": trend_with_scores,
                "trend_summary": trend_summary_for_prompt,
                "message": f"Failed to generate insights: {str(e)}",
                "data_from_source": trend_data,
                "source": "neo4j"
            }

    def process_scout_query(self, data):
        """
        Processes a scout query using optimized direct retrieval 
        of knowledge data with all connected entities.
        """
        user_prompt = data.get("prompt")
        if not user_prompt:
            return {"error": "Missing 'prompt' in request"}, 400

        # Perform comprehensive search with all connected entities
        trend_data = self.comprehensive_knowledge_search(user_prompt, limit=10)

        if not trend_data:
            return {
                "error": "No relevant data found",
                "message": "No relevant patent or research data was found for your query."
            }, 404

        # Replace any None values in the data
        trend_data = self.replace_none_with_default(trend_data, default_value="N/A")

        # Generate insights from the trend data
        insights_output = self.convert_data_to_insights(trend_data, user_prompt)

        # Replace any None values in the insights data
        insights_output = self.replace_none_with_default(insights_output, default_value="N/A")
        insights_output["source"] = "neo4j"

        return insights_output, 200