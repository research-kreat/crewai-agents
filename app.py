from flask import Flask, request, jsonify
from crews.scout_agent import ScoutAgent
from crews.chatbot import ChatBot
from dotenv import load_dotenv
from helpers.chroma_helpers import init_all_collections

app = Flask(__name__)
load_dotenv()

init_all_collections()

# Initialize both agents
chatbot = ChatBot()
scout = ScoutAgent()

#___________________CHATBOT AGENT____________________

@app.route('/agent/chat', methods=['POST'])
def run_chat():
    data = request.json
    query = data.get('query')
    summary = data.get('summary', '')

    if not query:
        return jsonify({'error': 'Query is required'}), 400

    result = chatbot.run_chat(query, summary)
    return jsonify(result)

#___________________SCOUT AGENT____________________

@app.route("/agent/scout/query", methods=["POST"])
def run_scout_query():
    data = request.get_json()
    user_prompt = data.get("prompt")

    if not user_prompt:
        return jsonify({"error": "Missing 'prompt' in request"}), 400

    # Step 1: Generate Cypher query from prompt
    generated_query = scout.generate_query_for_neo(user_prompt)
    if isinstance(generated_query, dict) and "error" in generated_query:
        return jsonify({"error": "Query generation failed", "details": generated_query}), 500

    # Step 2: Validate the Cypher query
    is_valid, msg = scout.is_valid_cypher(generated_query)
    if not is_valid:
        return jsonify({"error": "Invalid Cypher query", "message": msg}), 400

    # Step 3: Run the Cypher query on Neo4j
    try:
        data_from_neo = scout.run_neo4j_query(generated_query)
    except Exception as e:
        return jsonify({"error": f"Failed to run query: {str(e)}"}), 500

    # Step 4: Generate insights from the data and trends
    insights_output = scout.convert_data_to_insights(data_from_neo, generated_query, user_prompt)

    return jsonify(insights_output), 200

@app.route('/agent/scout/generate-query', methods=['POST'])
def scout_generate_query():
    data = request.json
    prompt = data.get('prompt')

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    cypher_query = scout.generate_query_for_neo(prompt)
    return jsonify({'cypher_query': cypher_query})

@app.route('/agent/scout/run', methods=['POST'])
def scout_run_query():
    data = request.json
    prompt = data.get('prompt')

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    cypher_query = scout.generate_query_for_neo(prompt)
    if isinstance(cypher_query, dict) and 'error' in cypher_query:
        return jsonify(cypher_query), 500

    is_valid, message = scout.is_valid_cypher(cypher_query)
    if not is_valid:
        return jsonify({'error': message}), 400

    results = scout.run_neo4j_query(cypher_query)
    insights = scout.convert_data_to_insights(results, cypher_query)
    return jsonify(insights)

@app.route('/agent/scout/summary', methods=['GET'])
def scout_summary():
    summary = scout._gather_database_info(query_type="technology_trends")
    return jsonify(summary)

@app.route('/agent/scout/inventors', methods=['GET'])
def scout_top_inventors():
    summary = scout._gather_database_info(query_type="inventor_analysis")
    return jsonify(summary)

@app.route('/agent/scout/close', methods=['POST'])
def close_scout():
    scout.close()
    return jsonify({'message': 'Neo4j connection closed successfully.'})


if __name__ == '__main__':
    app.run(debug=True)
