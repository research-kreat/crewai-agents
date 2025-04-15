import ollama
import numpy as np
from typing import List, Dict, Any
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed

# ---------- Batch Embedding Helper ----------
def embed_text(text: str, model: str) -> List[float]:
    try:
        response = ollama.embeddings(model=model, prompt=text)
        if not response or "embedding" not in response:
            print(f"⚠️ No embedding in response for: {text[:50]}... | Response: {response}")
            return None
        return response["embedding"]
    except Exception as e:
        print(f"❌ Exception embedding: {text[:50]}... | Error: {e}")
        return None


# ---------- Main Embedding Function ----------
def generate_embeddings(
    texts: List[str],
    model: str = "mxbai-embed-large:latest",
    chunk_size: int = 100,
    max_workers: int = 6,
    collection: Any = None,
    ids: List[str] = None,
    documents: List[str] = None,
) -> List[List[float]]:

    # Check if the input texts are valid
    if not texts:
        print("⚠️ No texts provided for embedding.")
        return []

    total = len(texts)
    batches = []
    
    # Create batches of texts
    for i in range(0, total, chunk_size):
        batch = texts[i:i + chunk_size]
        batch_ids = ids[i:i + chunk_size] if ids else None
        batch_docs = documents[i:i + chunk_size] if documents else batch
        batches.append((i, batch, batch_ids, batch_docs))

    tqdm.write(f"🔍 Starting embedding in {len(batches)} batches (chunk size = {chunk_size})")

    all_embeddings = []

    # Process batches in parallel
    with tqdm(total=len(batches), desc="🚀 Total Progress") as overall_progress:
        for batch_index, batch, batch_ids, batch_docs in batches:
            batch_embeddings = []
            successful = 0
            failed = 0

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_text = {
                    executor.submit(embed_text, text, model): (text, idx)
                    for idx, text in enumerate(batch)
                }

                # Collect results from futures
                for future in as_completed(future_to_text):
                    text, idx = future_to_text[future]
                    try:
                        embedding = future.result()
                        if embedding:
                            batch_embeddings.append(embedding)
                            successful += 1
                        else:
                            batch_embeddings.append([])  # Ensure we keep alignment
                            failed += 1
                    except Exception as e:
                        print(f"❌ Error embedding text at index {idx}: {e}")
                        batch_embeddings.append([])  # Align with input
                        failed += 1

            # Store embeddings into the ChromaDB collection (if passed)
            if collection and batch_ids:
                # Filter out empty embeddings
                filtered = [(e, i, d) for e, i, d in zip(batch_embeddings, batch_ids, batch_docs) if e]
                if filtered:
                    emb, id_, doc_ = zip(*filtered)
                    collection.add(embeddings=emb, ids=id_, documents=doc_)
                else:
                    tqdm.write(f"⚠️ No valid embeddings to store for batch {batch_index}-{batch_index+len(batch)-1}.")


            # Extend the list of all embeddings
            all_embeddings.extend([e for e in batch_embeddings if e])

            tqdm.write(f"✅ Batch {batch_index}-{batch_index + len(batch) - 1}: {successful} stored, {failed} failed.")
            overall_progress.update(1)

    tqdm.write(f"\n🎉 Done! Embedded {len(all_embeddings)} total entries.\n")
    return all_embeddings



# TEST ABOVE FUNCTIONS

"""

# --- Embedding Test ---
texts = ["Hey how are you", "Llamas carry loads"]
embeddings = generate_embeddings(texts)
print("Embedding Test:")
for text, emb in zip(texts, embeddings):
    print(f"{text} => Embedding size: {len(emb)} | Sample: {emb[:5]}")

"""