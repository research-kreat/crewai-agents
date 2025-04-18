from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re, math
import os
from dotenv import load_dotenv
import json
from collections import Counter
from nltk.corpus import stopwords
import numpy as np
import requests
from nltk.tokenize import word_tokenize
import time
from flask_socketio import SocketIO

# import nltk
# nltk.download('punkt_tab')
# nltk.download('stopwords')

load_dotenv()

# Initialize Flask-SocketIO - this will be passed from app.py
socketio = None

class ScoutAgent:
    def __init__(self, socket_instance=None):
        global socketio
        socketio = socket_instance
        
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI"), 
            auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD"))
        )

        # Azure OpenAI settings for embeddings
        self.azure_api_base = os.getenv("AZURE_API_BASE")
        self.azure_api_key = os.getenv("AZURE_API_KEY")
        self.azure_api_version = os.getenv("AZURE_API_VERSION")
        self.embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")

        # Vector search config
        self.vector_index_name = os.getenv("VECTOR_INDEX_NAME", "knowledge_embedding")
        
        # KEEP THIS TO "60" TO GET ALL 6O DATAS WE HAVE
        self.num_neighbors = int(os.getenv("NUM_NEIGHBORS", "10"))  # Default to 10 if not specified

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

    def emit_log(self, message):
        """Emits a log message to the client via socket.io"""
        print(f"LOG: {message}")
        if socketio:
            socketio.emit('scout_log', {'message': message})
        
    def _preprocess_text(self, text):
        """
        Preprocess text by removing stopwords and special characters
        """
        self.emit_log("Preprocessing text input...")
        
        # Use NLTK's English stop words
        stop_words = set(stopwords.words('english'))

        # Basic cleaning
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)  # Replace punctuation with space
        
        # Tokenize and remove stop words
        tokens = word_tokenize(text)
        filtered_tokens = [word for word in tokens if word not in stop_words and len(word) > 2]
        
        # Join tokens back into a single string
        preprocessed_text = ' '.join(filtered_tokens)
        
        self.emit_log("Text preprocessing complete")
        return preprocessed_text

    def _get_embeddings(self, text):
        """
        Get embeddings from Azure OpenAI API
        """
        self.emit_log("Generating embeddings for the query...")
        try:
            url = f"{self.azure_api_base}/openai/deployments/{self.embedding_deployment}/embeddings?api-version={self.azure_api_version}"
            headers = {
                "Content-Type": "application/json",
                "api-key": self.azure_api_key
            }
            data = {
                "input": text,
                "encoding_format": "float"
            }
            
            response = requests.post(url, headers=headers, json=data)
            if response.status_code == 200:
                embedding_data = response.json()
                self.emit_log("Embeddings generated successfully")
                return embedding_data["data"][0]["embedding"]
            else:
                error_msg = f"Error getting embeddings: {response.status_code} - {response.text}"
                self.emit_log(f"⚠️ {error_msg}")
                print(f"⚠️ {error_msg}")
                return None
        except Exception as e:
            error_msg = f"Exception while getting embeddings: {str(e)}"
            self.emit_log(f"⚠️ {error_msg}")
            print(f"⚠️ {error_msg}")
            return None

    def vector_knowledge_search(self, prompt, similarity_threshold=0.55):
        """
        Performs a vector-based search in Neo4j using embeddings from the knowledge_embedding index.
        """
        try:
            # Preprocess the prompt
            preprocessed_prompt = self._preprocess_text(prompt)
            
            # Get embeddings for the preprocessed prompt
            query_embedding = self._get_embeddings(preprocessed_prompt)
            
            if not query_embedding:
                self.emit_log("⚠️ Failed to get embeddings for the query")
                print("⚠️ Failed to get embeddings for the query")
                return []
            
            # Convert to list for Neo4j
            query_embedding_list = list(query_embedding)
            
            self.emit_log(f"Querying Neo4j database for relevant knowledge using {self.vector_index_name} index...")
            self.emit_log(f"Searching for nearest neighbors...")
            
            # Neo4j vector search query with correct parameter count
            query = """
            // STEP 1: Perform vector search to find relevant Knowledge nodes
            CALL db.index.vector.queryNodes($index_name, $num_neighbors, $embedding)
            YIELD node, score
            WHERE score >= $threshold
            
            WITH node as k, score as similarity_score

            // STEP 2: Match connected entities to gather more information
            OPTIONAL MATCH (k)-[:ASSIGNED_TO]->(assignee:Assignee)
            OPTIONAL MATCH (k)-[:WRITTEN_BY]->(author:Author)
            OPTIONAL MATCH (k)-[:HAS_CPC]->(cpc:CPC)
            OPTIONAL MATCH (k)-[:INVENTED_BY]->(inventor:Inventor)
            OPTIONAL MATCH (k)-[:HAS_IPC]->(ipc:IPC)
            OPTIONAL MATCH (k)-[:HAS_KEYWORD]->(keyword:Keyword)
            OPTIONAL MATCH (k)-[:PUBLISHED_BY]->(publisher:Publisher)
            OPTIONAL MATCH (k)-[:IN_SUBDOMAIN]->(subdomain:Subdomain)
            OPTIONAL MATCH (k)-[:USES_TECH]->(technology:Technology)

            // STEP 3: Optionally traverse up to 3 hops to find related knowledge nodes
            OPTIONAL MATCH path = (k)-[*1..3]-(related:Knowledge)

            // STEP 4: Build the final response including related knowledge nodes
            RETURN 
                k.id AS id,
                k.title AS title,
                COALESCE(k.abstract, "No summary available") AS summary_text,
                similarity_score,
                k.domain AS domain,
                k.knowledge_type AS knowledge_type,
                k.publication_date AS publication_date,
                k.country AS country,
                k.data_quality_score AS data_quality_score,
                COLLECT(DISTINCT assignee.name) AS assignees,
                COLLECT(DISTINCT author.name) AS authors,
                COLLECT(DISTINCT cpc.name) AS cpcs,
                COLLECT(DISTINCT inventor.name) AS inventors,
                COLLECT(DISTINCT ipc.name) AS ipcs,
                COLLECT(DISTINCT keyword.name) AS keywords,
                COLLECT(DISTINCT publisher.name) AS publishers,
                COLLECT(DISTINCT subdomain.name) AS subdomains,
                COLLECT(DISTINCT technology.name) AS technologies,
                COLLECT(DISTINCT related.title) AS related_titles
            ORDER BY similarity_score DESC
            """
            
            with self.driver.session() as session:
                results = session.run(
                    query, 
                    index_name=self.vector_index_name,
                    num_neighbors=self.num_neighbors,
                    embedding=query_embedding_list,
                    threshold=similarity_threshold
                ).data()

                if not results:
                    self.emit_log("⚠️ No similar results found, trying fallback query...")
                    print("⚠️ No similar results found in Neo4j vector search")
                    # Fallback query to retrieve some Knowledge nodes if no matches found
                    fallback_query = """
                    MATCH (k:Knowledge)
                    WHERE k.data_quality_score IS NOT NULL
                    
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
                        COALESCE(k.abstract, "No summary available") AS summary_text,
                        0.5 AS similarity_score, // fallback confidence
                        k.domain AS domain,
                        k.knowledge_type AS knowledge_type,
                        k.publication_date AS publication_date,
                        k.country AS country,
                        k.data_quality_score AS data_quality_score,
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
                    LIMIT $num_neighbors
                    """
                    results = session.run(fallback_query, num_neighbors=self.num_neighbors).data()

                # Filter out empty arrays and format the results
                formatted_results = []
                for result in results:
                    # Remove empty arrays
                    for key in list(result.keys()):
                        if isinstance(result[key], list) and not result[key]:
                            result[key] = []
                    
                    formatted_results.append(result)
                
                self.emit_log(f"Retrieved relevant knowledge items from database")
                return formatted_results

        except Exception as e:
            error_msg = f"Error performing vector knowledge search in Neo4j: {e}"
            self.emit_log(f"⚠️ {error_msg}")
            print(f"⚠️ {error_msg}")
            return []

    def process_scout_query(self, data):
        """
        Processes a scout query using vector search with embeddings
        """
        self.emit_log("Starting Scout Agent query processing...")
        
        user_prompt = data.get("prompt")
        if not user_prompt:
            self.emit_log("⚠️ Error: Missing prompt in request")
            return {"error": "Missing 'prompt' in request"}, 400

        # Perform vector-based search
        self.emit_log("Initiating vector knowledge search...")
        trend_data = self.vector_knowledge_search(user_prompt)

        if not trend_data:
            error_msg = "No relevant patent or research data was found for your query."
            self.emit_log(f"⚠️ {error_msg}")
            return {
                "error": "No relevant data found",
                "message": error_msg
            }, 404

        # Replace any None values in the data
        self.emit_log("Processing data results...")
        trend_data = self.replace_none_with_default(trend_data, default_value="N/A")

        # Generate insights from the trend data
        self.emit_log("Generating insights from trend data...")
        insights_output = self.convert_data_to_insights(trend_data, user_prompt)

        # Replace any None values in the insights data
        insights_output = self.replace_none_with_default(insights_output, default_value="N/A")
        insights_output["source"] = "neo4j"
        
        self.emit_log("Query processing complete! Sending response...")
        return insights_output, 200
    
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
        self.emit_log("Starting insight generation from trend data...")
        
        if not trend_data:
            self.emit_log("No data found for generating insights")
            return {
                "isData": False,
                "insights": [],
                "recommendations": [],
                "relevant_trends": [],
                "message": "No relevant data found in the database.",
                "data_from_source": trend_data,
            }

        # Format trend data for display
        self.emit_log("Formatting trend data for analysis...")
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
                "technologies": item.get("technologies", []),
                "related_titles": item.get("related_titles", []) 
            })

        # Sort by similarity score (highest first)
        trend_with_scores.sort(key=lambda x: x["similarity_score"], reverse=True)

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
        self.emit_log("Creating trend summary for analysis...")
        trend_summary_for_prompt = ""
        for t in trend_with_scores:
            trend_summary_for_prompt += (
                f"- ID: {t['id']} | Title: {t['title']} | Domain: {t['domain']} | Knowledge Type: {t['knowledge_type']} | "
                f"Publication Date: {t.get('publication_date', 'N/A')} | Quality Score: {t.get('data_quality_score', 'N/A')} | "
                f"Country: {t.get('country', 'N/A')} | Score: {round(t['similarity_score'], 4)}\n"
            )
            
            # Add related entities to the summary
            if t['assignees']:
                trend_summary_for_prompt += f"  Assignees: {', '.join(t['assignees'])}\n"
            if t['inventors']:
                trend_summary_for_prompt += f"  Inventors: {', '.join(t['inventors'])}\n"
            if t['technologies']:
                trend_summary_for_prompt += f"  Technologies: {', '.join(t['technologies'])}\n"
            if t['subdomains']:
                trend_summary_for_prompt += f"  Subdomains: {', '.join(t['subdomains'])}\n"
            if t['keywords']:
                trend_summary_for_prompt += f"  Keywords: {', '.join(t['keywords'])}\n"

        # combines all related_titles into single no duped titles list
        if 'related_titles' in t and t['related_titles']:
            unique_titles = list(dict.fromkeys(t['related_titles']))  # removes dupes while keeping order
            trend_summary_for_prompt += f"  Related_titles: {', '.join(unique_titles)}\n"

        # Create the prompt for generating insights
        self.emit_log("Preparing prompt for LLM analysis...")
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
            agent=self.agent
        )

        # Set up the crew for this task
        self.crew = Crew(
            tasks=[insight_task],
            process=Process.sequential,
            verbose=True
        )

        try:
            # Execute the task
            self.emit_log("Running CrewAI analysis...")
            self.emit_log("Waiting for LLM to analyze the data (this might take a moment)...")
            
            result = self.crew.kickoff(inputs={"prompt": prompt})
            
            self.emit_log("LLM analysis completed")
            
            if not result:
                self.emit_log("⚠️ LLM did not return any structured output")
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
            self.emit_log("Parsing LLM output and formatting response...")
            output_str = str(result).strip()
            try:
                if output_str.startswith("{") and output_str.endswith("}"):
                    parsed_output = json.loads(output_str)
                else:
                    match = re.search(r"({.*})", output_str, re.DOTALL)
                    parsed_output = json.loads(match.group(1)) if match else {}
            except Exception as e:
                error_msg = f"Error parsing LLM output as JSON: {e}"
                self.emit_log(f"⚠️ {error_msg}")
                print(f"⚠️ {error_msg}")
                parsed_output = {}

            # Return the structured insights
            self.emit_log("Analysis complete - returning structured insights")
            return {
                "isData": True,
                "insights": parsed_output.get("insights", []),
                "recommendations": parsed_output.get("recommendations", []),
                "notes": parsed_output.get("notes", ""),
                "trend_summary": parsed_output.get("trend_summary", ""),
                "response_to_user_prompt": parsed_output.get("response_to_user_prompt", ""),
                "relevant_trends": trend_with_scores,
                "trend_summary_raw": trend_summary_for_prompt,
                "message": "Successfully generated insights.",
                "data_from_source": trend_data,
                "source": "neo4j"
            }

        except Exception as e:
            error_msg = f"Failed to generate insights: {str(e)}"
            self.emit_log(f"⚠️ {error_msg}")
            return {
                "isData": True,
                "insights": [],
                "recommendations": [],
                "relevant_trends": trend_with_scores,
                "trend_summary": trend_summary_for_prompt,
                "message": error_msg,
                "data_from_source": trend_data,
                "source": "neo4j"
            }