from flask import Flask, request, jsonify, render_template
from crews.scout_agent import ScoutAgent
from crews.chatbot import ChatBot
from dotenv import load_dotenv
from flask_socketio import SocketIO
import logging

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

#________________SOCKET.IO EVENT HANDLERS_________________

@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')
    socketio.emit('status', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

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

@app.route("/agent/scout/query", methods=["POST"])
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
        
        # Return the response in JSON format with the appropriate HTTP status code
        return jsonify(response), status_code

    except Exception as e:
        # Catch any unexpected errors and return an appropriate message
        error_msg = f"An error occurred while processing the request: {str(e)}"
        logger.error(error_msg)
        socketio.emit('scout_log', {'message': f'⚠️ Error: {error_msg}'})
        return jsonify({"error": error_msg}), 500

#___________________STREAMING LLM TEST ENDPOINT________________

@app.route("/agent/scout/stream-test", methods=["POST"])
def run_stream_test():
    """Simple endpoint to test LLM streaming without running the full pipeline"""
    try:
        data = request.get_json()
        prompt = data.get("prompt", "Tell me about knowledge graphs")
        
        logger.info(f"Testing LLM stream with prompt: {prompt[:50]}...")
        socketio.emit('scout_log', {'message': 'Starting LLM stream test...'})
        
        # Create a test streaming task
        from crewai import Agent, Task, Crew, Process
        
        agent = Agent(
            role="Test Agent",
            goal="Test streaming capabilities",
            verbose=True,
            llm="azure/gpt-4o-mini"
        )
        
        # Callback for streaming
        def on_llm_stream(chunk):
            chunk_content = chunk.content if hasattr(chunk, 'content') else str(chunk)
            socketio.emit('llm_stream', {'chunk': chunk_content})
            return chunk
        
        # Create task with streaming
        task = Task(
            description=f"Respond to this prompt: {prompt}",
            agent=agent,
            callbacks={
                "on_llm_stream": on_llm_stream
            }
        )
        
        # Set up and run the crew
        crew = Crew(
            tasks=[task],
            process=Process.sequential,
            verbose=True
        )
        
        # Run with streaming
        result = crew.kickoff()
        
        # Return final result
        return jsonify({"result": str(result)}), 200
        
    except Exception as e:
        error_msg = f"Error in stream test: {str(e)}"
        logger.error(error_msg)
        socketio.emit('scout_log', {'message': f'⚠️ {error_msg}'})
        return jsonify({"error": error_msg}), 500

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
    logger.info("Starting server...")
    socketio.run(app, debug=True, host='0.0.0.0', allow_unsafe_werkzeug=True)