import os
import chromadb
import pandas as pd
from tqdm import tqdm
from typing import List
from chromadb.api.types import EmbeddingFunction
from helpers.llm import generate_embeddings

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

# -----------------------------
# Shortcut for Trends Dataset
# -----------------------------
def chroma_trends(prompt: str, top_k: int = 5):
    return chroma_query("trends", prompt, top_k)

# Example Usage
# trends = chroma_trends("AI trends in 2025")
# print(trends)
