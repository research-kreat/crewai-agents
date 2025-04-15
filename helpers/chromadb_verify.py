import sqlite3

# Connect to Chroma SQLite
conn = sqlite3.connect(".chroma/chroma.sqlite3")
cursor = conn.cursor()

# List all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("📦 Tables:", tables)

# Show collections (names, IDs)
cursor.execute("SELECT id, name FROM collections;")
collections = cursor.fetchall()
print("\n📚 Collections:")
for cid, name in collections:
    print(f"  - ID: {cid} | Name: {name}")

# Show total count of entries in the embeddings table
cursor.execute("SELECT COUNT(*) FROM embeddings;")
count = cursor.fetchone()[0]
print(f"\n🧮 Total Entries in `embeddings`: {count}")
