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
        
        # Extract the data structures needed
        company_profile = data.get("company_profile")
        competitor_data = data.get("competitor_data")
        analyst_data = data.get("analyst_data")
        
        if not company_profile:
            self.emit_log("⚠️ Missing company profile data")
            return {"error": "Missing company profile data"}, 400
            
        if not analyst_data:
            self.emit_log("⚠️ Missing analyst data")
            return {"error": "Missing analyst data"}, 400
            
        # Extract trend information from analyst data
        # First check if this is analyst data with graph insights
        trend_data = {}
        relevant_trends = []
        
        if analyst_data.get("graph_insights") and analyst_data.get("original_scout_data"):
            # This is full analyst data with graph insights
            self.emit_log("Detected full analyst data with graph insights")
            
            # Get relevant trends from original_scout_data
            if analyst_data["original_scout_data"].get("relevant_trends"):
                relevant_trends = analyst_data["original_scout_data"].get("relevant_trends", [])
                self.emit_log(f"Found {len(relevant_trends)} trends in original_scout_data")
            
            # If no trends in original data, try extracting from graph_data.nodes
            if not relevant_trends and analyst_data.get("graph_data") and analyst_data["graph_data"].get("nodes"):
                nodes = analyst_data["graph_data"].get("nodes", [])
                # Filter nodes that are trends
                trend_nodes = [node for node in nodes if node.get("type") == "trend"]
                if trend_nodes:
                    # Convert trend nodes to the format expected by relevant_trends
                    for node in trend_nodes:
                        node_data = node.get("data", {})
                        trend = {
                            "title": node.get("title", "Unnamed Trend"),
                            "domain": node.get("domain", "Unknown"),
                            "knowledge_type": node.get("knowledge_type", "Unknown"),
                            "publication_date": node.get("publication_date", "Unknown"),
                            "similarity_score": node.get("similarity_score", 0),
                            "technologies": node_data.get("technologies", []),
                            "keywords": node_data.get("keywords", []),
                            "id": node.get("id", "")
                        }
                        relevant_trends.append(trend)
                    self.emit_log(f"Extracted {len(relevant_trends)} trends from graph_data.nodes")
        elif analyst_data.get("relevant_trends"):
            # This might be scout data directly
            self.emit_log("Detected scout data structure")
            relevant_trends = analyst_data.get("relevant_trends", [])
            self.emit_log(f"Found {len(relevant_trends)} trends directly in data")
        else:
            # Try to find trends in original_scout_data
            if analyst_data.get("original_scout_data") and analyst_data["original_scout_data"].get("relevant_trends"):
                relevant_trends = analyst_data["original_scout_data"].get("relevant_trends", [])
                self.emit_log(f"Found {len(relevant_trends)} trends in original_scout_data")
            else:
                self.emit_log("⚠️ No relevant_trends found in original_scout_data")
                # Try to find trends in graph_data.nodes
                if analyst_data.get("graph_data") and analyst_data["graph_data"].get("nodes"):
                    nodes = analyst_data["graph_data"].get("nodes", [])
                    # Filter nodes that are trends
                    trend_nodes = [node for node in nodes if node.get("type") == "trend"]
                    if trend_nodes:
                        # Convert trend nodes to the format expected by relevant_trends
                        for node in trend_nodes:
                            node_data = node.get("data", {})
                            trend = {
                                "title": node.get("title", "Unnamed Trend"),
                                "domain": node.get("domain", "Unknown"),
                                "knowledge_type": node.get("knowledge_type", "Unknown"),
                                "publication_date": node.get("publication_date", "Unknown"),
                                "similarity_score": node.get("similarity_score", 0),
                                "technologies": node_data.get("technologies", []),
                                "keywords": node_data.get("keywords", []),
                                "id": node.get("id", "")
                            }
                            relevant_trends.append(trend)
                        self.emit_log(f"Extracted {len(relevant_trends)} trends from graph_data.nodes")
                    
        if not relevant_trends:
            self.emit_log("⚠️ No trend data found in analyst data")
            return {"error": "No trend data found in analyst data"}, 400
        
        # Sort by similarity score (highest first) and get the top trend
        sorted_trends = sorted(
            relevant_trends, 
            key=lambda x: x.get("similarity_score", 0), 
            reverse=True
        )
        
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
        
        # Include graph insights if available
        graph_insights_str = ""
        if analyst_data.get("graph_insights"):
            graph_insights_str = self._format_graph_insights(analyst_data.get("graph_insights"))
        
        # Format additional trends if available
        related_trends_str = ""
        if len(sorted_trends) > 1:
            related_trends = sorted_trends[1:5]  # Get next 4 related trends
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

            # GRAPH INSIGHTS
            {graph_insights_str}

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
            }}""",
            expected_output="Structured JSON analysis of the technology trend in business context",
            agent=self.agent
        )
        
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
        
        # Add basic company info
        if profile.get('founded'):
            output += f"Founded: {profile.get('founded')}\n"
        if profile.get('headquarters'):
            output += f"Headquarters: {profile.get('headquarters')}\n"
        if profile.get('industry'):
            if isinstance(profile.get('industry'), list):
                output += f"Industry: {', '.join(profile.get('industry'))}\n"
            else:
                output += f"Industry: {profile.get('industry')}\n"
        if profile.get('numberOfEmployees'):
            output += f"Employees: {profile.get('numberOfEmployees')}\n"
        
        # Add focus areas
        if profile.get('focusAreas'):
            output += "\nFocus Areas:\n"
            for area in profile.get('focusAreas'):
                output += f"- {area}\n"
                
        # Add products
        if profile.get('products'):
            output += "\nProducts:\n"
            for product in profile.get('products'):
                output += f"- {product}\n"
                
        # Add initiatives
        if profile.get('initiatives'):
            output += "\nInitiatives:\n"
            for initiative in profile.get('initiatives'):
                output += f"- {initiative}\n"
                
        # Add R&D info
        if profile.get('researchAndDevelopment'):
            rd = profile.get('researchAndDevelopment')
            output += "\nResearch and Development:\n"
            
            if rd.get('facilities'):
                output += f"- Facilities: {', '.join(rd.get('facilities'))}\n"
            
            if rd.get('recentInvestmentsUSD'):
                output += f"- Recent Investments: ${rd.get('recentInvestmentsUSD'):,} INR\n"
            
            if rd.get('annualInvestment'):
                annual = rd.get('annualInvestment')
                output += f"- Annual Investment: {annual.get('amountINR')} INR ({annual.get('percentageOfTurnover')}% of turnover) for fiscal year {annual.get('fiscalYear')}\n"
                
        # Add latest news if available
        if profile.get('latestNews') and len(profile.get('latestNews')) > 0:
            output += "\nLatest News:\n"
            for news in profile.get('latestNews')[:3]:  # Limit to 3 news items
                output += f"- {news.get('title')}\n"
                
        return output
    
    def _format_competitor_data(self, competitors):
        """Format competitor data as a string"""
        if not competitors:
            return "No competitor data available."
         
        # Handle both single competitor and list of competitors
        if not isinstance(competitors, list):
            competitors = [competitors]
            
        output = "Competitor Information:\n"
        
        for i, competitor in enumerate(competitors):
            output += f"\nCompetitor {i+1}: {competitor.get('name', 'Unnamed')}\n"
            
            # Add basic company info
            if competitor.get('founded'):
                output += f"- Founded: {competitor.get('founded')}\n"
            if competitor.get('headquarters'):
                output += f"- Headquarters: {competitor.get('headquarters')}\n"
            if competitor.get('industry'):
                if isinstance(competitor.get('industry'), list):
                    output += f"- Industry: {', '.join(competitor.get('industry'))}\n"
                else:
                    output += f"- Industry: {competitor.get('industry')}\n"
            if competitor.get('numberOfEmployees'):
                output += f"- Employees: {competitor.get('numberOfEmployees')}\n"
                
            # Add focus areas
            if competitor.get('focusAreas'):
                output += "- Focus Areas:\n"
                for area in competitor.get('focusAreas')[:5]:  # Limit to 5 areas
                    output += f"  • {area}\n"
                
            # Add products
            if competitor.get('products'):
                output += "- Key Products:\n"
                for product in competitor.get('products')[:5]:  # Limit to 5 products
                    output += f"  • {product}\n"
            
            # Add R&D info if available
            if competitor.get('researchAndDevelopment'):
                rd = competitor.get('researchAndDevelopment')
                output += "- R&D Information:\n"
                
                if rd.get('recentInvestmentsUSD'):
                    output += f"  • Recent Investments: ${rd.get('recentInvestmentsUSD'):,} USD\n"
                
            # Add latest news
            if competitor.get('latestNews') and len(competitor.get('latestNews')) > 0:
                output += "- Recent News:\n"
                for news in competitor.get('latestNews')[:2]:  # Limit to 2 news items
                    output += f"  • {news.get('title')}\n"
        
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
    
    def _format_graph_insights(self, insights):
        """Format graph insights data as a string"""
        if not insights:
            return "No graph insights available."
        
        output = "Graph Insights:\n\n"
        
        # Add central technologies
        if insights.get("central_technologies"):
            output += "Central Technologies:\n"
            central_tech = insights.get("central_technologies")
            
            # Add main analysis
            if isinstance(central_tech, dict) and central_tech.get("analysis"):
                output += f"{central_tech.get('analysis')}\n\n"
                
                # Add individual technology analyses
                if central_tech.get("technologies"):
                    output += "Key technologies:\n"
                    for tech in central_tech.get("technologies"):
                        output += f"- {tech.get('title', 'Unnamed Tech')}: {tech.get('impact', 'No impact information')}\n"
                        output += f"  {tech.get('analysis', 'No analysis available')}\n"
            elif isinstance(central_tech, str):
                output += f"{central_tech}\n"
            
            output += "\n"
            
        # Add cross-domain connections
        if insights.get("cross_domain_connections"):
            output += "Cross-Domain Connections:\n"
            cross_domain = insights.get("cross_domain_connections")
            
            # Add main analysis
            if isinstance(cross_domain, dict) and cross_domain.get("analysis"):
                output += f"{cross_domain.get('analysis')}\n\n"
                
                # Add opportunities
                if cross_domain.get("opportunities"):
                    output += "Key opportunities:\n"
                    for opp in cross_domain.get("opportunities"):
                        output += f"- {opp.get('connection', 'Unnamed Connection')}: {opp.get('potential', 'No potential information')}\n"
            elif isinstance(cross_domain, str):
                output += f"{cross_domain}\n"
                
            output += "\n"
            
        # Add innovation pathways
        if insights.get("innovation_pathways"):
            output += "Innovation Pathways:\n"
            innovation = insights.get("innovation_pathways")
            
            # Add main analysis
            if isinstance(innovation, dict) and innovation.get("analysis"):
                output += f"{innovation.get('analysis')}\n\n"
                
                # Add implications
                if innovation.get("implications"):
                    output += "Key implications:\n"
                    for imp in innovation.get("implications"):
                        output += f"- {imp.get('path', 'Unnamed Path')}: {imp.get('implication', 'No implication information')}\n"
            elif isinstance(innovation, str):
                output += f"{innovation}\n"
        
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