import os
import chromadb
import pandas as pd
from tqdm import tqdm
from typing import List
from chromadb.api.types import EmbeddingFunction
from helpers.llm import generate_embeddings  # Assuming this function is properly defined

# -----------------------------
# Embedding Function Wrapper
# -----------------------------
class CustomEmbeddingFunction(EmbeddingFunction):
    def __call__(self, texts: List[str]) -> List[List[float]]:
        return generate_embeddings(texts)

# -----------------------------
# Initialize ChromaDB Client
# -----------------------------
chroma_client = chromadb.PersistentClient(path=".chroma")
embedding_fn = CustomEmbeddingFunction()

# -----------------------------
# Dataset Configuration
# -----------------------------
datasets = {
    "trends": {
        "path": "datasets/trends.csv",
        "format_row": lambda row: (
            f"Title: {row['title']} — "
            f"Summary: {row.get('summary_text', '')} "
            f"Keywords: {row.get('keywords', '')} "
            f"Domain: {row.get('domain', '')}, Subdomains: {row.get('sub_domains', '')} "
            f"Technology Stack: {row.get('technology_stack', '')} "
            f"Relevance Score: {row.get('relevance_score', '')}"
        )
    }
}

# -----------------------------
# Cache for DataFrames
# -----------------------------
dataframes = {}

# -----------------------------
# Embedding Population
# -----------------------------
def populate_embeddings(name, path, formatter, batch_size: int = 100):
    print(f"\n📄 Loading dataset: {name}")
    df = pd.read_csv(path, dtype=str, on_bad_lines='skip')
    dataframes[name] = df

    df["row_id"] = df.index.astype(str)
    collection = chroma_client.get_or_create_collection(name=name, embedding_function=embedding_fn)

    existing_ids = set(collection.get()["ids"])
    new_rows = df[~df["row_id"].isin(existing_ids)]

    if new_rows.empty:
        print(f"⚠️ No new data to embed for '{name}'. Already up to date.")
        return

    print(f"🧠 Found {len(new_rows)} new rows to embed and store in batches of {batch_size}.")

    documents = new_rows.apply(formatter, axis=1).tolist()
    ids = new_rows["row_id"].tolist()

    for i in tqdm(range(0, len(documents), batch_size), desc=f"📦 Batching '{name}'"):
        batch_docs = documents[i:i + batch_size]
        batch_ids = ids[i:i + batch_size]

        try:
            embeddings = generate_embeddings(batch_docs)
            if len(embeddings) == len(batch_docs):
                collection.add(documents=batch_docs, embeddings=embeddings, ids=batch_ids)
                tqdm.write(f"✅ Stored batch {i}–{i + len(batch_docs) - 1}")
            else:
                tqdm.write(f"⚠️ Skipped batch {i} due to embedding mismatch or error.")
        except Exception as e:
            tqdm.write(f"❌ Error in batch {i}: {e}")
            continue  # Skip the current batch and proceed with the next one

    print(f"🎉 Done embedding and storing dataset '{name}'")

# -----------------------------
# Initialize All Datasets
# -----------------------------
def init_all_collections():
    for name, config in datasets.items():
        populate_embeddings(name, config["path"], config["format_row"])

# -----------------------------
# Query Functions
# -----------------------------
def chroma_query(dataset_name: str, prompt: str, top_k: int = 5):
    collection = chroma_client.get_collection(name=dataset_name, embedding_function=embedding_fn)
    
    # Perform the query with the prompt
    results = collection.query(query_texts=[prompt], n_results=top_k)
    
    # Extract the indices of the top K results
    indices = [int(id) for id in results["ids"][0]]
    
    # Return the data for the corresponding rows
    return dataframes[dataset_name].iloc[indices].to_dict(orient="records")

def get_or_load_dataframe(name):
    if name not in dataframes:
        df = pd.read_csv(datasets[name]["path"], dtype=str, on_bad_lines='skip')
        df["row_id"] = df.index.astype(str)
        dataframes[name] = df
    return dataframes[name]

def similarity_search_with_score(query, top_k=5):
    try:
        query_embedding = generate_embeddings([query])[0]
    except Exception as e:
        print(f"❌ Error generating embedding for query: {query}")
        return []

    collection = chroma_client.get_collection(name="trends", embedding_function=embedding_fn)
    results = collection.query(query_embeddings=[query_embedding], n_results=top_k)

    if 'ids' in results and 'distances' in results:
        ids = results["ids"][0]
        distances = results["distances"][0]

        row_indices = list(map(int, ids))
        matched_rows = get_or_load_dataframe("trends").iloc[row_indices]

        enriched_results = []
        for i, row in enumerate(matched_rows.itertuples(index=False)):
            enriched_results.append({
                "similarity_score": distances[i],
                "data": row._asdict()
            })

        return enriched_results
    else:
        print("⚠️ Unexpected response structure:", results)
        return []
# -----------------------------
# Shortcut for Trends Dataset
# -----------------------------
def chroma_trends(prompt: str, top_k: int = 5):
    return chroma_query("trends", prompt, top_k)

# Example Usage
# trends = chroma_trends("AI trends in 2025")
# print(trends)

# Perform similarity search with score
query = "AI trends in 2025"
scored_results = similarity_search_with_score(query)
print(scored_results)