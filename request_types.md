# API Endpoints Summary

## ChatBot

### `POST /agent/chat`
Send user query and previous summary to get a new chat response and updated summary.

**Payload:**
```json
{
  "query": "What's trending in AI?",
  "summary": "Past conversations..."
}
```
## ScoutAgent

### `POST /agent/scout/generate-query`
Generate a Cypher query from a natural language prompt.

**Payload:**
```json
{ 
  "prompt": "Find recent patents in AI" 
}
```

### `POST /agent/scout/run-query`
Run a raw Cypher query (with validation) and return results.

**Payload:**
```json
{ 
  "query": "MATCH (p:Patent) RETURN p LIMIT 5" 
}
```
### `POST /agent/scout/insights`
Run a Cypher query and return GPT-generated insights from the result data.

**Payload:**

```json
{ 
  "query": "MATCH (t:Tech)-[:CITED_BY]->(p:Patent) RETURN t.name, count(p) as popularity" 
}
```

### `GET /agent/scout/summary-info?type=...`
Retrieve pre-summarized database information.

**Query Parameter:**
- `type`:  `inventor_analysis`
- `type` (optional): Defaults to `technology_trends`
---------
**Example:**
```pgsql
/agent/scout/summary-info?type=technology_trends
```