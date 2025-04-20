from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import networkx as nx
import json
import os
from dotenv import load_dotenv
import time

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

        # Prepare analysis task inputs
        analysis_task = Task(
            description=f"""
            Perform a comprehensive analysis of the technology knowledge graph with {len(G.nodes())} nodes.

            Analyze the following key aspects:
            1. Central Technologies (Top 5 Influential Nodes):
            {json.dumps([{
                "title": tech["title"],
                "domain": tech["domain"],
                "type": tech["type"],
                "centrality": round(tech["centrality"], 4),
                "degree": tech["degree"]
            } for tech in central_technologies], indent=2)}

            2. Cross-Domain Connections ({len(cross_domain_connections)} identified):
            {json.dumps([{
                "from": conn["from"]["title"] + " (" + conn["from"]["domain"] + ")", 
                "to": conn["to"]["title"] + " (" + conn["to"]["domain"] + ")",
                "relationship": conn["relationship"],
                "reasons": conn.get("reasons", [])
            } for conn in cross_domain_connections[:5]], indent=2)}

            3. Innovation Pathways ({len(innovation_pathways)} identified):
            {json.dumps([{
                "path": " → ".join(path["path_titles"]),
                "domains": path["start_domain"] + " → " + path["end_domain"]
            } for path in innovation_pathways], indent=2)}

            Your task is to provide rich, insightful analysis addressing:
            - What makes these technologies central and what are their implications?
            - What cross-domain innovations are possible based on the connections?
            - What emerging technological pathways could lead to breakthroughs?
            - What strategic opportunities exist based on this knowledge graph?

            Format your response as a structured JSON with:
            - central_technologies: Detailed analysis of top technologies and their significance
            - cross_domain_connections: Analysis of cross-domain opportunities
            - innovation_pathways: Implications of the identified technological trajectories
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
            self.emit_log("Generating comprehensive insights using CrewAI...")
            insights_str = str(crew.kickoff())
            self.emit_log("Insights generation complete")

            # Parse JSON response
            try:
                # Extract JSON from potential markdown wrapper
                if "```json" in insights_str:
                    insights_str = insights_str.split("```json")[1].split("```")[0].strip()
                elif "```" in insights_str:
                    insights_str = insights_str.split("```")[1].split("```")[0].strip()
                
                insights = json.loads(insights_str)
            except (json.JSONDecodeError, TypeError) as e:
                self.emit_log(f"⚠️ Error parsing JSON response from LLM: {str(e)}")
                insights = {
                    "central_technologies": "The analysis encountered an error processing the results.",
                    "cross_domain_connections": "No cross-domain connections could be analyzed.",
                    "innovation_pathways": "No innovation pathways could be determined."
                }

            # Format insights for readability
            return {
                "central_technologies": self._format_central_technologies(insights.get("central_technologies", [])),
                "cross_domain_connections": self._format_cross_domain_connections(insights.get("cross_domain_connections", [])),
                "innovation_pathways": self._format_innovation_pathways(insights.get("innovation_pathways", []))
            }

        except Exception as e:
            self.emit_log(f"⚠️ Error in analysis: {str(e)}")
            return {
                "central_technologies": f"Analysis error: {str(e)}",
                "cross_domain_connections": "Analysis interrupted",
                "innovation_pathways": "Unable to generate insights"
            }

    def _format_central_technologies(self, technologies):
        """Format central technologies for readability"""
        if not technologies:
            return "No central technologies identified"
        
        if isinstance(technologies, str):
            return technologies
        
        if isinstance(technologies, list):
            formatted = []
            for tech in technologies:
                if isinstance(tech, dict):
                    formatted.append(f"🔬 {tech.get('title', 'Unnamed Technology')} (Domain: {tech.get('domain', 'Unknown')})\n"
                                    f"  Degree of Influence: {tech.get('degree', 'N/A')}\n"
                                    f"  Analysis: {tech.get('analysis', 'No detailed analysis available')}")
                else:
                    formatted.append(f"🔬 {tech}")
            
            return "\n\n".join(formatted)
        
        return technologies

    def _format_cross_domain_connections(self, connections):
        """Format cross-domain connections for readability"""
        if not connections:
            return "No cross-domain connections found"
        
        if isinstance(connections, str):
            return connections
        
        if isinstance(connections, list):
            formatted = []
            for conn in connections:
                if isinstance(conn, dict):
                    formatted.append(f"🔗 Connection: {conn.get('from', 'Unknown')} → {conn.get('to', 'Unknown')}\n"
                                    f"  Potential Innovation: {conn.get('potential_innovation', 'No specific innovation identified')}")
                else:
                    formatted.append(f"🔗 {conn}")
            
            return "\n\n".join(formatted)
        
        return connections

    def _format_innovation_pathways(self, pathways):
        """Format innovation pathways for readability"""
        if not pathways:
            return "No innovation pathways discovered"
        
        if isinstance(pathways, str):
            return pathways
        
        if isinstance(pathways, list):
            formatted = []
            for pathway in pathways:
                if isinstance(pathway, dict):
                    formatted.append(f"🚀 {pathway.get('pathway', 'Unnamed Pathway')}\n"
                                    f"  Description: {pathway.get('description', 'No description available')}")
                else:
                    formatted.append(f"🚀 {pathway}")
            
            return "\n\n".join(formatted)
        
        return pathways

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
            
            # Analyze graph
            self.emit_log("Analyzing knowledge graph...")
            graph_insights = self.analyze_knowledge_graph(knowledge_graph)
            
            # Process insights to ensure proper formatting
            processed_insights = {}
            
            # Process each section of insights
            for key, value in graph_insights.items():
                # If the value is already a JSON string, keep it as is
                if isinstance(value, str):
                    if value.startswith('{') or value.startswith('['):
                        try:
                            # Validate it's proper JSON
                            json.loads(value)
                            processed_insights[key] = value
                        except json.JSONDecodeError:
                            # If it's not valid JSON, keep as is
                            processed_insights[key] = value
                    else:
                        processed_insights[key] = value
                else:
                    # Convert non-string insights to JSON strings
                    try:
                        processed_insights[key] = json.dumps(value)
                    except TypeError:
                        processed_insights[key] = str(value)
            
            # Return results
            result = {
                'graph_data': graph_data,
                'graph_insights': processed_insights,
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