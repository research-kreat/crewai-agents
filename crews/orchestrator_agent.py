from crewai import Agent, Task, Crew, Process
from crews.scout_agent import ScoutAgent
from crews.context_agent import ContextAgent
from crews.visualization_agent import VisualizationAgent
from dotenv import load_dotenv
import json
import os
import re

load_dotenv()

class OrchestratorAgent:
    def __init__(self, socket_instance=None):
        # Store SocketIO instance for emitting events
        self.socketio = socket_instance
        
        # Initialize CrewAI Agent
        self.agent = Agent(
            role="Workflow Orchestrator",
            goal="Coordinate multi-agent workflows and synthesize results into cohesive reports",
            backstory="You are a master orchestrator that coordinates the work of specialized AI agents and creates comprehensive integrated reports.",
            verbose=True,
            llm="azure/gpt-4o-mini"  
        )
        
        # Initialize sub-agents
        self.scout_agent = ScoutAgent(socket_instance)
        self.context_agent = ContextAgent(socket_instance)
        self.visualization_agent = VisualizationAgent(socket_instance)
        
    def emit_log(self, message):
        """Emits a log message to the client via socket.io"""
        print(f"LOG: {message}")
        if self.socketio:
            self.socketio.emit('orchestrator_log', {'message': message})
            
    def run_workflow(self, data):
        """Run a complete workflow with multiple agents"""
        self.emit_log("Starting orchestrated workflow...")
        
        # Extract workflow configuration
        workflow_type = data.get("workflow_type")
        workflow_config = data.get("workflow_config")
        
        if not workflow_type or not workflow_config:
            self.emit_log("⚠️ Missing workflow type or configuration")
            return {"error": "Missing workflow type or configuration"}, 400
            
        # Extract company profile
        company_profile = data.get("company_profile")
        if not company_profile:
            self.emit_log("⚠️ Missing company profile")
            return {"error": "Missing company profile"}, 400
            
        # Extract trend query or scout result ID
        trend_query = data.get("trend_query")
        scout_result_id = data.get("scout_result_id")
        
        if not trend_query and not scout_result_id:
            self.emit_log("⚠️ Missing trend query or scout result ID")
            return {"error": "Missing trend query or scout result ID"}, 400
            
        # Initialize results storage
        workflow_results = {
            "workflow_type": workflow_type,
            "workflow_config": workflow_config,
            "steps": {}
        }
        
        try:
            # Step 1: Run Scout Agent if needed
            if scout_result_id:
                # Retrieve existing scout result
                self.emit_log(f"Using existing scout result ID: {scout_result_id}")
                # In a real implementation, you would fetch this from a database
                # Here we'll just pass it through to the next step
                workflow_results["steps"]["scout"] = {"status": "skipped", "message": "Used existing result"}
                scout_data = {"id": scout_result_id}
            else:
                # Run new scout query
                self.emit_log(f"Running scout query: {trend_query}")
                scout_data, status_code = self.scout_agent.process_scout_query({"prompt": trend_query})
                
                if status_code != 200:
                    self.emit_log(f"⚠️ Scout query failed: {scout_data.get('error', 'Unknown error')}")
                    return {
                        "error": f"Scout query failed: {scout_data.get('error', 'Unknown error')}",
                        "workflow_results": workflow_results
                    }, status_code
                
                workflow_results["steps"]["scout"] = {
                    "status": "completed", 
                    "data": scout_data
                }
            
            # Step 2: Run Context Agent
            self.emit_log("Running context analysis...")
            context_data, status_code = self.context_agent.process_context_query({
                "company_profile": company_profile,
                "scout_result": workflow_results["steps"]["scout"].get("data", scout_data)
            })
            
            if status_code != 200:
                self.emit_log(f"⚠️ Context analysis failed: {context_data.get('error', 'Unknown error')}")
                workflow_results["steps"]["context"] = {"status": "failed", "error": context_data.get('error')}
                
                # Still try to generate final report
                return self.generate_final_report(workflow_results)
                
            workflow_results["steps"]["context"] = {
                "status": "completed", 
                "data": context_data
            }
            
            # Step 3: Run Visualization Agent if needed
            visualization_step = next((step for step in workflow_config.get("steps", []) if step.get("agent") == "visualization"), None)
            
            if visualization_step and visualization_step.get("required", False):
                self.emit_log("Running visualization generation...")
                viz_data, status_code = self.visualization_agent.process_visualization_query({
                    "data_source": {
                        "type": "scout",
                        "data": workflow_results["steps"]["scout"].get("data", scout_data)
                    },
                    "context_data": context_data,
                    "visualization_type": visualization_step.get("visualization_type", "treemap"),
                    "options": {
                        "groupBy": "domain",
                        "colorBy": "similarity_score",
                        "sizeBy": "data_quality_score"
                    }
                })
                
                if status_code != 200:
                    self.emit_log(f"⚠️ Visualization generation failed: {viz_data.get('error', 'Unknown error')}")
                    workflow_results["steps"]["visualization"] = {"status": "failed", "error": viz_data.get('error')}
                else:
                    workflow_results["steps"]["visualization"] = {
                        "status": "completed", 
                        "data": viz_data
                    }
            else:
                self.emit_log("Skipping visualization step (not required)")
                workflow_results["steps"]["visualization"] = {"status": "skipped", "message": "Not required in workflow"}
            
            # Step 4: Generate final report
            return self.generate_final_report(workflow_results)
            
        except Exception as e:
            self.emit_log(f"⚠️ Workflow error: {str(e)}")
            workflow_results["error"] = str(e)
            return {
                "error": f"Workflow failed: {str(e)}",
                "workflow_results": workflow_results
            }, 500
    
    def generate_final_report(self, workflow_results):
        """Generate final report combining results from all steps"""
        self.emit_log("Generating final report...")
        
        # Get workflow type and format from config
        workflow_type = workflow_results.get("workflow_type", "unknown")
        workflow_config = workflow_results.get("workflow_config", {})
        output_format = workflow_config.get("output_format", "report")
        
        # Get data from steps
        scout_data = workflow_results.get("steps", {}).get("scout", {}).get("data", {})
        context_data = workflow_results.get("steps", {}).get("context", {}).get("data", {})
        viz_data = workflow_results.get("steps", {}).get("visualization", {}).get("data", {})
        
        # Create report task
        report_task = Task(
            description=f"""
            As an orchestrator agent, create a comprehensive final report based on the combined results of multiple analysis steps.
            
            # WORKFLOW INFORMATION
            Workflow Type: {workflow_type}
            Report Format: {output_format}
            
            # SCOUT AGENT RESULTS
            Query/Prompt: {scout_data.get('prompt', scout_data.get('query', 'Unknown'))}
            
            Scout Response: {scout_data.get('response_to_user_prompt', 'Not available')}
            
            Trends Found: {len(scout_data.get('relevant_trends', []))} trends
            
            Scout Notes: {scout_data.get('notes', 'No additional notes')}
            
            # CONTEXT AGENT RESULTS
            Trend Name: {context_data.get('trend_name', 'Unknown Trend')}
            
            Overall Recommendation: {context_data.get('overall_assessment', {}).get('pursuit_recommendation', 'Not available')}
            
            Relevance Score: {context_data.get('overall_assessment', {}).get('relevance_score', 0)}
            
            Strategic Alignment: {context_data.get('context_analysis', {}).get('strategic_alignment', {}).get('score', 0)}
            
            Capability Assessment: {context_data.get('context_analysis', {}).get('capability_assessment', {}).get('score', 0)}
            
            Competitive Position: {context_data.get('context_analysis', {}).get('competitive_landscape', {}).get('position', 'Unknown')}
            
            # VISUALIZATION INSIGHTS
            {self._format_visualization_insights(viz_data)}
            
            Based on all this information, create a comprehensive final report for the {workflow_type} workflow.
            
            {self._get_report_format_instructions(output_format)}
            
            Make sure your report integrates all the key information from the different analysis steps
            and provides a clear, actionable synthesis with well-supported recommendations.
            
            Response example (adapt to the required format):
            ```json
            {
              "title": "Technology Trend Analysis Report",
              "executive_summary": "A concise summary of the key findings and recommendations",
              "content": "The full formatted report content with sections...",
              "key_recommendations": [
                "First recommendation",
                "Second recommendation",
                "Third recommendation"
              ]
            }
            ```
            """,
            agent=self.agent,
            expected_output="A comprehensive final report integrating all analysis steps"
        )
        
        # Run the report task
        crew = Crew(
            agents=[self.agent],
            tasks=[report_task],
            process=Process.sequential,
            verbose=True
        )
        
        try:
            report_result = crew.kickoff()
            report_str = str(report_result)
            
            # Try to extract JSON from the result
            try:
                # Match JSON pattern
                match = re.search(r"({.*})", report_str, re.DOTALL)
                if match:
                    report_json = json.loads(match.group(1))
                else:
                    # Try to parse the entire response as JSON
                    report_json = json.loads(report_str)
            except json.JSONDecodeError:
                self.emit_log("⚠️ Failed to parse JSON from report result")
                # Create simplified response
                report_json = {
                    "title": f"{context_data.get('trend_name', 'Technology Trend')} Analysis Report",
                    "executive_summary": "Analysis report generated from multi-agent workflow.",
                    "content": report_str,
                    "key_recommendations": context_data.get('overall_assessment', {}).get('next_steps', ["No specific recommendations available."])
                }
            
            # Combine final results
            workflow_results["steps"]["report"] = {
                "status": "completed",
                "data": report_json
            }
            
            final_result = {
                "workflow_type": workflow_type,
                "report": report_json,
                "workflow_results": workflow_results
            }
            
            self.emit_log("Final report generated successfully!")
            return final_result, 200
            
        except Exception as e:
            self.emit_log(f"⚠️ Report generation error: {str(e)}")
            
            # Create basic error report
            error_report = {
                "title": "Error in Report Generation",
                "executive_summary": f"An error occurred during the final report generation: {str(e)}",
                "content": "The workflow completed partially but encountered an error in the final reporting stage.",
                "key_recommendations": ["Review the individual step results for insights."]
            }
            
            workflow_results["steps"]["report"] = {
                "status": "failed",
                "error": str(e),
                "data": error_report
            }
            
            return {
                "workflow_type": workflow_type,
                "report": error_report,
                "workflow_results": workflow_results,
                "error": f"Report generation failed: {str(e)}"
            }, 500
    
    def _format_visualization_insights(self, viz_data):
        """Format visualization insights for the report task"""
        if not viz_data:
            return "No visualization data available."
            
        output = "Visualization Type: " + viz_data.get("visualization_type", "Unknown") + "\n\n"
        
        # Add summary
        if "summary" in viz_data:
            output += "Summary: " + viz_data.get("summary") + "\n\n"
            
        # Add insights
        if "insights" in viz_data and viz_data["insights"]:
            output += "Insights:\n"
            for i, insight in enumerate(viz_data["insights"]):
                output += f"{i+1}. {insight}\n"
            output += "\n"
            
        # Add recommendations
        if "recommendations" in viz_data and viz_data["recommendations"]:
            output += "Recommendations:\n"
            for i, recommendation in enumerate(viz_data["recommendations"]):
                output += f"{i+1}. {recommendation}\n"
                
        return output
    
    def _get_report_format_instructions(self, output_format):
        """Get format-specific instructions for the report"""
        if output_format == "report":
            return """
            Create a formal report with the following sections:
            1. Executive Summary
            2. Technology Overview
            3. Strategic Analysis
            4. Competitive Landscape
            5. Implementation Considerations
            6. Recommendations and Next Steps
            
            Use proper formatting and structure the content in a professional manner.
            """
        elif output_format == "competitive_report":
            return """
            Create a competitive analysis report with the following sections:
            1. Executive Summary
            2. Market Position Overview
            3. Competitor Analysis
            4. Opportunity Assessment
            5. Competitive Strategy Recommendations
            6. Action Plan
            
            Focus on competitive positioning and strategic differentiation.
            """
        elif output_format == "roadmap":
            return """
            Create a technology roadmap report with the following sections:
            1. Executive Summary
            2. Technology Overview
            3. Adoption Timeline
            4. Implementation Phases
            5. Resource Requirements
            6. Success Metrics and Milestones
            
            Include clear timelines and implementation recommendations.
            """
        else:
            # Default format
            return """
            Create a comprehensive report with clear sections covering the key findings
            and actionable recommendations based on the analysis.
            """
    
    def process_orchestrator_query(self, data):
        """Main method to process orchestrator workflows"""
        self.emit_log("Starting orchestrator query processing...")
        
        # Parse JSON if needed
        if isinstance(data, str):
            try:
                data = json.loads(data)
                self.emit_log("Successfully parsed JSON input")
            except json.JSONDecodeError:
                self.emit_log("⚠️ Invalid JSON data provided")
                return {
                    'error': 'Invalid JSON data provided'
                }, 400

        # Run workflow
        try:
            return self.run_workflow(data)
        except Exception as e:
            self.emit_log(f"⚠️ Error in workflow: {str(e)}")
            return {
                'error': f'Workflow failed: {str(e)}'
            }, 500