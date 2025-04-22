from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import re, os, json
from dotenv import load_dotenv
import requests
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize

load_dotenv()

class ScoutAgent:
    def __init__(self, socket_instance=None):
        self.socketio = socket_instance
        
        # Neo4j connection setup
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI"), 
            auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD"))
        )

        # Azure OpenAI settings
        self.azure_api_base = os.getenv("AZURE_API_BASE")
        self.azure_api_key = os.getenv("AZURE_API_KEY")
        self.azure_api_version = os.getenv("AZURE_API_VERSION")
        self.embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")
        
        # Configuration
        self.vector_index_name = os.getenv("VECTOR_INDEX_NAME", "knowledge_embedding")
        self.num_neighbors = int(os.getenv("NUM_NEIGHBORS", "10"))
        
        # Initialize Agent
        self.agent = Agent(
            role="Database Scout",
            goal="Extract valuable insights from the database",
            backstory="You're a specialized agent for scouting and analyzing patent and knowledge data.",
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
        if self.socketio:
            self.socketio.emit('scout_log', {'message': message})
        
    def _preprocess_text(self, text):
        """Preprocess text by removing stopwords and special characters"""
        self.emit_log("Preprocessing text input...")
        
        # Basic cleaning
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        
        # Remove stopwords
        stop_words = set(stopwords.words('english'))
        tokens = word_tokenize(text)
        filtered_tokens = [word for word in tokens if word not in stop_words and len(word) > 2]
        
        self.emit_log("Text preprocessing complete")
        return ' '.join(filtered_tokens)

    def _get_embeddings(self, text):
        """Get embeddings from Azure OpenAI API"""
        self.emit_log("Generating embeddings for the query...")
        try:
            url = f"{self.azure_api_base}/openai/deployments/{self.embedding_deployment}/embeddings?api-version={self.azure_api_version}"
            response = requests.post(
                url, 
                headers={
                    "Content-Type": "application/json",
                    "api-key": self.azure_api_key
                },
                json={
                    "input": text,
                    "encoding_format": "float"
                }
            )
            
            if response.status_code == 200:
                self.emit_log("Embeddings generated successfully")
                return response.json()["data"][0]["embedding"]
            else:
                error_msg = f"Error getting embeddings: {response.status_code} - {response.text}"
                self.emit_log(f"⚠️ {error_msg}")
                return None
        except Exception as e:
            self.emit_log(f"⚠️ Exception while getting embeddings: {str(e)}")
            return None

    def vector_knowledge_search(self, prompt, similarity_threshold=0.55):
        """Performs a vector-based search in Neo4j using embeddings"""
        try:
            preprocessed_prompt = self._preprocess_text(prompt)
            query_embedding = self._get_embeddings(preprocessed_prompt)
            
            if not query_embedding:
                self.emit_log("⚠️ Failed to get embeddings for the query")
                return []
            
            self.emit_log(f"Querying Neo4j database using {self.vector_index_name} index...")
            
            # Vector search query
            query = """
            // STEP 1: Perform vector search
            CALL db.index.vector.queryNodes($index_name, $num_neighbors, $embedding)
            YIELD node, score
            WHERE score >= $threshold
            
            WITH node as k, score as similarity_score

            // STEP 2: Match connected entities
            OPTIONAL MATCH (k)-[:ASSIGNED_TO]->(assignee:Assignee)
            OPTIONAL MATCH (k)-[:WRITTEN_BY]->(author:Author)
            OPTIONAL MATCH (k)-[:HAS_CPC]->(cpc:CPC)
            OPTIONAL MATCH (k)-[:INVENTED_BY]->(inventor:Inventor)
            OPTIONAL MATCH (k)-[:HAS_IPC]->(ipc:IPC)
            OPTIONAL MATCH (k)-[:HAS_KEYWORD]->(keyword:Keyword)
            OPTIONAL MATCH (k)-[:PUBLISHED_BY]->(publisher:Publisher)
            OPTIONAL MATCH (k)-[:IN_SUBDOMAIN]->(subdomain:Subdomain)
            OPTIONAL MATCH (k)-[:USES_TECH]->(technology:Technology)

            // STEP 3: Find related knowledge nodes
            OPTIONAL MATCH path = (k)-[*1..3]-(related:Knowledge)

            // STEP 4: Build response
            RETURN 
                k.id AS id,
                k.title AS title,
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
                    embedding=list(query_embedding),
                    threshold=similarity_threshold
                ).data()

                if not results:
                    self.emit_log("⚠️ No similar results found, trying fallback query...")
                    
                    # Fallback query
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
                        0.5 AS similarity_score,
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

                # Format results
                formatted_results = []
                for result in results:
                    # Remove empty arrays
                    for key in list(result.keys()):
                        if isinstance(result[key], list) and not result[key]:
                            result[key] = []
                    
                    formatted_results.append(result)
                
                self.emit_log(f"Retrieved {len(formatted_results)} relevant knowledge items")
                return formatted_results

        except Exception as e:
            self.emit_log(f"⚠️ Error in vector knowledge search: {e}")
            return []

    def process_scout_query(self, data):
        """Process a scout query using vector search with embeddings"""
        self.emit_log("Starting Scout Agent query processing...")
        
        user_prompt = data.get("prompt")
        if not user_prompt:
            self.emit_log("⚠️ Error: Missing prompt in request")
            return {"error": "Missing 'prompt' in request"}, 400

        # Perform vector search
        trend_data = self.vector_knowledge_search(user_prompt)

        if not trend_data:
            error_msg = "No relevant patent or research data was found for your query."
            self.emit_log(f"⚠️ {error_msg}")
            return {
                "error": "No relevant data found",
                "message": error_msg
            }, 404

        # Process data and generate insights
        self.emit_log("Processing data and generating insights...")
        trend_data = self.replace_none_with_default(trend_data)
        insights_output = self.convert_data_to_insights(trend_data, user_prompt)
        
        insights_output = self.replace_none_with_default(insights_output)
        insights_output["source"] = "neo4j"
        
        self.emit_log("Query processing complete!")
        return insights_output, 200
    
    def replace_none_with_default(self, data, default_value="N/A"):
        """Replace None values with a default value in nested structures"""
        if isinstance(data, dict):
            return {key: self.replace_none_with_default(value, default_value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self.replace_none_with_default(item, default_value) for item in data]
        elif data is None:
            return default_value
        return data

    def convert_data_to_insights(self, trend_data, prompt):
        """Convert trend data to structured insights using CrewAI"""
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
        domains = {obj.get("domain") for obj in trend_data if isinstance(obj, dict) and obj.get("domain")}

        # Create trend summary for the prompt
        trend_summary_for_prompt = ""
        for t in trend_with_scores:
            trend_summary_for_prompt += (
                f"- ID: {t['id']} | Title: {t['title']} | Domain: {t['domain']} | "
                f"Knowledge Type: {t['knowledge_type']} | Publication Date: {t.get('publication_date', 'N/A')} | "
                f"Quality Score: {t.get('data_quality_score', 'N/A')} | Country: {t.get('country', 'N/A')} | "
                f"Score: {round(t['similarity_score'], 4)}\n"
            )
            
            for category, items in [
                ("Assignees", t['assignees']),
                ("Inventors", t['inventors']),
                ("Technologies", t['technologies']),
                ("Subdomains", t['subdomains']),
                ("Keywords", t['keywords'])
            ]:
                if items:
                    trend_summary_for_prompt += f"  {category}: {', '.join(items)}\n"

            # Add related titles (deduped)
            if t.get('related_titles'):
                unique_titles = list(dict.fromkeys(t['related_titles']))
        trend_summary_for_prompt += f"  Related_titles: {', '.join(unique_titles[:10])}\n"

        # Create prompt for generating insights
        self.emit_log("Preparing prompt for LLM analysis...")
        prompt_for_insights = (
            "Act as a data strategy analyst.\n\n"
            f"Records matched: {len(trend_data)}\n"
            f"Domains: {', '.join(domains or ['No domain data detected'])}\n\n"
            "Trend Summary:\n"
            f"{trend_summary_for_prompt}\n\n"
            f"Based on User Query:\n\"{prompt}\"\n"
            "Do these tasks:\n"
            "1. Extract 3-5 key **insights** from trends.\n"
            "2. Suggest 2-3 **strategic recommendations**.\n"
            "3. Write a 300-word **narrative note** blending insights, and actions.\n"
            "4. Generate a **response_to_user_prompt**: a brief, user-facing answer directly addressing the prompt.\n\n"
            "Output format: JSON with keys: insights, recommendations, notes, response_to_user_prompt."
        )

        # Create task and run the crew
        insight_task = Task(
            description=prompt_for_insights,
            expected_output="Return structured JSON with keys: 'insights', 'recommendations', 'notes', 'response_to_user_prompt'.",
            agent=self.agent
        )

        self.crew = Crew(
            tasks=[insight_task],
            process=Process.sequential,
            verbose=True
        )

        try:
            self.emit_log("Running CrewAI analysis...")
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
                self.emit_log(f"⚠️ Error parsing LLM output as JSON: {e}")
                parsed_output = {}

            # Return structured insights
            self.emit_log("Analysis complete - returning structured insights")
            return {
                "isData": True,
                "insights": parsed_output.get("insights", []),
                "recommendations": parsed_output.get("recommendations", []),
                "notes": parsed_output.get("notes", ""),
                "trend_summary": trend_summary_for_prompt,
                "response_to_user_prompt": parsed_output.get("response_to_user_prompt", ""),
                "relevant_trends": trend_with_scores,
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