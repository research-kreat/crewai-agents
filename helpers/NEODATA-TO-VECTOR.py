from neo4j import GraphDatabase
import os
from dotenv import load_dotenv
import requests

load_dotenv()

def setup_vector_index():
    """
    Set up Neo4j vector index for knowledge embeddings
    """
    # Neo4j connection parameters
    NEO4J_URI = os.getenv("NEO4J_URI")
    NEO4J_USER = os.getenv("NEO4J_USERNAME")
    NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
    
    # Azure OpenAI settings
    AZURE_API_BASE = os.getenv("AZURE_API_BASE")
    AZURE_API_KEY = os.getenv("AZURE_API_KEY")
    AZURE_API_VERSION = os.getenv("AZURE_API_VERSION")
    EMBEDDING_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")
    
    # Connect to Neo4j
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    
    try:
        with driver.session() as session:
            # Check if vector index already exists
            check_query = "SHOW INDEXES WHERE name = 'knowledge_embedding'"
            result = session.run(check_query).data()
            
            if not result:
                print("Creating vector index for Knowledge nodes...")
                
                # Create property for storing embeddings if it doesn't exist yet
                session.run("""
                MATCH (k:Knowledge) 
                WHERE k.embedding IS NULL
                SET k.embedding = []
                """)
                
                # Create vector index (adjust dimension size based on your embedding model)
                # text-embedding-3-small is 1536 dimensions
                session.run("""
                CREATE VECTOR INDEX knowledge_embedding IF NOT EXISTS
                FOR (k:Knowledge) ON (k.embedding)
                OPTIONS {indexConfig: {
                  `vector.dimensions`: 1536,
                  `vector.similarity_function`: 'cosine'
                }}
                """)
                print("Vector index created successfully.")
            else:
                print("Vector index already exists.")

            # Function to get embeddings from Azure OpenAI
            def get_embedding(text):
                url = f"{AZURE_API_BASE}/openai/deployments/{EMBEDDING_DEPLOYMENT}/embeddings?api-version={AZURE_API_VERSION}"
                headers = {
                    "Content-Type": "application/json",
                    "api-key": AZURE_API_KEY
                }
                data = {
                    "input": text,
                    "encoding_format": "float"
                }
                
                response = requests.post(url, headers=headers, json=data)
                if response.status_code == 200:
                    embedding_data = response.json()
                    return embedding_data["data"][0]["embedding"]
                else:
                    print(f"Error getting embeddings: {response.status_code} - {response.text}")
                    return None

            # Update knowledge nodes with embeddings (process in batches)
            batch_size = 100
            offset = 0
            
            while True:
                # Get a batch of Knowledge nodes without embeddings
                query = """
                MATCH (k:Knowledge)
                WHERE k.embedding IS NULL OR k.embedding = []
                RETURN k.id AS id, k.title AS title, k.name AS name, k.domain AS domain
                LIMIT $batch_size
                """
                
                nodes = session.run(query, batch_size=batch_size).data()
                
                if not nodes:
                    print("All nodes have embeddings. ✅")
                    break
                    
                print(f"Processing batch of {len(nodes)} nodes...")
                
                for node in nodes:
                    # Use only allowed properties for embedding text
                    title = node.get("title", "")
                    name = node.get("name", "")
                    domain = node.get("domain", "")
                    
                    # Combine for better context
                    text_to_embed = f"{title}. {name}. {domain}".strip()
                        
                    # Get embeddings
                    embeddings = get_embedding(text_to_embed)
                    
                    if embeddings:
                        # Update node with embeddings
                        update_query = """
                        MATCH (k:Knowledge {id: $id})
                        SET k.embedding = $embeddings
                        """
                        session.run(update_query, id=node["id"], embeddings=embeddings)
                        print(f"✅ Updated embeddings for node {node['id']}")
                    else:
                        print(f"❌ Failed to get embeddings for node {node['id']}")
                
                offset += batch_size
                
    except Exception as e:
        print(f"❌ Error setting up vector index: {e}")
    finally:
        driver.close()

if __name__ == "__main__":
    setup_vector_index()
