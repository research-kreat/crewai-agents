from flask import Flask, request, jsonify, render_template
from crews.scout_agent import ScoutAgent
from crews.analyst_agent import AnalystAgent
from crews.chatbot import ChatBot
from crews.context_agent import ContextAgent
from crews.visualization_agent import VisualizationAgent
from crews.orchestrator_agent import OrchestratorAgent
from dotenv import load_dotenv
from flask_socketio import SocketIO
import logging
import json
import time

# Initialize Flask app and SocketIO
app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize agents with SocketIO
chatbot = ChatBot()
scout = ScoutAgent(socket_instance=socketio)
analyst = AnalystAgent(socket_instance=socketio)
context = ContextAgent(socket_instance=socketio)
visualization = VisualizationAgent(socket_instance=socketio)
orchestrator = OrchestratorAgent(socket_instance=socketio)

# Store recent scout results
recent_scout_results = []
MAX_STORED_RESULTS = 20  # Increased max results to store

#________________SOCKET.IO EVENT HANDLERS_________________

@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')
    socketio.emit('status', {'message': 'Connected to server'})
    
    # Send recent scout results
    for result in recent_scout_results:
        socketio.emit('scout_result', result)

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

@socketio.on('get_scout_results')
def handle_get_scout_results():
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
        data = request.get_json()

        if not data or not data.get("prompt"):
            logger.error("Missing 'prompt' in request")
            socketio.emit('scout_log', {'message': '⚠️ Error: Missing prompt in request'})
            return jsonify({"error": "Missing 'prompt' in request"}), 400
        
        logger.info(f"Processing scout query: {data.get('prompt')[:50]}...")
        socketio.emit('scout_log', {'message': 'Initiating Scout Agent query...'})
        
        # Process query
        response, status_code = scout.process_scout_query(data)
        
        if status_code == 200:
            # Add timestamp and prompt
            response['prompt'] = data.get('prompt')
            response['timestamp'] = int(time.time())
            
            # Store result
            global recent_scout_results
            recent_scout_results.append(response)
            
            # Limit stored results
            if len(recent_scout_results) > MAX_STORED_RESULTS:
                recent_scout_results = recent_scout_results[-MAX_STORED_RESULTS:]
            
            # Broadcast result
            socketio.emit('scout_result', response)
            logger.info(f"Stored and broadcast scout result for prompt: {data.get('prompt')[:30]}...")
        
        return jsonify(response), status_code

    except Exception as e:
        error_msg = f"An error occurred: {str(e)}"
        logger.error(error_msg)
        socketio.emit('scout_log', {'message': f'⚠️ Error: {error_msg}'})
        return jsonify({"error": error_msg}), 500

#___________________ANALYST AGENT ENDPOINTS____________________

@app.route("/agent/analyst/process", methods=["POST"])
def run_analyst_query():
    try:
        scout_data = request.get_json()
        
        logger.info(f"Received data for analysis with {len(scout_data.get('relevant_trends', []))} trends")
        socketio.emit('analyst_log', {'message': f'Processing data with {len(scout_data.get("relevant_trends", []))} trends'})

        # Process with Analyst Agent
        result = analyst.process_analyst_query(scout_data)
        
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

#___________________CONTEXT AGENT ENDPOINTS____________________

@app.route("/agent/context/analyze", methods=["POST"])
def run_context_analysis():
    try:
        data = request.get_json()
        
        logger.info("Received request for context analysis")
        socketio.emit('context_log', {'message': 'Initiating context analysis...'})
        
        # Validate required fields
        if not data.get("company_profile"):
            logger.error("Missing company profile data")
            socketio.emit('context_log', {'message': '⚠️ Error: Missing company profile data'})
            return jsonify({"error": "Missing company profile data"}), 400
            
        if not data.get("analyst_data"):
            logger.error("Missing analyst data")
            socketio.emit('context_log', {'message': '⚠️ Error: Missing analyst data'})
            return jsonify({"error": "Missing analyst data"}), 400
        
        # Process with Context Agent
        result, status_code = context.process_context_query(data)
        
        if status_code == 200:
            logger.info("Context analysis completed successfully")
            socketio.emit('context_log', {'message': 'Context analysis complete!'})
        else:
            logger.error(f"Context analysis failed: {result.get('error')}")
            socketio.emit('context_log', {'message': f'⚠️ Error: {result.get("error")}'})
        
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error in context analysis: {str(e)}")
        socketio.emit('context_log', {'message': f'⚠️ Error: {str(e)}'})
        return jsonify({
            "error": str(e),
            "message": "Failed to process context analysis"
        }), 500
    
#___________________VISUALIZATION AGENT ENDPOINTS____________________

@app.route("/agent/visualization/generate", methods=["POST"])
def run_visualization_generation():
    try:
        data = request.get_json()
        
        logger.info("Received request for visualization generation")
        socketio.emit('visualization_log', {'message': 'Initiating visualization generation...'})
        
        # Validate required fields
        if not data.get("data_source"):
            logger.error("Missing data source")
            socketio.emit('visualization_log', {'message': '⚠️ Error: Missing data source'})
            return jsonify({"error": "Missing data source"}), 400
        
        # Process with Visualization Agent
        result, status_code = visualization.process_visualization_query(data)
        
        if status_code == 200:
            logger.info(f"Generated {data.get('visualization_type', 'unknown')} visualization")
            socketio.emit('visualization_log', {'message': 'Visualization generation complete!'})
        else:
            logger.error(f"Visualization generation failed: {result.get('error')}")
            socketio.emit('visualization_log', {'message': f'⚠️ Error: {result.get("error")}'})
        
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error in visualization generation: {str(e)}")
        socketio.emit('visualization_log', {'message': f'⚠️ Error: {str(e)}'})
        return jsonify({
            "error": str(e),
            "message": "Failed to generate visualization"
        }), 500


@app.route("/agent/visualization/insights", methods=["POST"])
def run_visualization_insights():
    try:
        data = request.get_json()
        
        logger.info("Received request for visualization insights")
        socketio.emit('visualization_log', {'message': 'Generating visualization insights...'})
        
        # Create a temporary instance for the insights task
        vis_agent = VisualizationAgent(socket_instance=socketio)
        
        # Generate insights
        insights = vis_agent._generate_visualization_insights(
            data.get("data", {}),
            data.get("visualization_type", "unknown"),
            data.get("data_source", {}).get("data", {}),
            data.get("context_data", None)
        )
        
        logger.info("Visualization insights generated")
        socketio.emit('visualization_log', {'message': 'Insights generation complete!'})
        
        return jsonify(insights), 200
        
    except Exception as e:
        logger.error(f"Error generating visualization insights: {str(e)}")
        socketio.emit('visualization_log', {'message': f'⚠️ Error: {str(e)}'})
        return jsonify({
            "error": str(e),
            "message": "Failed to generate visualization insights"
        }), 500

#___________________ORCHESTRATOR AGENT ENDPOINTS____________________

@app.route("/agent/orchestrator/workflow", methods=["POST"])
def run_orchestrator_workflow():
    try:
        data = request.get_json()
        
        logger.info("Received request to run orchestrator workflow")
        socketio.emit('orchestrator_log', {'message': 'Initiating orchestrator workflow...'})
        
        # Validate required fields
        if not data.get("workflow_type") or not data.get("workflow_config"):
            logger.error("Missing workflow type or configuration")
            socketio.emit('orchestrator_log', {'message': '⚠️ Error: Missing workflow configuration'})
            return jsonify({"error": "Missing workflow type or configuration"}), 400
            
        if not data.get("company_profile"):
            logger.error("Missing company profile data")
            socketio.emit('orchestrator_log', {'message': '⚠️ Error: Missing company profile data'})
            return jsonify({"error": "Missing company profile data"}), 400
            
        if not data.get("trend_query") and not data.get("scout_result_id"):
            logger.error("Missing trend query or scout result ID")
            socketio.emit('orchestrator_log', {'message': '⚠️ Error: Missing trend query or scout result ID'})
            return jsonify({"error": "Missing trend query or scout result ID"}), 400
        
        # Process with Orchestrator Agent
        result, status_code = orchestrator.process_orchestrator_query(data)
        
        if status_code == 200:
            logger.info("Orchestrator workflow completed successfully")
            socketio.emit('orchestrator_log', {'message': 'Workflow completed successfully!'})
        else:
            logger.error(f"Orchestrator workflow failed: {result.get('error')}")
            socketio.emit('orchestrator_log', {'message': f'⚠️ Error: {result.get("error")}'})
        
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error in orchestrator workflow: {str(e)}")
        socketio.emit('orchestrator_log', {'message': f'⚠️ Error: {str(e)}'})
        return jsonify({
            "error": str(e),
            "message": "Failed to run orchestrator workflow"
        }), 500

@app.route("/agent/orchestrator/report", methods=["POST"])
def generate_final_report():
    try:
        data = request.get_json()
        
        logger.info("Received request to generate final report")
        socketio.emit('orchestrator_log', {'message': 'Generating final report...'})
        
        # Create a temporary orchestrator instance
        temp_orchestrator = OrchestratorAgent(socket_instance=socketio)
        
        # Generate report
        result, status_code = temp_orchestrator.generate_final_report(data)
        
        if status_code == 200:
            logger.info("Final report generated successfully")
            socketio.emit('orchestrator_log', {'message': 'Final report generated successfully!'})
        else:
            logger.error(f"Report generation failed: {result.get('error')}")
            socketio.emit('orchestrator_log', {'message': f'⚠️ Error: {result.get("error")}'})
        
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error generating final report: {str(e)}")
        socketio.emit('orchestrator_log', {'message': f'⚠️ Error: {str(e)}'})
        return jsonify({
            "error": str(e),
            "message": "Failed to generate final report"
        }), 500

#___________________TEMPLATE ROUTES____________________

@app.route('/chatbot')
def chatbot_page():
    return render_template('chatbot.html')

@app.route('/scout-agent')
def scout_agent_page():
    return render_template('scout-agent.html')

@app.route('/analyst-agent')
def analyst_agent_page():
    return render_template('analyst-agent.html')

@app.route('/context-agent')
def context_agent_page():
    return render_template('context-agent.html')

@app.route('/visualization-agent')
def visualization_agent_page():
    return render_template('visualization-agent.html')

@app.route('/orchestrator-agent')
def orchestrator_agent_page():
    return render_template('orchestrator-agent.html')

@app.route('/')
def home():
    return render_template('index.html')


if __name__ == '__main__':
    logger.info("Starting server...")
    socketio.run(app, debug=True, host='0.0.0.0', allow_unsafe_werkzeug=True)