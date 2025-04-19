from crewai import Agent, Task, Crew, Process
from neo4j import GraphDatabase
import networkx as nx
import json
import os
from dotenv import load_dotenv
import plotly.graph_objs as go

load_dotenv()

class AnalystAgent:
    def __init__(self, socket_instance=None):
        # Neo4j connection setup
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI"), 
            auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD"))
        )

        # Initialize CrewAI Agent
        self.agent = Agent(
            role="Trend Analysis Specialist",
            goal="Perform deep analysis of technological trends and generate comprehensive insights",
            backstory=(
                "You are an expert trend analyst with the ability to "
                "dissect complex technological landscapes, identify "
                "interconnections, and provide strategic insights."
            ),
            verbose=True,
            llm="azure/gpt-4o-mini"
        )

    def build_knowledge_graph(self, scout_data):
        """
        Transform Scout Agent data into a networkx graph
        """
        G = nx.DiGraph()
        
        # Ensure relevant_trends exists and is a list
        relevant_trends = scout_data.get('relevant_trends', [])
        if not isinstance(relevant_trends, list):
            relevant_trends = []
        
        # Add nodes from relevant trends
        for trend in relevant_trends:
            node_id = trend.get('id', str(hash(json.dumps(trend))))
            G.add_node(node_id, 
                title=trend.get('title', 'Unnamed Trend'),
                domain=trend.get('domain', 'Unknown'),
                knowledge_type=trend.get('knowledge_type', 'Unclassified'),
                publication_date=trend.get('publication_date', 'N/A'),
                similarity_score=trend.get('similarity_score', 0)
            )
        
        # Add relationships based on similarity and shared characteristics
        for trend1 in relevant_trends:
            for trend2 in relevant_trends:
                if trend1 != trend2:
                    # Add edge if trends share domain or have high similarity
                    if (trend1.get('domain') == trend2.get('domain')) or \
                       (abs(trend1.get('similarity_score', 0) - trend2.get('similarity_score', 0)) < 0.2):
                        G.add_edge(
                            trend1.get('id', str(hash(json.dumps(trend1)))), 
                            trend2.get('id', str(hash(json.dumps(trend2)))), 
                            weight=trend1.get('similarity_score', 0)
                        )
        
        return G

    def generate_graph_visualization(self, G):
        """
        Generate graph visualization using NetworkX and Plotly instead of Matplotlib
        """
        # Handle empty graph
        if len(G.nodes()) == 0:
            print("Warning: Empty graph cannot be visualized")
            return

        # Ensure the static directory exists
        import os
        
        # Get the absolute path to the static directory
        static_dir = os.path.join(os.path.dirname(__file__), '..', 'static')
        os.makedirs(static_dir, exist_ok=True)

        # Full path for the HTML file
        graph_path = os.path.join(static_dir, 'trend_graph.html')

        # Get node positions
        pos = nx.spring_layout(G)

        # Create edge trace
        edge_x = []
        edge_y = []
        for edge in G.edges():
            x0, y0 = pos[edge[0]]
            x1, y1 = pos[edge[1]]
            edge_x.extend([x0, x1, None])
            edge_y.extend([y0, y1, None])

        edge_trace = go.Scatter(
            x=edge_x, y=edge_y,
            line=dict(width=0.5, color='#888'),
            hoverinfo='none',
            mode='lines')

        # Create node trace
        node_x = []
        node_y = []
        node_text = []
        node_size = []
        for node in G.nodes():
            x, y = pos[node]
            node_x.append(x)
            node_y.append(y)
            node_text.append(G.nodes[node].get('title', node))
            node_size.append(max(G.degree(node) * 10, 10))  # Ensure minimum size

        node_trace = go.Scatter(
            x=node_x, y=node_y,
            mode='markers+text',
            hoverinfo='text',
            marker=dict(
                showscale=True,
                colorscale='YlGnBu',
                size=node_size,
                colorbar=dict(
                    title='Node Connections',
                    x=1.02,
                    xanchor='left'
                )
            ),
            text=node_text
        )

        # Create figure
        fig = go.Figure(data=[edge_trace, node_trace])

        # Update layout with correct properties
        fig.update_layout(
            title='Knowledge Graph',  # Use title instead of titlefont
            title_font_size=16,  # Corrected font size specification
            showlegend=False,
            hovermode='closest',
            margin=dict(b=20, l=5, r=100, t=40),
            annotations=[dict(
                text="Knowledge Graph Visualization",
                showarrow=False,
                xref="paper", 
                yref="paper"
            )],
            xaxis=dict(
                showgrid=False, 
                zeroline=False, 
                showticklabels=False
            ),
            yaxis=dict(
                showgrid=False, 
                zeroline=False, 
                showticklabels=False
            )
        )

        # Save as interactive HTML
        fig.write_html(graph_path)
        
        print(f"Graph visualization saved to {graph_path}")

    def analyze_knowledge_graph(self, G):
        """
        Perform comprehensive analysis on the knowledge graph
        """

        # Handle empty graph
        if len(G.nodes()) == 0:
            return {
                "central_technologies": "No technologies found in the graph",
                "cross_domain_connections": "Insufficient data for cross-domain analysis",
                "innovation_pathways": "Unable to determine innovation pathways with current data"
            }

        # Prepare node and edge information
        nodes_info = []
        for node in G.nodes(data=True):
            node_data = {
                "id": node[0],
                "title": node[1].get('title', 'Unnamed Technology'),
                "domain": node[1].get('domain', 'Unknown'),
                "knowledge_type": node[1].get('knowledge_type', 'Unclassified'),
                "degree": G.degree(node[0])
            }
            nodes_info.append(node_data)

        # Sort nodes by degree to identify central technologies
        central_technologies = sorted(nodes_info, key=lambda x: x['degree'], reverse=True)[:3]

        # Analysis task to generate insights
        analysis_task = Task(
            description=f"""
            Perform a comprehensive analysis of the technology knowledge graph with {len(G.nodes())} nodes.

            Analyze the following key aspects:
            1. Central Technologies (Top Influential Nodes):
            {json.dumps(central_technologies, indent=2)}

            2. Identify cross-domain connections and potential innovation opportunities

            3. Explore potential innovation pathways based on technology relationships

            Provide insights addressing:
            - What makes these technologies central?
            - What cross-domain innovations are possible?
            - What are the emerging technological connections?

            Format your response as a structured JSON with:
            - central_technologies: Brief analysis of top technologies
            - cross_domain_connections: Potential innovative connections
            - innovation_pathways: Emerging technology trajectories
            """,
            agent=self.agent,
            expected_output="Comprehensive trend analysis in structured JSON format"
        )

        # Create crew for analysis
        crew = Crew(
            agents=[self.agent],
            tasks=[analysis_task],
            process=Process.sequential,
            verbose=True
        )
        try:
            # Generate insights
            insights_str = crew.kickoff()

            # Attempt to parse JSON
            try:
                insights = json.loads(insights_str)
            except (json.JSONDecodeError, TypeError):
                # Fallback parsing for potential partial JSON or string responses
                insights = {
                    "central_technologies": "Unable to parse detailed insights",
                    "cross_domain_connections": "No cross-domain connections found",
                    "innovation_pathways": "No innovation pathways discovered"
                }

            # Ensure all keys exist and format for readability
            formatted_insights = {
                "central_technologies": self._format_central_technologies(insights.get("central_technologies", [])),
                "cross_domain_connections": self._format_cross_domain_connections(insights.get("cross_domain_connections", [])),
                "innovation_pathways": self._format_innovation_pathways(insights.get("innovation_pathways", []))
            }

            return formatted_insights

        except Exception as e:
            return {
                "central_technologies": f"Analysis error: {str(e)}",
                "cross_domain_connections": "Analysis interrupted",
                "innovation_pathways": "Unable to generate insights"
            }

    def _format_central_technologies(self, technologies):
        """Format central technologies for readability"""
        if not technologies:
            return "No central technologies identified"
        
        formatted = []
        for tech in technologies:
            formatted.append(f"🔬 {tech.get('title', 'Unnamed Technology')} (Domain: {tech.get('domain', 'Unknown')})\n"
                            f"  Degree of Influence: {tech.get('degree', 'N/A')}\n"
                            f"  Analysis: {tech.get('analysis', 'No detailed analysis available')}")
        
        return "\n\n".join(formatted)

    def _format_cross_domain_connections(self, connections):
        """Format cross-domain connections for readability"""
        if not connections:
            return "No cross-domain connections found"
        
        formatted = []
        for conn in connections:
            formatted.append(f"🔗 Connection: {conn.get('from', 'Unknown')} → {conn.get('to', 'Unknown')}\n"
                            f"  Potential Innovation: {conn.get('potential_innovation', 'No specific innovation identified')}")
        
        return "\n\n".join(formatted)

    def _format_innovation_pathways(self, pathways):
        """Format innovation pathways for readability"""
        if not pathways:
            return "No innovation pathways discovered"
        
        formatted = []
        for pathway in pathways:
            formatted.append(f"🚀 {pathway.get('pathway', 'Unnamed Pathway')}\n"
                            f"  Description: {pathway.get('description', 'No description available')}")
        
        return "\n\n".join(formatted)

    def process_analyst_query(self, scout_data):
        """
        Main method to process scout data and generate analyst insights
        """
        # If scout_data is a string, try to parse it as JSON
        if isinstance(scout_data, str):
            try:
                scout_data = json.loads(scout_data)
            except json.JSONDecodeError:
                return {
                    'error': 'Invalid JSON data provided',
                    'graph_visualization': None,
                    'graph_insights': {},
                    'original_scout_data': scout_data
                }

        # Validate input
        if not scout_data or 'relevant_trends' not in scout_data:
            return {
                'error': 'Invalid scout data. Missing relevant_trends.',
                'graph_visualization': None,
                'graph_insights': {},
                'original_scout_data': scout_data
            }

        try:
            # Build knowledge graph
            knowledge_graph = self.build_knowledge_graph(scout_data)
            
            # Generate visualization
            self.generate_graph_visualization(knowledge_graph)
            
            # Perform graph analysis
            graph_insights = self.analyze_knowledge_graph(knowledge_graph)
            
            return {
                'graph_visualization': 'trend_graph.html',
                'graph_insights': graph_insights,
                'original_scout_data': scout_data
            }
        except Exception as e:
            return {
                'error': f'Analysis failed: {str(e)}',
                'graph_visualization': None,
                'graph_insights': {},
                'original_scout_data': scout_data
            }