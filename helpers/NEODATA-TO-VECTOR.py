from neo4j import GraphDatabase
import os
from dotenv import load_dotenv
import requests

load_dotenv()

def setup_vector_index():
    """Set up Neo4j vector index for knowledge embeddings"""
    # Configure connection parameters
    neo4j_uri = os.getenv("NEO4J_URI")
    neo4j_user = os.getenv("NEO4J_USERNAME")
    neo4j_password = os.getenv("NEO4J_PASSWORD")
    
    # Azure OpenAI settings
    azure_api_base = os.getenv("AZURE_API_BASE")
    azure_api_key = os.getenv("AZURE_API_KEY")
    azure_api_version = os.getenv("AZURE_API_VERSION")
    embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")
    
    # Connect to Neo4j
    driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
    
    try:
        with driver.session() as session:
            # Check if index exists
            result = session.run("SHOW INDEXES WHERE name = 'knowledge_embedding'").data()
            
            if not result:
                print("Creating vector index for Knowledge nodes...")
                
                # Create embedding property if needed
                session.run("MATCH (k:Knowledge) WHERE k.embedding IS NULL SET k.embedding = []")
                
                # Create vector index
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

            def get_embedding(text):
                """Get embeddings from Azure OpenAI"""
                url = f"{azure_api_base}/openai/deployments/{embedding_deployment}/embeddings?api-version={azure_api_version}"
                response = requests.post(
                    url, 
                    headers={
                        "Content-Type": "application/json",
                        "api-key": azure_api_key
                    },
                    json={
                        "input": text,
                        "encoding_format": "float"
                    }
                )
                
                if response.status_code == 200:
                    return response.json()["data"][0]["embedding"]
                else:
                    print(f"Error getting embeddings: {response.status_code} - {response.text}")
                    return None

            # Process nodes in batches
            batch_size = 100
            offset = 0
            
            while True:
                # Get batch of nodes without embeddings
                nodes = session.run("""
                MATCH (k:Knowledge)
                WHERE k.embedding IS NULL OR k.embedding = []
                RETURN k.id AS id, k.title AS title, k.name AS name, k.domain AS domain
                LIMIT $batch_size
                """, batch_size=batch_size).data()
                
                if not nodes:
                    print("All nodes have embeddings. ✅")
                    break
                    
                print(f"Processing batch of {len(nodes)} nodes...")
                
                for node in nodes:
                    # Create text for embedding
                    title = node.get("title", "")
                    name = node.get("name", "")
                    domain = node.get("domain", "")
                    text_to_embed = f"{title}. {name}. {domain}".strip()
                    
                    # Get and update embeddings
                    embeddings = get_embedding(text_to_embed)
                    if embeddings:
                        session.run("""
                        MATCH (k:Knowledge {id: $id})
                        SET k.embedding = $embeddings
                        """, id=node["id"], embeddings=embeddings)
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