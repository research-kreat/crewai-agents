from crewai import Agent, Task, Crew, Process
from dotenv import load_dotenv
import json
import os
import re

load_dotenv()

class ContextAgent:
    def __init__(self, socket_instance=None):
        # Store SocketIO instance for emitting events
        self.socketio = socket_instance
        
        # Initialize CrewAI Agent
        self.agent = Agent(
            role="Business Context Analyst",
            goal="Analyze technology trends in business context and provide strategic recommendations",
            backstory="You are an expert business analyst specializing in technology trend evaluation within strategic business contexts.",
            verbose=True,
            llm="azure/gpt-4o-mini"  
        )
        
    def emit_log(self, message):
        """Emits a log message to the client via socket.io"""
        print(f"LOG: {message}")
        if self.socketio:
            self.socketio.emit('context_log', {'message': message})
            
    def analyze_trend_in_context(self, data):
        """Analyze a technology trend in the context of a business profile"""
        self.emit_log("Starting context analysis for technology trend...")
        
        company_profile = data.get("company_profile")
        competitor_data = data.get("company_profile")
        scout_result = data.get("response_to_user_prompt")
        
        if not company_profile:
            self.emit_log("⚠️ Missing company profile data")
            return {"error": "Missing company profile data"}, 400
            
        if not scout_result:
            self.emit_log("⚠️ Missing scout result data")
            return {"error": "Missing scout result data"}, 400
            
        # Extract trend information from scout result
        # Using the first trend with highest similarity score as the main trend to analyze
        trend_data = {}
        if scout_result.get("relevant_trends") and len(scout_result.get("relevant_trends")) > 0:
            # Sort by similarity score (highest first)
            sorted_trends = sorted(
                scout_result.get("relevant_trends"), 
                key=lambda x: x.get("similarity_score", 0), 
                reverse=True
            )
            
            # Get the top trend
            top_trend = sorted_trends[0]
            
            trend_data = {
                "title": top_trend.get("title", "Unnamed Technology Trend"),
                "domain": top_trend.get("domain", "Unknown"),
                "type": top_trend.get("knowledge_type", "Unknown"),
                "publication_date": top_trend.get("publication_date", "Unknown"),
                "similarity_score": top_trend.get("similarity_score", 0),
                "technologies": top_trend.get("technologies", []),
                "keywords": top_trend.get("keywords", []),
                "id": top_trend.get("id", "")
            }
            
        # Format data for analysis
        self.emit_log("Preparing data for context analysis...")
        
        # Create a formatted string representation of company profile
        company_profile_str = self._format_company_profile(company_profile)
        
        # Create a formatted string representation of competitor data
        competitor_data_str = self._format_competitor_data(competitor_data)
        
        # Create a formatted string representation of trend data
        trend_data_str = self._format_trend_data(trend_data)
        
        # Format additional trends if available
        related_trends_str = ""
        if scout_result.get("relevant_trends") and len(scout_result.get("relevant_trends")) > 1:
            related_trends = scout_result.get("relevant_trends")[1:5]  # Get next 4 related trends
            related_trends_str = self._format_related_trends(related_trends)
            
        # Create analysis task
        self.emit_log("Creating analysis task...")
        
        analysis_task = Task(
            description=f"""
            You are an expert **Business Context Analyst**. Your task is to deeply evaluate a technology trend in relation to a company's profile and its competitive landscape, and deliver a **structured JSON analysis**.

            Use the following information for your analysis:

            # COMPANY PROFILE
            {company_profile_str}

            # COMPETITORS
            {competitor_data_str}

            # TECHNOLOGY TREND TO ANALYZE
            {trend_data_str}

            # RELATED TRENDS
            {related_trends_str}

            ---

            ## Instructions:

            1. Analyze the trend across six key dimensions:
            - Strategic Alignment
            - Capability Assessment
            - Competitive Landscape
            - Integration Opportunities
            - Resource Requirements
            - Overall Assessment

            2. For each dimension:
            - Provide a numeric **score (0.0 to 1.0)**.
            - Give detailed, reasoned explanations for each score.
            - Include relevant lists (priorities, capabilities, competitors, projects, talent) as arrays of structured JSON objects.

            3. **Strictly follow the output format** shown below. 
            - No extra commentary.
            - Return only a clean, valid JSON object.
            - Do not omit any fields, even if the data must be inferred reasonably.

            ---

            ## Output Format Example:

            {{
            "trend_name": "Name of the technology trend",
            "context_analysis": {{
                "strategic_alignment": {{
                "score": 0.82,
                "aligned_priorities": [
                    {{ "priority": "Priority name", "relevance": 0.9 }}
                ],
                "rationale": "Detailed explanation"
                }},
                "capability_assessment": {{
                "score": 0.65,
                "existing_capabilities": [
                    {{ "capability": "Capability name", "relevance": 0.8, "leverage_potential": "High" }}
                ],
                "capability_gaps": [
                    {{ "gap": "Gap description", "criticality": "High", "development_difficulty": "Medium" }}
                ],
                "rationale": "Detailed explanation"
                }},
                "competitive_landscape": {{
                "score": 0.45,
                "position": "Current position description",
                "key_competitors": [
                    {{ "name": "Competitor name", "position": "Their position", "threat_level": "High" }}
                ],
                "market_opportunity": "Opportunity description",
                "rationale": "Detailed explanation"
                }},
                "integration_opportunities": {{
                "score": 0.78,
                "project_synergies": [
                    {{ "project": "Project name", "synergy_level": "High", "integration_path": "Integration details" }}
                ],
                "rationale": "Detailed explanation"
                }},
                "resource_requirements": {{
                "estimated_investment": {{
                    "r_and_d": 3500000,
                    "talent_acquisition": 1200000,
                    "technology_licensing": 800000,
                    "total": 5500000
                }},
                "talent_needs": [
                    {{ "role": "Role title", "count": 3, "priority": "High" }}
                ],
                "timeline": {{
                    "research_phase": "3-6 months",
                    "development_phase": "9-12 months",
                    "market_entry": "15-18 months"
                }},
                "feasibility": "Medium",
                "rationale": "Detailed explanation"
                }}
            }},
            "overall_assessment": {{
                "relevance_score": 0.76,
                "pursuit_recommendation": "Strategic Opportunity",
                "recommended_approach": "Partner or Acquire",
                "priority_level": "High",
                "key_considerations": [
                "Consideration 1"
                ],
                "next_steps": [
                "Step 1"
                ]
                }}
            }}""")
        # Run the analysis
        self.emit_log("Running context analysis task...")
        
        crew = Crew(
            agents=[self.agent],
            tasks=[analysis_task],
            process=Process.sequential,
            verbose=True
        )
        
        try:
            # Generate the analysis
            analysis_result = crew.kickoff()
            analysis_str = str(analysis_result)
            
            # Try to extract JSON from the result
            try:
                # Match JSON pattern
                match = re.search(r"({.*})", analysis_str, re.DOTALL)
                if match:
                    analysis_json = json.loads(match.group(1))
                else:
                    # Try to parse the entire response as JSON
                    analysis_json = json.loads(analysis_str)
            except json.JSONDecodeError:
                self.emit_log("⚠️ Failed to parse JSON from analysis result")
                # Create simplified response with error detail
                analysis_json = {
                    "trend_name": trend_data.get("title", "Unnamed Technology Trend"),
                    "error": "Failed to parse analysis result",
                    "raw_output": analysis_str[:1000] + "..." if len(analysis_str) > 1000 else analysis_str
                }
            
            self.emit_log("Context analysis complete!")
            return analysis_json, 200
            
        except Exception as e:
            self.emit_log(f"⚠️ Error during analysis: {str(e)}")
            return {
                "error": f"Analysis failed: {str(e)}",
                "trend_name": trend_data.get("title", "Unnamed Technology Trend")
            }, 500
    
    def _format_company_profile(self, profile):
        """Format company profile data as a string"""
        if not profile:
            return "No company profile data available."
            
        output = f"Company Name: {profile.get('name', 'Unnamed')}\n"
        
        # Add domains
        if profile.get('primary_domains'):
            output += f"Primary Domains: {', '.join(profile.get('primary_domains'))}\n"
        if profile.get('secondary_domains'):
            output += f"Secondary Domains: {', '.join(profile.get('secondary_domains'))}\n"
            
        # Add capabilities
        if profile.get('core_capabilities'):
            output += "\nCore Capabilities:\n"
            for cap in profile.get('core_capabilities'):
                output += f"- {cap.get('name')}: Maturity {cap.get('maturity', 0):.1f}, Patents: {cap.get('patents', 0)}\n"
                
        # Add strategic priorities
        if profile.get('strategic_priorities'):
            output += "\nStrategic Priorities:\n"
            for priority in profile.get('strategic_priorities'):
                output += f"- {priority.get('name')}: Weight {priority.get('weight', 0):.1f}, Timeframe: {priority.get('timeframe', 'Unknown')}\n"
                
        # Add active projects
        if profile.get('active_projects'):
            output += "\nActive Projects:\n"
            for project in profile.get('active_projects'):
                output += f"- {project.get('name')} (ID: {project.get('id')}): Domain: {project.get('domain')}, Stage: {project.get('stage')}\n"
                
        # Add resource constraints
        if profile.get('resource_constraints'):
            constraints = profile.get('resource_constraints')
            output += "\nResource Constraints:\n"
            output += f"- R&D Budget: ${constraints.get('r_and_d_budget', 0):,}\n"
            output += f"- Technical Staff: {constraints.get('technical_staff', 0)} people\n"
            if constraints.get('manufacturing_capabilities'):
                output += f"- Manufacturing Capabilities: {', '.join(constraints.get('manufacturing_capabilities'))}\n"
                
        return output
    
    def _format_competitor_data(self, competitors):
        """Format competitor data as a string"""
        if not competitors:
            return "No competitor data available."
            
        output = "Competitor Information:\n"
        
        for i, competitor in enumerate(competitors):
            output += f"\nCompetitor {i+1}: {competitor.get('name', 'Unnamed')}\n"
            output += f"- Market Share: {competitor.get('market_share', 0):.2%}\n"
            output += f"- Primary Domains: {', '.join(competitor.get('primary_domains', []))}\n"
            
            # Add key products
            if competitor.get('key_products'):
                output += "- Key Products:\n"
                for product in competitor.get('key_products'):
                    output += f"  • {product.get('name')}: Position: {product.get('market_position')}, Strength: {product.get('strength', 0):.2f}\n"
            
            # Add recent moves
            if competitor.get('recent_moves'):
                output += "- Recent Moves:\n"
                for move in competitor.get('recent_moves'):
                    move_type = move.get('type', 'Activity')
                    move_details = move.get('target') if move_type == 'Acquisition' else move.get('name')
                    output += f"  • {move_type}: {move_details} ({move.get('date', 'No date')})\n"
            
            # Add patents
            if competitor.get('patents'):
                output += "- Patents:\n"
                for patent in competitor.get('patents')[:3]:  # Limit to 3 patents to avoid excessive text
                    output += f"  • {patent.get('title')} (ID: {patent.get('id')})\n"
                
                if len(competitor.get('patents')) > 3:
                    output += f"  • Plus {len(competitor.get('patents')) - 3} more patents\n"
        
        return output
    
    def _format_trend_data(self, trend):
        """Format trend data as a string"""
        if not trend:
            return "No trend data available."
            
        output = f"Trend: {trend.get('title', 'Unnamed Trend')}\n"
        output += f"Domain: {trend.get('domain', 'Unknown')}\n"
        output += f"Type: {trend.get('type', 'Unknown')}\n"
        output += f"Publication Date: {trend.get('publication_date', 'Unknown')}\n"
        output += f"Similarity Score: {trend.get('similarity_score', 0):.4f}\n"
        
        # Add technologies
        if trend.get('technologies'):
            output += f"Technologies: {', '.join(trend.get('technologies'))}\n"
            
        # Add keywords
        if trend.get('keywords'):
            output += f"Keywords: {', '.join(trend.get('keywords'))}\n"
            
        return output
    
    def _format_related_trends(self, trends):
        """Format related trends data as a string"""
        if not trends:
            return "No related trends available."
            
        output = "Related Trends:\n"
        
        for i, trend in enumerate(trends):
            output += f"\n{i+1}. {trend.get('title', 'Unnamed Trend')}\n"
            output += f"   Domain: {trend.get('domain', 'Unknown')}\n"
            output += f"   Type: {trend.get('knowledge_type', 'Unknown')}\n"
            output += f"   Similarity Score: {trend.get('similarity_score', 0):.4f}\n"
            
            # Add technologies if available (limited to save space)
            if trend.get('technologies'):
                technologies = trend.get('technologies')[:5]  # Limit to 5 technologies
                output += f"   Technologies: {', '.join(technologies)}"
                if len(trend.get('technologies')) > 5:
                    output += f" (plus {len(trend.get('technologies')) - 5} more)"
                output += "\n"
        
        return output
    
    def process_context_query(self, data):
        """Main method to process context analysis requests"""
        self.emit_log("Starting context query processing...")
        
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

        # Run analysis
        try:
            result, status_code = self.analyze_trend_in_context(data)
            return result, status_code
        except Exception as e:
            self.emit_log(f"⚠️ Error in analysis: {str(e)}")
            return {
                'error': f'Analysis failed: {str(e)}'
            }, 500