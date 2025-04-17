from flask import Flask, request, jsonify, render_template
from crews.scout_agent import ScoutAgent
from crews.chatbot import ChatBot
from dotenv import load_dotenv
from helpers.chroma_helpers import init_all_collections, similarity_search_with_score

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

#___________________SCOUT AGENT ENDPOINTS____________________

@app.route("/agent/scout/query", methods=["POST"])
def run_scout_query():
    data = request.get_json()
    user_prompt = data.get("prompt")

    if not user_prompt:
        return jsonify({"error": "Missing 'prompt' in request"}), 400

    # Step 1: Generate Cypher query
    generated_query = scout.generate_query_for_neo(user_prompt)
    if isinstance(generated_query, dict) and "error" in generated_query:
        return jsonify({"error": "Query generation failed", "details": generated_query}), 500

    # Step 2: Validate query
    is_valid, msg = scout.is_valid_cypher(generated_query)
    if not is_valid:
        return jsonify({"error": "Invalid Cypher query", "message": msg}), 400

    # Step 3: Try Neo4j query
    try:
        data_from_neo = scout.run_neo4j_query(generated_query)
    except Exception as e:
        print(f"⚠️ Neo4j query failed: {e}")
        data_from_neo = []

    # Step 4: Always get Chroma matches
    try:
        chroma_results = similarity_search_with_score(user_prompt)
        data_from_chroma = [
            {"fallback": True, "chroma_data": match["data"]}
            for match in chroma_results
        ]
    except Exception as e:
        print(f"⚠️ Chroma fallback failed: {e}")
        data_from_chroma = []

    # Step 5: Check if both sources are empty
    if not data_from_neo and not data_from_chroma:
        return jsonify({
            "error": "No data found from either Neo4j or ChromaDB",
            "cypher_query_by_llm": generated_query
        }), 404

    # Step 6: Combine data and convert to insights
    combined_data = data_from_neo + data_from_chroma
    insights_output = scout.convert_data_to_insights(
        combined_data,
        generated_query,
        user_prompt
    )

    # Add both data sources explicitly to output
    insights_output["source"] = (
        "neo4j+chroma" if data_from_neo and data_from_chroma else
        "neo4j" if data_from_neo else
        "chroma"
    )

    return jsonify(insights_output), 200

@app.route('/agent/scout/generate-query', methods=['POST'])
def scout_generate_query():
    """
    Generates a Cypher query from user prompt.
    """
    data = request.get_json()
    prompt = data.get('prompt')

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    try:
        cypher_query = scout.generate_query_for_neo(prompt)
        return jsonify({'cypher_query': cypher_query})
    except Exception as e:
        return jsonify({'error': f"Failed to generate query: {str(e)}"}), 500


@app.route('/agent/scout/summary', methods=['GET'])
def scout_summary():
    """
    Returns a summary of technology trends from the database.
    """
    try:
        summary = scout._gather_database_info(query_type="technology_trends")
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch summary: {str(e)}"}), 500


@app.route('/agent/scout/inventors', methods=['GET'])
def scout_top_inventors():
    """
    Returns an inventor-centric analysis summary.
    """
    try:
        summary = scout._gather_database_info(query_type="inventor_analysis")
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch inventor analysis: {str(e)}"}), 500


@app.route('/agent/scout/close', methods=['POST'])
def close_scout():
    """
    Closes Neo4j connection.
    """
    try:
        scout.close()
        return jsonify({'message': 'Neo4j connection closed successfully.'})
    except Exception as e:
        return jsonify({'error': f'Failed to close Neo4j connection: {str(e)}'}), 500


#___________________TEST ROUTES FOR FRONTEND____________________

@app.route('/chatbot')
def chatbot_page():
    return render_template('chatbot.html')

@app.route('/scoutagent')
def scoutagent_page():
    return render_template('scoutagent.html')

@app.route('/')
def home():
    return render_template('index.html')


if __name__ == '__main__':
    app.run(debug=True)