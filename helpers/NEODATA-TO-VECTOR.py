from neo4j import GraphDatabase
import os
from dotenv import load_dotenv
import requests
import hashlib
from tqdm import tqdm
import time

load_dotenv()

def setup_vector_index():
    """Set up Neo4j vector index for knowledge embeddings with batch processing"""
    # Configure connection parameters
    neo4j_uri = os.getenv("NEO4J_URI")
    neo4j_user = os.getenv("NEO4J_USERNAME")
    neo4j_password = os.getenv("NEO4J_PASSWORD")
    
    # Azure OpenAI settings
    azure_api_base = os.getenv("AZURE_API_BASE")
    azure_api_key = os.getenv("AZURE_API_KEY")
    azure_api_version = os.getenv("AZURE_API_VERSION")
    embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")
    
    # Batch processing settings
    BATCH_SIZE = 100  # Neo4j batch size
    EMBEDDING_BATCH_SIZE = 20  # Number of texts to embed in a single API call
    
    # Connect to Neo4j
    driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
    
    # Create embedding cache
    embedding_cache = {}
    
    try:
        with driver.session() as session:
            # Check if index exists
            result = session.run("SHOW INDEXES WHERE name = 'knowledge_embedding'").data()
            
            if not result:
                print("Creating vector index for Knowledge nodes...")
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
            
            # Count total nodes needing embeddings
            total_nodes = session.run("""
            MATCH (k:Knowledge)
            WHERE k.embedding IS NULL OR size(k.embedding) = 0
            RETURN count(k) as count
            """).single()["count"]
            
            print(f"Found {total_nodes} nodes that need embeddings")
            
            # Find existing embeddings for content hash to avoid regenerating
            print("Building embedding cache based on content hashes...")
            result = session.run("""
            MATCH (k:Knowledge)
            WHERE k.embedding IS NOT NULL AND size(k.embedding) > 0 AND k.content_hash IS NOT NULL
            RETURN k.content_hash AS hash, k.embedding AS embedding
            """)
            
            for record in result:
                if record["hash"] and record["embedding"]:
                    embedding_cache[record["hash"]] = record["embedding"]
            
            print(f"Loaded {len(embedding_cache)} existing embeddings into cache")

            def get_batch_embeddings(texts_with_ids):
                """Get embeddings for a batch of texts from Azure OpenAI"""
                if not texts_with_ids:
                    return []
                
                # Extract just the texts for the API call
                texts = [item["text"] for item in texts_with_ids]
                
                # Compute content hashes
                for item in texts_with_ids:
                    item["hash"] = hashlib.md5(item["text"].encode()).hexdigest()
                
                # Check which texts need to be embedded (not in cache)
                texts_to_embed = []
                indices_to_embed = []
                
                for i, item in enumerate(texts_with_ids):
                    if item["hash"] in embedding_cache:
                        # Use cached embedding
                        item["embedding"] = embedding_cache[item["hash"]]
                    else:
                        # Need to get from API
                        texts_to_embed.append(item["text"])
                        indices_to_embed.append(i)
                
                # If all embeddings are in cache, return early
                if not texts_to_embed:
                    return texts_with_ids
                
                # Get embeddings from API
                url = f"{azure_api_base}/openai/deployments/{embedding_deployment}/embeddings?api-version={azure_api_version}"
                try:
                    response = requests.post(
                        url, 
                        headers={
                            "Content-Type": "application/json",
                            "api-key": azure_api_key
                        },
                        json={
                            "input": texts_to_embed,
                            "encoding_format": "float"
                        },
                        timeout=30  # Add timeout to prevent hanging
                    )
                    
                    if response.status_code == 200:
                        # Get embeddings from response
                        embeddings = [data["embedding"] for data in response.json()["data"]]
                        
                        # Assign embeddings to original items and update cache
                        for i, embedding in zip(indices_to_embed, embeddings):
                            texts_with_ids[i]["embedding"] = embedding
                            embedding_cache[texts_with_ids[i]["hash"]] = embedding
                    else:
                        print(f"Error getting embeddings: {response.status_code} - {response.text}")
                        # Mark items that failed with empty embeddings
                        for i in indices_to_embed:
                            texts_with_ids[i]["embedding"] = []
                except Exception as e:
                    print(f"Exception during API call: {e}")
                    # Mark all items that we tried to embed as failed
                    for i in indices_to_embed:
                        texts_with_ids[i]["embedding"] = []
                
                return texts_with_ids

            # Process nodes in batches with progress bar
            processed = 0
            
            with tqdm(total=total_nodes, desc="Processing nodes") as pbar:
                while processed < total_nodes:
                    # Retrieve nodes with all properties using RETURN k
                    nodes_result = session.run("""
                    MATCH (k:Knowledge)
                    WHERE k.embedding IS NULL OR size(k.embedding) = 0
                    RETURN k, k.id AS id
                    LIMIT $batch_size
                    """, batch_size=BATCH_SIZE).data()
                    
                    if not nodes_result:
                        break
                    
                    # Prepare texts for embedding
                    texts_with_ids = []
                    
                    for record in nodes_result:
                        if "id" not in record:
                            print("Warning: Node without ID encountered, skipping")
                            pbar.update(1)
                            processed += 1
                            continue
                        
                        node_id = record["id"]
                        node = record["k"]  # Get the full node
                        
                        # Get all available properties from the node
                        props = dict(node)
                        
                        # Extract text content from available properties
                        text_parts = []
                        
                        # Check each property that might contain useful text
                        # Priority: title, description/summary, other fields
                        if "title" in props:
                            text_parts.append(str(props["title"]))
                        
                        # Try different description fields
                        for desc_field in ["description_text", "description", "summary_text", "summary", "abstract"]:
                            if desc_field in props and props[desc_field]:
                                text_content = str(props[desc_field])
                                # Limit length for very long descriptions
                                if len(text_content) > 1000:
                                    text_content = text_content[:1000]
                                text_parts.append(text_content)
                                break  # Only use one description field
                        
                        # Add domain info if available
                        if "domain" in props:
                            text_parts.append(str(props["domain"]))
                        
                        # Combine all text parts
                        text_to_embed = ". ".join([part for part in text_parts if part]).strip()
                        
                        # If no text was found, try to use any string properties as fallback
                        if not text_to_embed:
                            fallback_parts = []
                            for key, value in props.items():
                                # Skip non-string properties and embedding/hash fields
                                if isinstance(value, str) and key not in ["id", "embedding", "content_hash"]:
                                    fallback_parts.append(f"{key}: {value}")
                            
                            if fallback_parts:
                                text_to_embed = ". ".join(fallback_parts)
                        
                        # Skip if text is still too short
                        if len(text_to_embed) < 10:
                            print(f"⚠️ Node {node_id} has insufficient text for embedding. Using ID as text.")
                            # Use ID as fallback text
                            text_to_embed = f"Document ID: {node_id}"
                        
                        texts_with_ids.append({
                            "id": node_id,
                            "text": text_to_embed
                        })
                    
                    # Process in smaller sub-batches for embedding API
                    for i in range(0, len(texts_with_ids), EMBEDDING_BATCH_SIZE):
                        sub_batch = texts_with_ids[i:i+EMBEDDING_BATCH_SIZE]
                        
                        # Get embeddings for the sub-batch
                        processed_items = get_batch_embeddings(sub_batch)
                        
                        # Update nodes in database with embeddings
                        for item in processed_items:
                            if "embedding" in item and item["embedding"]:
                                session.run("""
                                MATCH (k:Knowledge {id: $id})
                                SET k.embedding = $embedding, k.content_hash = $hash
                                """, id=item["id"], embedding=item["embedding"], hash=item["hash"])
                                print(f"✅ Updated embedding for node {item['id']}")
                            else:
                                print(f"❌ Failed to get embedding for node {item['id']}")
                            
                            pbar.update(1)
                            processed += 1
                        
                        # Short delay to avoid API rate limits if needed
                        time.sleep(0.5)
                
            print("All nodes have embeddings. ✅")
                
    except Exception as e:
        print(f"❌ Error setting up vector index: {e}")
    finally:
        driver.close()

if __name__ == "__main__":
    setup_vector_index()