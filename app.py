from flask import Flask, request, jsonify, render_template
from crews.scout_agent import ScoutAgent
from crews.chatbot import ChatBot
from dotenv import load_dotenv

app = Flask(__name__)
load_dotenv()

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
    try:
        # Get JSON data from the request body
        data = request.get_json()

        # Ensure the input is valid
        if not data or not data.get("prompt"):
            return jsonify({"error": "Missing 'prompt' in request"}), 400
        
        # Process the scout query with the given data
        response, status_code = scout.process_scout_query(data)
        
        # Return the response in JSON format with the appropriate HTTP status code
        return jsonify(response), status_code

    except Exception as e:
        # Catch any unexpected errors and return an appropriate message
        return jsonify({"error": f"An error occurred while processing the request: {str(e)}"}), 500

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