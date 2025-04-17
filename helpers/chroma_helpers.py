import os
import chromadb
import pandas as pd
from tqdm import tqdm
from typing import List, Dict, Any
from chromadb.api.types import EmbeddingFunction
from helpers.llm import generate_embeddings  # Ensure this returns List[List[float]]

# -----------------------------
# Constants & Configuration
# -----------------------------
CHROMA_PATH = ".chroma"
DEFAULT_VALUES = {
    'title': 'No title listed',
    'summary_text': 'No summary_text',
    'keywords': 'No keywords available',
    'domain': 'No domain available',
    'sub_domains': 'No subdomains',
    'technology_stack': 'No technology stack',
    'relevance_score': 'No relevance score'
}
BATCH_SIZE = 100

# -----------------------------
# Embedding Function Wrapper
# -----------------------------
class CustomEmbeddingFunction(EmbeddingFunction):
    def __call__(self, texts: List[str]) -> List[List[float]]:
        return generate_embeddings(texts)

# -----------------------------
# Initialize ChromaDB Client
# -----------------------------
chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
embedding_fn = CustomEmbeddingFunction()

# -----------------------------
# Dataset Configuration
# -----------------------------
datasets = {
    "trends": {
        "path": "datasets/trends.csv",
        "format_row": lambda row: (
            f"Title: {row['title']} — "
            f"Summary: {row['summary_text']} "
            f"Keywords: {row['keywords']} "
            f"Domain: {row['domain']}, Subdomains: {row['sub_domains']} "
            f"Technology Stack: {row['technology_stack']} "
            f"Relevance Score: {row['relevance_score']}"
        )
    }
}

# Cache loaded DataFrames
dataframes: Dict[str, pd.DataFrame] = {}

# -----------------------------
# Utility Functions
# -----------------------------
def load_dataframe(name: str) -> pd.DataFrame:
    """Loads and caches the dataset as a pandas DataFrame."""
    if name not in dataframes:
        df = pd.read_csv(datasets[name]["path"], dtype=str, on_bad_lines='skip')
        df.fillna(value=DEFAULT_VALUES, inplace=True)  # ✅ Consistent fallback values
        df["row_id"] = df.index.astype(str)

        # ✅ Optional: Check column names
        # print("🔍 CSV Columns:", df.columns)

        dataframes[name] = df
    return dataframes[name]

# -----------------------------
# Embedding Population
# -----------------------------
def populate_embeddings(name: str, path: str, formatter, batch_size: int = BATCH_SIZE):
    print(f"\n📄 Loading dataset: {name}")
    df = load_dataframe(name)
    collection = chroma_client.get_or_create_collection(name=name, embedding_function=embedding_fn)

    try:
        existing_ids = set(collection.get(ids=None)["ids"])
    except Exception:
        existing_ids = set()

    new_rows = df[~df["row_id"].isin(existing_ids)]
    if new_rows.empty:
        print(f"✅ '{name}' is already up to date.")
        return

    print(f"🧠 Embedding {len(new_rows)} new rows...")

    documents = new_rows.apply(formatter, axis=1).tolist()
    ids = new_rows["row_id"].tolist()

    for i in tqdm(range(0, len(documents), batch_size), desc=f"📦 Embedding '{name}'"):
        batch_docs = documents[i:i + batch_size]
        batch_ids = ids[i:i + batch_size]

        try:
            embeddings = generate_embeddings(batch_docs)
            if len(embeddings) != len(batch_docs):
                tqdm.write(f"⚠️ Mismatch in embedding count. Skipping batch {i}.")
                continue

            collection.add(documents=batch_docs, embeddings=embeddings, ids=batch_ids)
            tqdm.write(f"✅ Stored batch {i}-{i + len(batch_docs) - 1}")
        except Exception as e:
            tqdm.write(f"❌ Error in batch {i}: {e}")

    print(f"🎉 Completed embedding for dataset '{name}'")

# -----------------------------
# Initialize All Collections
# -----------------------------
def init_all_collections():
    for name, config in datasets.items():
        populate_embeddings(name, config["path"], config["format_row"])

# -----------------------------
# Query Functions
# -----------------------------
def similarity_search_with_score(query: str, dataset: str = "trends", k: int = 5) -> List[Dict[str, Any]]:
    """Returns top-k similar documents with similarity scores scaled to 0–100."""
    try:
        query_embedding = generate_embeddings([query])[0]
    except Exception as e:
        print(f"❌ Failed to generate embedding for query: {query} — {e}")
        return []

    # Fetch the collection
    collection = chroma_client.get_collection(name=dataset, embedding_function=embedding_fn)

    # Query ChromaDB
    try:
        results = collection.query(query_embeddings=[query_embedding], n_results=k)
    except Exception as e:
        print(f"❌ Failed to query ChromaDB: {e}")
        return []

    if 'ids' not in results or 'distances' not in results:
        print("⚠️ Unexpected ChromaDB response.")
        return []

    ids = results["ids"][0]
    distances = results["distances"][0]
    similarities = [1 - d for d in distances]

    # Scale similarities to 0–100
    min_sim = min(similarities)
    max_sim = max(similarities)
    if max_sim == min_sim:
        scaled_scores = [100.0 for _ in similarities]
    else:
        scaled_scores = [
            round((sim - min_sim) / (max_sim - min_sim) * 100, 2)
            for sim in similarities
        ]

    df = load_dataframe(dataset)
    indices = [int(idx) for idx in ids]

    enriched = []
    for i, idx in enumerate(indices):
        row = df.iloc[idx].to_dict()
        result = {
            "similarity_score": scaled_scores[i],
            "title": row.get("title", DEFAULT_VALUES["title"]),
            "summary_text": row.get("summary_text", DEFAULT_VALUES["summary_text"]),
            "_id": row.get("_id", None),
            "data": row  # full original row if needed
        }
        # ✅ Optional debug print
        print(f"✅ Found: {result['title']} | Score: {result['similarity_score']}")
        enriched.append(result)

    return enriched
