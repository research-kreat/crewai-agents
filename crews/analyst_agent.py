from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import networkx as nx
import json
import os
import re
from dotenv import load_dotenv
import time
import datetime
from collections import defaultdict

load_dotenv()

class AnalystAgent:
    def __init__(self, socket_instance=None):
        # Store SocketIO instance for emitting events
        self.socketio = socket_instance
        
        # Neo4j connection setup
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI"), 
            auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD"))
        )

        # Initialize CrewAI Agent
        self.agent = Agent(
            role="Trend Analysis Specialist",
            goal="Perform deep analysis of technological trends and generate comprehensive insights",
            backstory="You are an expert trend analyst with the ability to dissect complex technological landscapes.",
            verbose=True,
            llm="azure/gpt-4o-mini"  
        )
        
    def emit_log(self, message):
        """Emits a log message to the client via socket.io"""
        print(f"LOG: {message}")
        if self.socketio:
            self.socketio.emit('analyst_log', {'message': message})

    def build_knowledge_graph(self, scout_data):
        """Transform Scout Agent data into a networkx graph with enhanced relationship detection"""
        self.emit_log("Building knowledge graph from scout data...")
        G = nx.DiGraph()
        
        # Get relevant trends
        relevant_trends = scout_data.get('relevant_trends', [])
        if not isinstance(relevant_trends, list) or not relevant_trends:
            self.emit_log("No trend data found in scout data")
            return G
        
        # Add nodes from relevant trends
        for trend in relevant_trends:
            node_id = trend.get('id', str(hash(json.dumps(trend))))
            G.add_node(node_id, 
                title=trend.get('title', 'Unnamed Trend'),
                domain=trend.get('domain', 'Unknown'),
                knowledge_type=trend.get('knowledge_type', 'Unclassified'),
                publication_date=trend.get('publication_date', 'N/A'),
                similarity_score=trend.get('similarity_score', 0),
                node_type='trend',
                data=trend
            )
        
        self.emit_log(f"Added {len(relevant_trends)} trend nodes to graph")
        
        # Process technologies and keywords
        tech_nodes = 0
        keyword_nodes = 0
        
        for trend in relevant_trends:
            node_id = trend.get('id', str(hash(json.dumps(trend))))
            
            # Add technology nodes
            if isinstance(trend.get('technologies'), list):
                for tech in trend.get('technologies'):
                    tech_id = f"tech_{tech.replace(' ', '_').lower()}"
                    if not G.has_node(tech_id):
                        G.add_node(tech_id,
                            title=tech,
                            domain=trend.get('domain', 'Unknown'),
                            node_type='technology'
                        )
                        tech_nodes += 1
                    
                    # Add relationship from trend to technology
                    G.add_edge(node_id, tech_id, relationship_type='uses_technology', weight=1.0)
            
            # Add keyword nodes
            if isinstance(trend.get('keywords'), list):
                for keyword in trend.get('keywords'):
                    keyword_id = f"keyword_{keyword.replace(' ', '_').lower()}"
                    if not G.has_node(keyword_id):
                        G.add_node(keyword_id,
                            title=keyword,
                            domain=trend.get('domain', 'Unknown'),
                            node_type='keyword'
                        )
                        keyword_nodes += 1
                    
                    # Add relationship from trend to keyword
                    G.add_edge(node_id, keyword_id, relationship_type='has_keyword', weight=0.7)
        
        self.emit_log(f"Added {tech_nodes} technology nodes and {keyword_nodes} keyword nodes")
        
        # Add connections between trends based on similarity
        trend_connections = 0
        for i, trend1 in enumerate(relevant_trends):
            for j, trend2 in enumerate(relevant_trends[i+1:], i+1):
                trend1_id = trend1.get('id', str(hash(json.dumps(trend1))))
                trend2_id = trend2.get('id', str(hash(json.dumps(trend2))))
                
                # Calculate connection reasons and weight
                connection_reasons = []
                connection_weight = 0
                
                # Domain similarity
                if trend1.get('domain') == trend2.get('domain'):
                    connection_reasons.append('same_domain')
                    connection_weight += 0.5
                
                # Similarity score proximity
                if (trend1.get('similarity_score') and trend2.get('similarity_score') and 
                    abs(trend1.get('similarity_score') - trend2.get('similarity_score')) < 0.2):
                    connection_reasons.append('similar_relevance')
                    connection_weight += 0.3
                
                # Shared technologies
                tech1 = set(trend1.get('technologies', []))
                tech2 = set(trend2.get('technologies', []))
                shared_tech = tech1.intersection(tech2)
                if shared_tech:
                    connection_reasons.append('shared_technologies')
                    connection_weight += 0.7 * len(shared_tech)
                
                # Shared keywords
                kw1 = set(trend1.get('keywords', []))
                kw2 = set(trend2.get('keywords', []))
                shared_kw = kw1.intersection(kw2)
                if shared_kw:
                    connection_reasons.append('shared_keywords')
                    connection_weight += 0.5 * len(shared_kw)
                
                # Add connection if there's any relationship
                if connection_weight > 0:
                    G.add_edge(
                        trend1_id,
                        trend2_id,
                        relationship_type='related',
                        reasons=connection_reasons,
                        weight=min(connection_weight, 3.0)  # Cap at 3.0
                    )
                    trend_connections += 1
        
        self.emit_log(f"Added {trend_connections} connections between trends")
        return G
    
    def generate_graph_data_for_frontend(self, G):
        """Convert NetworkX graph to a format suitable for frontend visualization"""
        self.emit_log("Preparing graph data for frontend visualization...")
        
        # Generate nodes with type-based colors and sizes
        nodes = []
        for node_id in G.nodes():
            node_data = G.nodes[node_id]
            node_type = node_data.get('node_type', 'unknown')
            
            # Set color and size based on node type
            color_map = {
                'trend': '#4a6de5',     # Blue
                'technology': '#28a745', # Green
                'keyword': '#fd7e14',    # Orange
                'unknown': '#6c757d'     # Gray
            }
            
            # Calculate size
            if node_type == 'trend':
                size = 10 + (node_data.get('similarity_score', 0) * 15)
            elif node_type == 'technology':
                size = 8
            elif node_type == 'keyword':
                size = 6
            else:
                size = 5
            
            # Create node object
            node = {
                'id': node_id,
                'title': node_data.get('title', 'Unnamed Node'),
                'domain': node_data.get('domain', 'Unknown'),
                'type': node_type,
                'color': color_map.get(node_type, color_map['unknown']),
                'size': size
            }
            
            # Add type-specific properties
            if node_type == 'trend':
                node.update({
                    'publication_date': node_data.get('publication_date', 'Unknown'),
                    'knowledge_type': node_data.get('knowledge_type', 'Unknown'),
                    'similarity_score': node_data.get('similarity_score', 0),
                    'data': node_data.get('data', {})
                })
            
            nodes.append(node)
        
        # Generate links
        links = []
        for source, target, edge_data in G.edges(data=True):
            link = {
                'source': source,
                'target': target,
                'type': edge_data.get('relationship_type', 'related'),
                'weight': edge_data.get('weight', 1.0)
            }
            
            # Add reasons if they exist
            if 'reasons' in edge_data:
                link['reasons'] = edge_data['reasons']
                
            links.append(link)
        
        self.emit_log(f"Prepared {len(nodes)} nodes and {len(links)} links for visualization")
        return {'nodes': nodes, 'links': links}

    def analyze_knowledge_graph(self, G):
        """Perform comprehensive analysis on the knowledge graph"""
        self.emit_log("Analyzing knowledge graph for insights...")

        # Handle empty graph
        if len(G.nodes()) == 0:
            self.emit_log("⚠️ Empty graph - cannot perform analysis")
            return {
                "central_technologies": "No technologies found in the graph",
                "cross_domain_connections": "Insufficient data for cross-domain analysis",
                "innovation_pathways": "Unable to determine innovation pathways with current data"
            }

        # Calculate centrality metrics
        try:
            # Calculate various centrality metrics
            degree_cent = nx.degree_centrality(G)
            betweenness_cent = nx.betweenness_centrality(G)
            eigenvector_cent = nx.eigenvector_centrality_numpy(G)
            self.emit_log("Calculated graph centrality metrics")
        except Exception as e:
            self.emit_log(f"⚠️ Error calculating centrality metrics: {str(e)}")
            # Fallback to simpler metrics
            degree_cent = {node: G.degree(node) / (len(G.nodes()) - 1) for node in G.nodes()}
            betweenness_cent = {node: 0.0 for node in G.nodes()}
            eigenvector_cent = {node: 0.0 for node in G.nodes()}

        # Process node information with centrality metrics
        nodes_info = [
            {
                "id": node_id,
                "title": node_data.get('title', 'Unnamed Technology'),
                "domain": node_data.get('domain', 'Unknown'),
                "type": node_data.get('node_type', 'unknown'),
                "degree": G.degree(node_id),
                "centrality": 0.4 * degree_cent.get(node_id, 0) + 
                              0.4 * betweenness_cent.get(node_id, 0) + 
                              0.2 * eigenvector_cent.get(node_id, 0),
                "data": node_data
            }
            for node_id, node_data in G.nodes(data=True)
        ]

        # Sort nodes by centrality to identify central technologies
        central_technologies = sorted(nodes_info, key=lambda x: x['centrality'], reverse=True)[:5]
        
        # Identify cross-domain connections
        cross_domain_connections = []
        for source, target, data in G.edges(data=True):
            source_domain = G.nodes[source].get('domain', 'Unknown')
            target_domain = G.nodes[target].get('domain', 'Unknown')
            
            if source_domain != target_domain and source_domain != 'Unknown' and target_domain != 'Unknown':
                cross_domain_connections.append({
                    "from": {
                        "id": source,
                        "title": G.nodes[source].get('title', 'Unknown'),
                        "domain": source_domain,
                        "type": G.nodes[source].get('node_type', 'unknown')
                    },
                    "to": {
                        "id": target,
                        "title": G.nodes[target].get('title', 'Unknown'),
                        "domain": target_domain,
                        "type": G.nodes[target].get('node_type', 'unknown')
                    },
                    "relationship": data.get('relationship_type', 'related'),
                    "weight": data.get('weight', 1.0),
                    "reasons": data.get('reasons', [])
                })
        
        self.emit_log(f"Identified {len(cross_domain_connections)} cross-domain connections")
        
        # Identify innovation pathways (important paths in the graph)
        innovation_pathways = []
        try:
            # Use top trends as starting points for paths
            start_nodes = [node['id'] for node in central_technologies if node['type'] == 'trend'][:3]
            
            for start_node in start_nodes:
                # Find paths of length 2-4
                for length in range(2, 5):
                    for node in G.nodes():
                        if node != start_node and nx.has_path(G, start_node, node):
                            try:
                                # Get shortest path
                                path = nx.shortest_path(G, start_node, node)
                                if len(path) == length:
                                    # Create path with titles
                                    path_titles = [G.nodes[n].get('title', 'Unknown') for n in path]
                                    
                                    innovation_pathways.append({
                                        "path_nodes": path,
                                        "path_titles": path_titles,
                                        "length": length,
                                        "start_domain": G.nodes[start_node].get('domain', 'Unknown'),
                                        "end_domain": G.nodes[node].get('domain', 'Unknown')
                                    })
                            except nx.NetworkXNoPath:
                                continue
            
            # Deduplicate paths
            unique_paths = {}
            for path in innovation_pathways:
                path_key = tuple(path["path_nodes"])
                if path_key not in unique_paths:
                    unique_paths[path_key] = path
            
            # Sort by cross-domain nature and limit to top 5
            innovation_pathways = list(unique_paths.values())
            innovation_pathways.sort(key=lambda x: x["start_domain"] != x["end_domain"], reverse=True)
            innovation_pathways = innovation_pathways[:5]
            
            self.emit_log(f"Identified {len(innovation_pathways)} innovation pathways")
            
        except Exception as e:
            self.emit_log(f"⚠️ Error identifying innovation pathways: {str(e)}")
            innovation_pathways = []

        # Process detailed information for the LLM task
        # Create more structured data for the LLM
        central_tech_details = []
        for tech in central_technologies:
            # Filter relevant details
            tech_detail = {
                "title": tech["title"],
                "domain": tech["domain"],
                "type": tech["type"],
                "centrality": round(tech["centrality"], 4),
                "degree": tech["degree"]
            }
            
            # Add extra information for trends
            if tech["type"] == "trend" and "data" in tech and tech["data"]:
                data = tech["data"]
                if "knowledge_type" in data:
                    tech_detail["knowledge_type"] = data["knowledge_type"]
                if "publication_date" in data:
                    tech_detail["publication_date"] = data["publication_date"]
            
            central_tech_details.append(tech_detail)
        
        # Create more detailed cross-domain connections
        cross_domain_details = []
        for conn in cross_domain_connections[:5]:  # Limit to top 5 for analysis
            conn_detail = {
                "from": f"{conn['from']['title']} ({conn['from']['domain']})",
                "to": f"{conn['to']['title']} ({conn['to']['domain']})",
                "relationship": conn["relationship"],
                "reasons": conn.get("reasons", [])
            }
            cross_domain_details.append(conn_detail)
        
        # Create more detailed innovation pathways
        pathway_details = []
        for path in innovation_pathways:
            pathway_detail = {
                "path": " → ".join(path["path_titles"]),
                "domains": f"{path['start_domain']} → {path['end_domain']}",
                "length": path["length"]
            }
            pathway_details.append(pathway_detail)
            
        # Prepare analysis task inputs - detailed prompt with more context
        analysis_task = Task(
            description=f"""
            Perform a comprehensive analysis of the technology knowledge graph with {len(G.nodes())} nodes.
            
            Your task is to analyze three key elements from this knowledge graph:
            
            1. Central Technologies (Top {len(central_tech_details)} Influential Nodes):
            ```json
            {json.dumps(central_tech_details, indent=2)}
            ```
            
            2. Cross-Domain Connections ({len(cross_domain_details)} identified):
            ```json
            {json.dumps(cross_domain_details, indent=2)}
            ```
            
            3. Innovation Pathways ({len(pathway_details)} identified):
            ```json
            {json.dumps(pathway_details, indent=2)}
            ```
            
            For each of these three sections, provide a detailed analysis that includes:
            
            For Central Technologies:
            - Explain why these technologies are central in the knowledge graph
            - Identify patterns or clusters that indicate emerging tech trends
            - Describe the strategic importance of these key technologies
            - Assess their potential impact on their respective domains
            
            For Cross-Domain Connections:
            - Analyze specific opportunities for cross-domain innovation
            - Identify the most promising connection points between domains
            - Explain potential applications or products that could emerge from these connections
            - Describe how these connections could lead to technological breakthroughs
            
            For Innovation Pathways:
            - Interpret what each pathway represents in terms of technological development
            - Explain the significance of the connections between nodes in these paths
            - Identify implications for future innovation in these areas
            - Suggest potential research or development directions based on these pathways
            
            Your analysis should be detailed, insightful, and focused on actionable intelligence.
            Format your response as a JSON object with these three sections:
            
            {{
              "central_technologies": {{
                "analysis": "Your detailed analysis of central technologies",
                "technologies": [
                  {{
                    "title": "Technology name",
                    "analysis": "Specific analysis for this technology",
                    "impact": "Potential impact of this technology"
                  }},
                  ...
                ]
              }},
              "cross_domain_connections": {{
                "analysis": "Your analysis of cross-domain connections",
                "opportunities": [
                  {{
                    "connection": "Description of the connection",
                    "potential": "Potential innovation or application"
                  }},
                  ...
                ]
              }},
              "innovation_pathways": {{
                "analysis": "Your analysis of innovation pathways",
                "implications": [
                  {{
                    "path": "Description of the pathway",
                    "implication": "Strategic implication of this pathway"
                  }},
                  ...
                ]
              }}
            }}
            """,
            agent=self.agent,
            expected_output="Comprehensive trend analysis in structured JSON format"
        )

        # Generate insights using CrewAI
        crew = Crew(
            agents=[self.agent],
            tasks=[analysis_task],
            process=Process.sequential,
            verbose=True
        )
        
        try:
            # Generate insights
            self.emit_log(f"TASK PROMPT FOR ANALYST: {analysis_task.description}")
            self.emit_log("Generating comprehensive insights using CrewAI...")
            insights_str = str(crew.kickoff())
            self.emit_log("Insights generation complete")

            # Parse JSON response - extract from potential markdown wrapper
            # Try to extract JSON from the response
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', insights_str)
            if json_match:
                insights_str = json_match.group(1).strip()
            else:
                # Try to find JSON without code block markers
                json_match = re.search(r'({[\s\S]*})', insights_str)
                if json_match:
                    insights_str = json_match.group(1).strip()
                    
            # Clean up any remaining non-JSON text (sometimes LLMs add explanations)
            insights_str = re.sub(r'^[^{]*', '', insights_str)  # Remove anything before the first {
            insights_str = re.sub(r'[^}]*$', '', insights_str)  # Remove anything after the last }
            
            try:
                insights = json.loads(insights_str)
                self.emit_log("Successfully parsed insights JSON")
            except json.JSONDecodeError as e:
                self.emit_log(f"⚠️ Error parsing JSON from LLM response: {str(e)}")
                # Create a fallback response with the original string
                insights = {
                    "central_technologies": {
                        "analysis": "Error parsing analysis results",
                        "technologies": [{"title": t["title"], "analysis": "Details unavailable", "impact": "Unknown"} for t in central_tech_details]
                    },
                    "cross_domain_connections": {
                        "analysis": "Error parsing cross-domain connections",
                        "opportunities": []
                    },
                    "innovation_pathways": {
                        "analysis": "Error parsing innovation pathways",
                        "implications": []
                    }
                }
                # Try to save the original text for debugging
                self.emit_log(f"Original LLM response: {insights_str[:200]}...")
            
            return insights

        except Exception as e:
            self.emit_log(f"⚠️ Error in analysis: {str(e)}")
            return {
                "central_technologies": {
                    "analysis": f"Analysis error: {str(e)}",
                    "technologies": [{"title": "Analysis unavailable", "analysis": "Error encountered", "impact": "Unknown"}]
                },
                "cross_domain_connections": {
                    "analysis": "Analysis interrupted",
                    "opportunities": []
                },
                "innovation_pathways": {
                    "analysis": "Unable to generate insights",
                    "implications": []
                }
            }

    def generate_s_curve_data(self, scout_data):
        """Generate S-Curve data for technology adoption visualization"""
        self.emit_log("Generating S-Curve data from scout data...")
        
        # Get relevant trends
        relevant_trends = scout_data.get('relevant_trends', [])
        if not isinstance(relevant_trends, list) or not relevant_trends:
            self.emit_log("No trend data found for S-Curve generation")
            return {"error": "No trend data available for S-Curve"}
        
        # Extract domains and technologies
        domains = set()
        technologies = {}
        dates = []
        
        # Process trends to extract technology trends over time
        for trend in relevant_trends:
            # Extract domain
            domain = trend.get('domain', 'Unknown')
            domains.add(domain)
            
            # Extract publication date
            pub_date = trend.get('publication_date')
            if not pub_date:
                continue
                
            # Parse and normalize the date (handle various formats)
            try:
                # Try different date formats
                if re.match(r'^\d{4}$', pub_date):
                    # Just year
                    year = int(pub_date)
                    parsed_date = f"{year}-01-01"
                    dates.append(year)
                elif re.match(r'^\d{4}-\d{2}$', pub_date):
                    # Year and month
                    parsed_date = f"{pub_date}-01"
                    year = int(pub_date.split('-')[0])
                    dates.append(year)
                elif re.match(r'^\d{4}-\d{2}-\d{2}$', pub_date):
                    # Complete date
                    parsed_date = pub_date
                    year = int(pub_date.split('-')[0])
                    dates.append(year)
                else:
                    # Try to parse with datetime
                    dt = datetime.datetime.strptime(pub_date, "%Y-%m-%d")
                    parsed_date = dt.strftime("%Y-%m-%d")
                    dates.append(dt.year)
                    
            except (ValueError, TypeError):
                # Skip if date parsing fails
                continue
                
            # Extract technologies
            if isinstance(trend.get('technologies'), list):
                tech_list = trend.get('technologies')
                for tech in tech_list:
                    if tech not in technologies:
                        technologies[tech] = {"dates": {}, "domains": set()}
                    
                    # Track this technology by date
                    year = parsed_date.split('-')[0]
                    technologies[tech]["dates"][year] = technologies[tech]["dates"].get(year, 0) + 1
                    technologies[tech]["domains"].add(domain)
        
        # Calculate min and max years
        if not dates:
            self.emit_log("No valid dates found in the data")
            return {
                "error": "No valid dates found in the data",
                "domains": list(domains),
                "technologies": []
            }
            
        min_year = min(dates)
        max_year = max(dates)
        
        # Generate year range
        years = list(range(min_year, max_year + 1))
        
        # Create s-curve data for each technology
        s_curve_data = []
        for tech_name, tech_data in technologies.items():
            # Only include technologies with sufficient data points
            if len(tech_data["dates"]) < 1:
                continue
                
            # Calculate cumulative mentions by year
            cumulative_data = []
            cumulative_count = 0
            
            for year in years:
                year_str = str(year)
                count = tech_data["dates"].get(year_str, 0)
                cumulative_count += count
                
                cumulative_data.append({
                    "year": year,
                    "count": count,
                    "cumulative": cumulative_count
                })
            
            # Calculate growth rate and market stage 
            # (simplified S-curve stage detection)
            total_mentions = cumulative_count
            growth_periods = []
            
            for i in range(1, len(cumulative_data)):
                current = cumulative_data[i]["cumulative"]
                previous = cumulative_data[i-1]["cumulative"]
                growth = 0 if previous == 0 else (current - previous) / previous
                
                growth_periods.append({
                    "year": cumulative_data[i]["year"],
                    "growth": growth
                })
            
            # Determine stage based on cumulative pattern
            # This is a simplified approach - in a real implementation, 
            # you might use more sophisticated algorithms
            if len(cumulative_data) <= 2:
                stage = "emerging"
            else:
                # Look at the last few years' growth pattern
                recent_growth = growth_periods[-3:] if len(growth_periods) >= 3 else growth_periods
                avg_recent_growth = sum(g["growth"] for g in recent_growth) / len(recent_growth)
                
                if avg_recent_growth > 0.3:
                    stage = "growth"
                elif avg_recent_growth > 0.1:
                    stage = "maturity"
                else:
                    stage = "saturation"
            
            # Add to final data
            s_curve_data.append({
                "technology": tech_name,
                "domains": list(tech_data["domains"]),
                "total_mentions": total_mentions,
                "stage": stage, 
                "data": cumulative_data,
                "growth_data": growth_periods
            })
        
        # Sort by total mentions, descending
        s_curve_data.sort(key=lambda x: x["total_mentions"], reverse=True)
        
        # Filter to top technologies for clearer visualization
        top_technologies = s_curve_data[:10] if len(s_curve_data) > 10 else s_curve_data
        
        self.emit_log(f"Generated S-Curve data for {len(top_technologies)} technologies")
        
        return {
            "min_year": min_year,
            "max_year": max_year,
            "years": years,
            "domains": list(domains),
            "technologies": top_technologies
        }

    def process_analyst_query(self, scout_data):
        """Main method to process scout data and generate analyst insights"""
        self.emit_log("Starting analyst query processing...")
        
        # Parse JSON if needed
        if isinstance(scout_data, str):
            try:
                scout_data = json.loads(scout_data)
                self.emit_log("Successfully parsed JSON input")
            except json.JSONDecodeError:
                self.emit_log("⚠️ Invalid JSON data provided")
                return {
                    'error': 'Invalid JSON data provided',
                    'graph_visualization': None,
                    'graph_insights': {},
                    'original_scout_data': scout_data
                }

        # Validate input
        if not scout_data or 'relevant_trends' not in scout_data:
            self.emit_log("⚠️ Invalid scout data - missing relevant_trends")
            return {
                'error': 'Invalid scout data. Missing relevant_trends.',
                'graph_visualization': None,
                'graph_insights': {},
                'original_scout_data': scout_data
            }

        try:
            # Build knowledge graph
            self.emit_log("Building knowledge graph from scout data...")
            knowledge_graph = self.build_knowledge_graph(scout_data)
            
            # Check if graph is empty
            if len(knowledge_graph.nodes()) == 0:
                self.emit_log("⚠️ Generated knowledge graph is empty")
                return {
                    'error': 'Unable to generate knowledge graph. No valid nodes found.',
                    'graph_visualization': None,
                    'graph_insights': {},
                    'original_scout_data': scout_data
                }
            
            # Process graph for frontend visualization
            self.emit_log("Preparing graph data for visualization...")
            graph_data = self.generate_graph_data_for_frontend(knowledge_graph)
            
            # Generate S-Curve data
            self.emit_log("Generating S-Curve data...")
            s_curve_data = self.generate_s_curve_data(scout_data)
            
            # Analyze graph
            self.emit_log("Analyzing knowledge graph...")
            graph_insights = self.analyze_knowledge_graph(knowledge_graph)
            
            # Return results
            result = {
                'graph_data': graph_data,
                's_curve_data': s_curve_data,
                'graph_insights': graph_insights,
                'original_scout_data': scout_data,
                'timestamp': int(time.time())
            }
            
            self.emit_log("Analysis complete, returning results")
            return result
        except Exception as e:
            self.emit_log(f"⚠️ Error in analysis: {str(e)}")
            return {
                'error': f'Analysis failed: {str(e)}',
                'graph_visualization': None,
                'graph_insights': {},
                'original_scout_data': scout_data
            }