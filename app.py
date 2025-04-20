from flask import Flask, request, jsonify, render_template
from crews.scout_agent import ScoutAgent
from crews.analyst_agent import AnalystAgent
from crews.chatbot import ChatBot
from dotenv import load_dotenv
from flask_socketio import SocketIO
import logging
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize both agents with the socketio instance
chatbot = ChatBot()
scout = ScoutAgent(socket_instance=socketio)
analyst = AnalystAgent(socket_instance=socketio)

# Store recent scout results in memory for sharing with analyst
recent_scout_results = []
MAX_STORED_RESULTS = 10

#________________SOCKET.IO EVENT HANDLERS_________________

@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')
    socketio.emit('status', {'message': 'Connected to server'})
    
    # Send recent scout results to client
    for result in recent_scout_results:
        socketio.emit('scout_result', result)

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

@socketio.on('get_scout_results')
def handle_get_scout_results():
    """Send all stored scout results to the client"""
    logger.info('Client requested scout results')
    for result in recent_scout_results:
        socketio.emit('scout_result', result)

#___________________CHATBOT AGENT____________________

@app.route('/agent/chat', methods=['POST'])
def run_chat():
    data = request.json
    query = data.get('query')
    summary = data.get('summary', '')

    if not query:
        return jsonify({'error': 'Query is required'}), 400

    logger.info(f"Processing chat query: {query[:50]}...")
    socketio.emit('chat_log', {'message': 'Processing your query...'})
    
    result = chatbot.run_chat(query, summary)
    socketio.emit('chat_log', {'message': 'Query processing complete!'})
    
    return jsonify(result)

#___________________SCOUT AGENT ENDPOINTS____________________

@app.route("/agent/scout/process", methods=["POST"])
def run_scout_query():
    try:
        # Get JSON data from the request body
        data = request.get_json()

        # Ensure the input is valid
        if not data or not data.get("prompt"):
            logger.error("Missing 'prompt' in request")
            socketio.emit('scout_log', {'message': '⚠️ Error: Missing prompt in request'})
            return jsonify({"error": "Missing 'prompt' in request"}), 400
        
        logger.info(f"Processing scout query: {data.get('prompt')[:50]}...")
        socketio.emit('scout_log', {'message': 'Initiating Scout Agent query...'})
        
        # Process the scout query with the given data
        response, status_code = scout.process_scout_query(data)
        
        # Store the result if successful
        if status_code == 200:
            # Add the original prompt to the response
            response['prompt'] = data.get('prompt')
            
            # Add to recent results
            global recent_scout_results
            recent_scout_results.append(response)
            
            # Limit the number of stored results
            if len(recent_scout_results) > MAX_STORED_RESULTS:
                recent_scout_results = recent_scout_results[-MAX_STORED_RESULTS:]
            
            # Broadcast the result to all clients
            socketio.emit('scout_result', response)
            logger.info(f"Stored and broadcast scout result for prompt: {data.get('prompt')[:30]}...")
        
        # Return the response in JSON format with the appropriate HTTP status code
        return jsonify(response), status_code

    except Exception as e:
        # Catch any unexpected errors and return an appropriate message
        error_msg = f"An error occurred while processing the request: {str(e)}"
        logger.error(error_msg)
        socketio.emit('scout_log', {'message': f'⚠️ Error: {error_msg}'})
        return jsonify({"error": error_msg}), 500
    
#___________________ANALYST AGENT ENDPOINTS____________________

@app.route("/agent/analyst/process", methods=["POST"])
def run_analyst_query():
    try:
        # Get Scout data from request
        scout_data = request.get_json()
        
        # Log received data for debugging
        logger.info(f"Received data for analysis with {len(scout_data.get('relevant_trends', []))} trends")
        socketio.emit('analyst_log', {'message': f'Processing data with {len(scout_data.get("relevant_trends", []))} trends'})

        # Process with Analyst Agent
        result = analyst.process_analyst_query(scout_data)
        
        # Log result for debugging
        logger.info(f"Analysis complete with {len(result.get('graph_data', {}).get('nodes', []))} nodes")
        socketio.emit('analyst_log', {'message': f'Analysis complete with {len(result.get("graph_data", {}).get("nodes", []))} graph nodes'})
        
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error in analyst query processing: {str(e)}")
        socketio.emit('analyst_log', {'message': f'⚠️ Error: {str(e)}'})
        return jsonify({
            "error": str(e),
            "message": "Failed to process analyst query"
        }), 500

#___________________TEST ROUTES FOR FRONTEND____________________

@app.route('/chatbot')
def chatbot_page():
    return render_template('chatbot.html')

@app.route('/scout-agent')
def scout_agent_page():
    return render_template('scout-agent.html')

@app.route('/analyst-agent')
def analyst_agent_page():
    return render_template('analyst-agent.html')

@app.route('/')
def home():
    return render_template('index.html')


if __name__ == '__main__':
    logger.info("Starting server...")
    socketio.run(app, debug=True, host='0.0.0.0', allow_unsafe_werkzeug=True)