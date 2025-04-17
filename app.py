from flask import Flask, request, jsonify, render_template
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
#___________________SCOUT AGENT ENDPOINTS____________________

@app.route("/agent/scout/query", methods=["POST"])
def run_scout_query():
    """
    Accepts a user prompt, generates a Cypher query, runs it, and returns insights.
    """
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
    try:
        insights_output = scout.convert_data_to_insights(
            data_from_neo,
            generated_query,
            user_prompt
        )
    except Exception as e:
        return jsonify({"error": f"Failed to generate insights: {str(e)}"}), 500
    
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