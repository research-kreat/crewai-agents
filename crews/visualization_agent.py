from crewai import Agent, Task, Crew, Process
from dotenv import load_dotenv
import json
import os
import re

load_dotenv()

class VisualizationAgent:
    def __init__(self, socket_instance=None):
        # Store SocketIO instance for emitting events
        self.socketio = socket_instance
        
        # Initialize CrewAI Agent
        self.agent = Agent(
            role="Data Visualization Specialist",
            goal="Create insightful visualizations from trend data and generate actionable insights",
            backstory="You are an expert data visualization specialist who can analyze complex data and present it in visually compelling ways.",
            verbose=True,
            llm="azure/gpt-4o-mini"  
        )
        
    def emit_log(self, message):
        """Emits a log message to the client via socket.io"""
        print(f"LOG: {message}")
        if self.socketio:
            self.socketio.emit('visualization_log', {'message': message})
            
    def generate_visualization(self, data):
        """Generate visualization data and insights from input data"""
        self.emit_log("Starting visualization generation...")
        
        # Extract data source
        data_source = data.get("data_source")
        if not data_source:
            self.emit_log("⚠️ Missing data source")
            return {"error": "Missing data source"}, 400
            
        # Extract visualization type
        viz_type = data.get("visualization_type", "treemap")
        
        # Extract options
        options = data.get("options", {})
        
        # Extract context data if available
        context_data = data.get("context_data")
        
        # Process data source based on type
        source_data = None
        if data_source.get("type") == "scout":
            source_data = data_source.get("data")
        elif data_source.get("type") == "context":
            source_data = data_source.get("data")
        elif data_source.get("type") == "custom":
            source_data = data_source.get("data")
            
        if not source_data:
            self.emit_log("⚠️ Invalid or empty data source")
            return {"error": "Invalid or empty data source"}, 400
            
        # Process the data based on visualization type
        processed_data = self._process_data_for_visualization(source_data, viz_type, options)
        
        # Generate insights based on the visualization
        insights = self._generate_visualization_insights(processed_data, viz_type, source_data, context_data)
        
        # Combine results
        result = {
            "visualization_type": viz_type,
            "data": processed_data,
            "insights": insights.get("insights", []),
            "summary": insights.get("summary", ""),
            "recommendations": insights.get("recommendations", [])
        }
        
        self.emit_log("Visualization generation complete!")
        return result, 200
        
    def _process_data_for_visualization(self, source_data, viz_type, options):
        """Process the input data for the specified visualization type"""
        self.emit_log(f"Processing data for {viz_type} visualization...")
        
        try:
            # Extract trends if available
            trends = None
            if "relevant_trends" in source_data:
                trends = source_data.get("relevant_trends")
            
            # Apply filtering based on options
            group_by = options.get("groupBy", "domain")
            color_by = options.get("colorBy", "similarity_score")
            size_by = options.get("sizeBy", "similarity_score")
            
            # Create appropriate data structure based on visualization type
            if viz_type == "treemap":
                return self._create_treemap_data(trends, group_by, color_by, size_by)
            elif viz_type == "network":
                return self._create_network_data(trends, color_by)
            elif viz_type == "timeline":
                return self._create_timeline_data(trends, color_by, size_by)
            elif viz_type == "radar":
                return self._create_radar_data(trends, group_by)
            else:
                # Default to treemap
                return self._create_treemap_data(trends, group_by, color_by, size_by)
                
        except Exception as e:
            self.emit_log(f"⚠️ Error processing data: {str(e)}")
            return {"error": f"Data processing error: {str(e)}"}
    
    def _create_treemap_data(self, trends, group_by, color_by, size_by):
        """Create treemap visualization data structure"""
        if not trends:
            return {"name": "No Data", "children": []}
            
        # Group the trends
        groups = {}
        
        for trend in trends:
            group_value = trend.get(group_by, "Unknown")
            
            if group_value not in groups:
                groups[group_value] = {
                    "name": group_value,
                    "children": []
                }
            
            # Calculate size value based on selected metric
            size = 1
            if size_by == "similarity_score" and "similarity_score" in trend:
                size = trend["similarity_score"] * 10
            elif size_by == "data_quality_score" and "data_quality_score" in trend:
                size = trend["data_quality_score"] * 10
            
            # Add child to group
            groups[group_value]["children"].append({
                "name": trend.get("title", f"Trend {len(groups[group_value]['children']) + 1}"),
                "value": size,
                "colorValue": trend.get(color_by, 0),
                "id": trend.get("id", ""),
                "data": trend
            })
        
        # Construct the treemap hierarchy
        return {
            "name": "Trends",
            "children": list(groups.values())
        }
    
    def _create_network_data(self, trends, color_by):
        """Create network visualization data structure"""
        if not trends:
            return {"nodes": [], "links": []}
            
        nodes = []
        links = []
        node_map = {}  # To track nodes by ID
        
        # First pass: Create nodes for all trends
        for i, trend in enumerate(trends):
            node_id = trend.get("id", f"trend-{i}")
            
            node = {
                "id": node_id,
                "name": trend.get("title", "Unnamed Trend"),
                "group": trend.get("domain", "Unknown"),
                "type": "trend",
                "value": trend.get(color_by, 0),
                "data": trend
            }
            
            nodes.append(node)
            node_map[node_id] = node
            
            # Add technologies as nodes if they exist
            if "technologies" in trend and trend["technologies"]:
                for tech in trend["technologies"]:
                    tech_id = f"tech-{tech.replace(' ', '_').lower()}"
                    
                    # Only add if not already in nodes
                    if tech_id not in node_map:
                        tech_node = {
                            "id": tech_id,
                            "name": tech,
                            "group": "Technology",
                            "type": "technology"
                        }
                        nodes.append(tech_node)
                        node_map[tech_id] = tech_node
                    
                    # Add link
                    links.append({
                        "source": node_id,
                        "target": tech_id,
                        "type": "uses",
                        "value": 1
                    })
        
        # Second pass: Add connections between trends
        for i, trend1 in enumerate(trends):
            trend1_id = trend1.get("id", f"trend-{i}")
            
            for j, trend2 in enumerate(trends[i+1:], i+1):
                trend2_id = trend2.get("id", f"trend-{j}")
                
                # Connect if they share domain or technologies
                should_connect = False
                connection_strength = 0
                
                # Check domain
                if trend1.get("domain") and trend2.get("domain") and trend1["domain"] == trend2["domain"]:
                    should_connect = True
                    connection_strength += 0.5
                
                # Check technologies
                tech1 = set(trend1.get("technologies", []))
                tech2 = set(trend2.get("technologies", []))
                common_tech = tech1.intersection(tech2)
                
                if common_tech:
                    should_connect = True
                    connection_strength += 0.3 * len(common_tech)
                
                # Add link if connection found
                if should_connect:
                    links.append({
                        "source": trend1_id,
                        "target": trend2_id,
                        "type": "related",
                        "value": min(1, connection_strength)  # Cap at 1
                    })
        
        return {"nodes": nodes, "links": links}
    
    def _create_timeline_data(self, trends, color_by, size_by):
        """Create timeline visualization data structure"""
        if not trends:
            return []
            
        # Filter trends with publication date
        timeline_data = []
        
        for trend in trends:
            if "publication_date" in trend and trend["publication_date"]:
                # Calculate size
                size = 1
                if size_by == "similarity_score" and "similarity_score" in trend:
                    size = trend["similarity_score"] * 10
                elif size_by == "data_quality_score" and "data_quality_score" in trend:
                    size = trend["data_quality_score"] * 10
                
                timeline_data.append({
                    "id": trend.get("id", ""),
                    "title": trend.get("title", "Unnamed Trend"),
                    "date": trend["publication_date"],
                    "group": trend.get("domain", "Unknown"),
                    "value": trend.get(color_by, 0),
                    "size": size,
                    "data": trend
                })
        
        return timeline_data
    
    def _create_radar_data(self, trends, group_by):
        """Create radar chart visualization data structure"""
        if not trends:
            return []
            
        # Group by the selected attribute
        groups = {}
        
        for trend in trends:
            group_value = trend.get(group_by, "Unknown")
            
            if group_value not in groups:
                groups[group_value] = {
                    "name": group_value,
                    "metrics": {
                        "count": 0,
                        "similarity": 0,
                        "quality": 0,
                        "technologies": 0,
                        "keywords": 0
                    }
                }
            
            # Update metrics
            groups[group_value]["metrics"]["count"] += 1
            
            if "similarity_score" in trend:
                groups[group_value]["metrics"]["similarity"] += trend["similarity_score"]
                
            if "data_quality_score" in trend:
                groups[group_value]["metrics"]["quality"] += trend["data_quality_score"]
                
            if "technologies" in trend and trend["technologies"]:
                groups[group_value]["metrics"]["technologies"] += len(trend["technologies"])
                
            if "keywords" in trend and trend["keywords"]:
                groups[group_value]["metrics"]["keywords"] += len(trend["keywords"])
        
        # Calculate averages for metrics
        for group in groups.values():
            if group["metrics"]["count"] > 0:
                group["metrics"]["similarity"] /= group["metrics"]["count"]
                group["metrics"]["quality"] /= group["metrics"]["count"]
                group["metrics"]["technologies"] /= group["metrics"]["count"]
                group["metrics"]["keywords"] /= group["metrics"]["count"]
        
        return list(groups.values())
    
    def _generate_visualization_insights(self, processed_data, viz_type, source_data, context_data=None):
        """Generate insights based on the visualization and data"""
        self.emit_log("Generating insights from visualization...")
        
        # Prepare data description based on visualization type
        data_description = self._format_data_description(processed_data, viz_type, source_data)
        
        # Include context analysis if available
        context_description = ""
        if context_data:
            context_description = self._format_context_description(context_data)
        
        # Create insights task
        insights_task = Task(
            description=f"""
            As a data visualization specialist, analyze the following visualization data and generate insights.
            
            # VISUALIZATION TYPE
            {viz_type}
            
            # DATA DESCRIPTION
            {data_description}
            
            {context_description}
            
            Based on this data, please provide:
            
            1. A concise summary of what the visualization reveals (1-2 paragraphs)
            2. 5-7 specific insights that can be drawn from the visualization
            3. 3-4 actionable recommendations based on these insights
            
            Format your response as a JSON object with these keys:
            - summary: A paragraph summarizing the key takeaways
            - insights: An array of specific insights
            - recommendations: An array of actionable recommendations
            
            Response example:
            ```json
            {{
              "summary": "The visualization reveals...",
              "insights": [
                "First specific insight",
                "Second specific insight",
                "Third specific insight",
                "Fourth specific insight",
                "Fifth specific insight"
              ],
              "recommendations": [
                "First recommendation",
                "Second recommendation",
                "Third recommendation"
              ]
            }}
            ```
            """,
            agent=self.agent,
            expected_output="JSON with summary, insights, and recommendations"
        )
        
        # Run the insights task
        crew = Crew(
            agents=[self.agent],
            tasks=[insights_task],
            process=Process.sequential,
            verbose=True
        )
        
        try:
            insights_result = crew.kickoff()
            insights_str = str(insights_result)
            
            # Try to extract JSON from the result
            try:
                # Match JSON pattern
                match = re.search(r"({.*})", insights_str, re.DOTALL)
                if match:
                    insights_json = json.loads(match.group(1))
                else:
                    # Try to parse the entire response as JSON
                    insights_json = json.loads(insights_str)
            except json.JSONDecodeError:
                self.emit_log("⚠️ Failed to parse JSON from insights result")
                # Create simplified response
                insights_json = {
                    "summary": "Could not generate a proper summary due to parsing error.",
                    "insights": ["Data visualization shows patterns that could be valuable for analysis."],
                    "recommendations": ["Consider analyzing the data further for more detailed insights."]
                }
            
            return insights_json
            
        except Exception as e:
            self.emit_log(f"⚠️ Error generating insights: {str(e)}")
            return {
                "summary": "Error occurred while generating insights.",
                "insights": ["Could not generate insights due to an error."],
                "recommendations": ["Try with a different data set or visualization type."]
            }
    
    def _format_data_description(self, processed_data, viz_type, source_data):
        """Format data description for the insights task"""
        description = f"Visualization Type: {viz_type}\n\n"
        
        if viz_type == "treemap":
            # Describe treemap structure
            if "children" in processed_data:
                groups = processed_data.get("children", [])
                description += f"Treemap contains {len(groups)} main groups:\n"
                
                for group in groups:
                    group_name = group.get("name", "Unnamed Group")
                    children = group.get("children", [])
                    description += f"- {group_name}: {len(children)} items\n"
                    
                    # Sample a few children
                    if children:
                        sample_size = min(3, len(children))
                        description += "  Sample items:\n"
                        for i in range(sample_size):
                            item = children[i]
                            description += f"  - {item.get('name', 'Unnamed')}: value = {item.get('value', 0)}\n"
        
        elif viz_type == "network":
            # Describe network structure
            nodes = processed_data.get("nodes", [])
            links = processed_data.get("links", [])
            
            node_types = {}
            for node in nodes:
                node_type = node.get("type", "unknown")
                if node_type not in node_types:
                    node_types[node_type] = 0
                node_types[node_type] += 1
            
            description += f"Network contains {len(nodes)} nodes and {len(links)} links.\n"
            description += "Node types:\n"
            for node_type, count in node_types.items():
                description += f"- {node_type}: {count} nodes\n"
            
            # Describe link types
            link_types = {}
            for link in links:
                link_type = link.get("type", "unknown")
                if link_type not in link_types:
                    link_types[link_type] = 0
                link_types[link_type] += 1
            
            description += "Link types:\n"
            for link_type, count in link_types.items():
                description += f"- {link_type}: {count} links\n"
        
        elif viz_type == "timeline":
            # Describe timeline structure
            if isinstance(processed_data, list):
                description += f"Timeline contains {len(processed_data)} events.\n"
                
                # Group by date
                dates = {}
                for item in processed_data:
                    date = item.get("date", "Unknown")
                    if date not in dates:
                        dates[date] = 0
                    dates[date] += 1
                
                description += "Events by date:\n"
                for date, count in dates.items():
                    description += f"- {date}: {count} events\n"
                
                # Group by group/domain
                groups = {}
                for item in processed_data:
                    group = item.get("group", "Unknown")
                    if group not in groups:
                        groups[group] = 0
                    groups[group] += 1
                
                description += "Events by group:\n"
                for group, count in groups.items():
                    description += f"- {group}: {count} events\n"
        
        elif viz_type == "radar":
            # Describe radar structure
            if isinstance(processed_data, list):
                description += f"Radar chart contains {len(processed_data)} categories.\n"
                
                for category in processed_data:
                    name = category.get("name", "Unnamed")
                    metrics = category.get("metrics", {})
                    
                    description += f"- {name}:\n"
                    for metric, value in metrics.items():
                        description += f"  - {metric}: {value:.2f}\n"
        
        # Add source data summary
        if "relevant_trends" in source_data:
            trends = source_data.get("relevant_trends", [])
            description += f"\nSource data contains {len(trends)} trends.\n"
            
            # Count domains
            domains = {}
            for trend in trends:
                domain = trend.get("domain", "Unknown")
                if domain not in domains:
                    domains[domain] = 0
                domains[domain] += 1
            
            description += "Trends by domain:\n"
            for domain, count in domains.items():
                description += f"- {domain}: {count} trends\n"
            
            # Sample top trends
            if trends:
                sample_size = min(3, len(trends))
                description += "\nTop trends by similarity score:\n"
                sorted_trends = sorted(trends, key=lambda x: x.get("similarity_score", 0), reverse=True)
                
                for i in range(sample_size):
                    trend = sorted_trends[i]
                    description += f"{i+1}. {trend.get('title', 'Unnamed')}: score = {trend.get('similarity_score', 0):.4f}\n"
        
        return description
    
    def _format_context_description(self, context_data):
        """Format context analysis for the insights task"""
        if not context_data:
            return ""
            
        description = "\n# CONTEXT ANALYSIS\n"
        
        # Add trend name
        if "trend_name" in context_data:
            description += f"Trend: {context_data.get('trend_name')}\n\n"
        
        # Add overall assessment
        if "overall_assessment" in context_data:
            assessment = context_data.get("overall_assessment", {})
            description += "Overall Assessment:\n"
            description += f"- Relevance Score: {assessment.get('relevance_score', 0):.2f}\n"
            description += f"- Recommendation: {assessment.get('pursuit_recommendation', 'Unknown')}\n"
            description += f"- Approach: {assessment.get('recommended_approach', 'Unknown')}\n"
            description += f"- Priority: {assessment.get('priority_level', 'Unknown')}\n\n"
        
        # Add context analysis components
        if "context_analysis" in context_data:
            analysis = context_data.get("context_analysis", {})
            
            # Strategic alignment
            if "strategic_alignment" in analysis:
                strategic = analysis.get("strategic_alignment", {})
                description += "Strategic Alignment:\n"
                description += f"- Score: {strategic.get('score', 0):.2f}\n"
                description += f"- Rationale: {strategic.get('rationale', 'No rationale provided')}\n\n"
            
            # Competitive landscape
            if "competitive_landscape" in analysis:
                competitive = analysis.get("competitive_landscape", {})
                description += "Competitive Landscape:\n"
                description += f"- Score: {competitive.get('score', 0):.2f}\n"
                description += f"- Position: {competitive.get('position', 'Unknown')}\n"
                description += f"- Market Opportunity: {competitive.get('market_opportunity', 'Unknown')}\n\n"
            
            # Capability assessment
            if "capability_assessment" in analysis:
                capability = analysis.get("capability_assessment", {})
                description += "Capability Assessment:\n"
                description += f"- Score: {capability.get('score', 0):.2f}\n"
                description += f"- Rationale: {capability.get('rationale', 'No rationale provided')}\n\n"
        
        return description
    
    def process_visualization_query(self, data):
        """Main method to process visualization requests"""
        self.emit_log("Starting visualization query processing...")
        
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

        # Generate visualization
        try:
            result, status_code = self.generate_visualization(data)
            return result, status_code
        except Exception as e:
            self.emit_log(f"⚠️ Error in visualization generation: {str(e)}")
            return {
                'error': f'Visualization generation failed: {str(e)}'
            }, 500