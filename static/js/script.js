// ==================================================
// SHARED VARIABLES AND CONFIGURATION
// ==================================================
const apiUrl = "http://localhost:5000";
let socket = null;

// Graph visualization variables
let graphData = null;
let forceGraph = null;
let selectedNodeId = null;
let currentNodeSize = 8;
const scoutResults = [];

// ==================================================
// CORE UTILITY FUNCTIONS (SHARED ACROSS ALL TEMPLATES)
// ==================================================

/**
 * Log a message to the console with timestamp
 */
function logToConsole(message, type = "info") {
  const consoleLog = document.getElementById("console-log");
  if (!consoleLog) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const logDiv = document.createElement("div");
  logDiv.className = `log-message ${type}`;
  logDiv.innerHTML = `<span class="log-timestamp">${timestamp}</span> ${message}`;
  
  consoleLog.appendChild(logDiv);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

/**
 * Clear console logs
 */
function clearLogs() {
  const consoleLog = document.getElementById("console-log");
  if (!consoleLog) return;
  
  consoleLog.innerHTML = "";
  logToConsole("Logs cleared", "system");
}

/**
 * Show a toast notification
 */
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

/**
 * Clear form inputs
 */
function clearForm() {
  // Try to clear inputs based on which page we're on
  // ChatBot
  if (document.getElementById('chat-query')) {
    document.getElementById('chat-query').value = '';
    document.getElementById('chat-summary').value = '';
  }
  
  // Scout Agent
  if (document.getElementById('scout-prompt')) {
    document.getElementById('scout-prompt').value = '';
    if (document.getElementById('scout-response')) {
      document.getElementById('scout-response').innerHTML = `
        <div class="placeholder-message">
          <i class="fas fa-search"></i>
          <p>Enter a prompt and click Run Query to see results</p>
        </div>
      `;
    }
    if (document.getElementById('response-box')) {
      document.getElementById('response-box').style.display = 'none';
    }
  }
  
  // Analyst Agent
  if (document.getElementById('scout-data-input')) {
    document.getElementById('scout-data-input').value = '';
    if (document.getElementById('graph-container')) {
      document.getElementById('graph-container').innerHTML = `
        <div class="placeholder-message">
          <i class="fas fa-project-diagram"></i>
          <p>Analyze Scout data to generate Knowledge Graph</p>
        </div>
      `;
    }
    if (document.getElementById('insights-container')) {
      document.getElementById('insights-container').innerHTML = `
        <div class="placeholder-message">
          <i class="fas fa-lightbulb"></i>
          <p>Insights will appear after analysis</p>
        </div>
      `;
    }
    if (document.getElementById('data-cards-container')) {
      document.getElementById('data-cards-container').innerHTML = "";
    }
  }
  
  logToConsole("Form cleared", "info");
}

/**
 * Format JSON response with syntax highlighting
 */
function formatJsonResponse(data) {
  const jsonString = JSON.stringify(data, null, 2);
  return `<pre class="json-response">${syntaxHighlight(jsonString)}</pre>`;
}

/**
 * Add syntax highlighting to JSON string
 */
function syntaxHighlight(json) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, 
    match => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
  });
}

/**
 * Copy text to clipboard
 */
function copyResponse() {
  // Determine the correct element to copy from based on page
  let element = null;
  
  if (document.getElementById('chat-response')) {
    element = document.getElementById('chat-response');
  } else if (document.getElementById('scout-response')) {
    element = document.getElementById('scout-response');
  }
  
  if (!element) return;
  
  const responseText = element.innerText;
  if (responseText && !responseText.includes('Enter a')) {
    navigator.clipboard.writeText(responseText)
      .then(() => {
        showToast('Response copied to clipboard');
        logToConsole("Response copied to clipboard", "info");
      })
      .catch(err => {
        showToast('Failed to copy: ' + err);
        logToConsole(`Failed to copy: ${err}`, "error");
      });
  }
}

/**
 * Navigation helper
 */
function navigateTo(page) {
  window.location.href = page;
}

/**
 * Connect to Socket.IO server
 */
function connectSocket() {
  socket = io.connect(apiUrl);

  socket.on("connect", () => {
    logToConsole("Connected to server", "system");
  });

  socket.on("disconnect", () => {
    logToConsole("Disconnected from server", "warning");
  });

  // Listen for different message types based on the page
  socket.on("scout_log", (data) => {
    logToConsole(data.message, data.message.includes("⚠️") ? "warning" : "info");
  });
  
  socket.on("analyst_log", (data) => {
    logToConsole(data.message, data.message.includes("⚠️") ? "warning" : "info");
  });
  
  socket.on("chat_log", (data) => {
    logToConsole(data.message, data.message.includes("⚠️") ? "warning" : "info");
  });
  
  socket.on("status", (data) => {
    logToConsole(`Status: ${data.message}`, "system");
  });
  
  // Listen for scout results
  socket.on("scout_result", (data) => {
    if (window.addScoutResult && typeof window.addScoutResult === 'function') {
      addScoutResult(data);
    }
  });
}

// ==================================================
// CHATBOT FUNCTIONS
// ==================================================

/**
 * Send a chat query to the chatbot
 */
function sendChatQuery() {
  const query = document.getElementById('chat-query').value;
  const summary = document.getElementById('chat-summary').value;
  
  if (!query) {
    showToast('Please enter a query');
    return;
  }
  
  // Show loading spinner
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('chat-response').innerHTML = '';
  
  fetch(`${apiUrl}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, summary })
  })
  .then(response => response.json())
  .then(data => {
    // Hide loading spinner
    document.getElementById('loading').classList.add('hidden');
    
    // Format the response
    document.getElementById('chat-response').innerHTML = formatJsonResponse(data);
  })
  .catch(error => {
    // Hide loading spinner
    document.getElementById('loading').classList.add('hidden');
    
    // Show error message
    document.getElementById('chat-response').innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error: ${error}</p>
      </div>
    `;
  });
}

// ==================================================
// SCOUT AGENT FUNCTIONS
// ==================================================

/**
 * Send Scout query
 */
function sendScoutQuery() {
  const prompt = document.getElementById("scout-prompt").value;
  
  if (!prompt) {
    showToast("Please enter a prompt");
    logToConsole("Error: Empty prompt", "error");
    return;
  }
  
  // Show loading state
  document.getElementById("loading").classList.remove("hidden");
  document.getElementById("scout-response").innerHTML = "";
  
  // Disable run button
  const runButton = document.getElementById("run-button");
  runButton.disabled = true;
  runButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
  
  logToConsole(`Sending query: "${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}"`, "info");
  
  // Send API request
  fetch(`${apiUrl}/agent/scout/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  })
  .then(response => response.json())
  .then(data => {
    document.getElementById("loading").classList.add("hidden");
    logToConsole("Response received, processing results...", "info");
    
    // Display response
    document.getElementById("scout-response").innerHTML = formatJsonResponse(data);
    displayStructuredData(data);
    logToConsole("Results displayed successfully", "system");
    
    // Re-enable run button
    runButton.disabled = false;
    runButton.innerHTML = '<i class="fas fa-play"></i> Run Query';
  })
  .catch(error => {
    document.getElementById("loading").classList.add("hidden");
    logToConsole(`Error in request: ${error}`, "error");
    
    document.getElementById("scout-response").innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error: ${error}</p>
      </div>
    `;
    
    runButton.disabled = false;
    runButton.innerHTML = '<i class="fas fa-play"></i> Run Query';
  });
}

/**
 * Display structured data from Scout results
 */
function displayStructuredData(data) {
  const responseBox = document.getElementById("response-box");
  if (!responseBox) return;
  
  responseBox.style.display = "block";
  
  // Helper function to check valid values
  const isValidValue = value => 
    value !== null && value !== undefined && value !== "" && value !== "N/A";
  
  // Set text content with validation
  const setTextContent = (id, value, defaultText) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = isValidValue(value) ? value : defaultText;
    }
  };
  
  // Set all fields
  setTextContent("message", data.message, "No message available");
  setTextContent("trend_summary", data.trend_summary, "No trend summary available");
  setTextContent("isData", data.isData ? "✅ Data found" : "❌ No data found");
  setTextContent("notes", data.notes, "No strategic note available");
  setTextContent("response_to_user_prompt", data.response_to_user_prompt, "No direct response available");
  
  // Handle arrays with HTML
  const renderList = (items, container, defaultText) => {
    const el = document.getElementById(container);
    if (!el) return;
    
    if (Array.isArray(items) && items.length > 0) {
      el.innerHTML = "<ul>" + items.map(item => 
        `<li>${isValidValue(item) ? item : defaultText}</li>`
      ).join("") + "</ul>";
    } else {
      el.innerHTML = `<ul><li>${defaultText}</li></ul>`;
    }
  };
  
  renderList(data.insights, "insights", "No insight available");
  renderList(data.recommendations, "recommendations", "No recommendation available");
  
  // Render relevant trends
  const trendsContainer = document.getElementById("relevant-trends");
  if (!trendsContainer) return;
  
  if (Array.isArray(data.relevant_trends) && data.relevant_trends.length > 0) {
    trendsContainer.innerHTML = "<ul>" + data.relevant_trends.map(trend => `
      <li>
        <strong>Title:</strong> ${isValidValue(trend.title) ? trend.title : "No title available"}<br>
        <strong>Summary:</strong> ${isValidValue(trend.summary_text) ? trend.summary_text : "No summary available"}<br>
        <strong>Similarity Score:</strong> ${isValidValue(trend.similarity_score) ? trend.similarity_score : "No score available"}<br>
        <strong>Domain:</strong> ${isValidValue(trend.domain) ? trend.domain : "No domain specified"}<br>
        <strong>Knowledge Type:</strong> ${isValidValue(trend.knowledge_type) ? trend.knowledge_type : "No knowledge type"}<br>
        <strong>Publication Date:</strong> ${isValidValue(trend.publication_date) ? trend.publication_date : "No publication date"}<br>
        <strong>Country:</strong> ${isValidValue(trend.country) ? trend.country : "No country info"}<br>
        <strong>Data Quality Score:</strong> ${isValidValue(trend.data_quality_score) ? trend.data_quality_score : "No score"}<br>
        <strong>ID:</strong> ${isValidValue(trend.id) ? trend.id : "No id available"}
      </li>
    `).join("") + "</ul>";
  } else {
    trendsContainer.innerHTML = "<ul><li>No relevant trends available</li></ul>";
  }
}

// ==================================================
// ANALYST AGENT FUNCTIONS
// ==================================================

/**
 * Switch between tabs
 */
function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Deactivate all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Activate selected tab
  document.getElementById(tabId).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
}

/**
 * Add a new scout result to the selection
 */
function addScoutResult(data) {
  if (!data || !data.prompt) return;
  
  const select = document.getElementById('scout-results-select');
  if (!select) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const resultId = 'scout-' + Date.now();
  
  // Add to storage array
  scoutResults.push({
    id: resultId,
    timestamp: timestamp,
    prompt: data.prompt,
    data: data
  });
  
  // Add to dropdown
  const option = document.createElement('option');
  option.value = resultId;
  option.textContent = `${timestamp}: "${data.prompt.substring(0, 30)}${data.prompt.length > 30 ? '...' : ''}"`;
  select.appendChild(option);
  
  // Enable select button if needed
  const analyzeButton = document.getElementById('analyze-selected-button');
  if (analyzeButton) {
    analyzeButton.disabled = false;
  }
  
  logToConsole(`Added Scout result for "${data.prompt.substring(0, 20)}..."`, "info");
}

/**
 * Handle when user selects a scout result
 */
function handleScoutResultSelection() {
  const select = document.getElementById('scout-results-select');
  if (!select) return;
  
  const resultId = select.value;
  const previewEl = document.getElementById('scout-result-preview');
  if (!previewEl) return;
  
  if (!resultId) {
    previewEl.innerHTML = `
      <div class="placeholder-message">
        <i class="fas fa-search"></i>
        <p>Select a Scout result to preview</p>
      </div>
    `;
    
    const analyzeButton = document.getElementById('analyze-selected-button');
    if (analyzeButton) {
      analyzeButton.disabled = true;
    }
    return;
  }
  
  // Find the selected result
  const result = scoutResults.find(r => r.id === resultId);
  if (!result) return;
  
  // Show preview
  previewEl.innerHTML = `
    <div class="scout-preview-content">
      <div class="preview-item">
        <strong>Prompt:</strong> 
        <p>${result.data.prompt}</p>
      </div>
      <div class="preview-item">
        <strong>Trends Found:</strong> 
        <p>${result.data.relevant_trends?.length || 0} items</p>
      </div>
      <div class="preview-item">
        <strong>Timestamp:</strong> 
        <p>${result.timestamp}</p>
      </div>
    </div>
  `;
  
  const analyzeButton = document.getElementById('analyze-selected-button');
  if (analyzeButton) {
    analyzeButton.disabled = false;
  }
}

/**
 * Process the selected scout data
 */
function processSelectedScoutData() {
  const select = document.getElementById('scout-results-select');
  if (!select) return;
  
  const resultId = select.value;
  
  if (!resultId) {
    logToConsole("No Scout result selected", "warning");
    return;
  }
  
  const result = scoutResults.find(r => r.id === resultId);
  if (!result) {
    logToConsole("Selected result not found", "error");
    return;
  }
  
  logToConsole(`Processing Scout data from "${result.data.prompt.substring(0, 20)}..."`, "info");
  processAnalystQuery(result.data);
}

/**
 * Process Analyst Query
 */
function processAnalystQuery(predefinedData = null) {
  // Get data from input or use predefined
  let scoutData;
  
  if (predefinedData) {
    scoutData = predefinedData;
  } else {
    const scoutDataInput = document.getElementById("scout-data-input");
    if (!scoutDataInput) return;
    
    const inputValue = scoutDataInput.value;
    if (!inputValue.trim()) {
      logToConsole("Please enter Scout Agent data", "warning");
      return;
    }

    // Parse JSON
    try {
      scoutData = JSON.parse(inputValue);
    } catch (error) {
      logToConsole("Invalid JSON input: " + error.message, "error");
      return;
    }
  }

  // Show loading state
  const graphContainer = document.getElementById("graph-container");
  if (graphContainer) {
    graphContainer.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Generating Knowledge Graph...</p>
      </div>
    `;
  }

  // Send to Analyst Agent
  logToConsole("Sending data to Analyst Agent for processing...", "info");
  fetch(`${apiUrl}/agent/analyst/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scoutData),
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    logToConsole("Analysis complete", "system");
    graphData = data;
    
    // Update UI with results
    if (typeof populateDomainFilter === 'function') populateDomainFilter(data);
    if (typeof renderForceGraph === 'function') renderForceGraph(data);
    if (typeof renderInsights === 'function') renderInsights(data);
    if (typeof generateDataCards === 'function') generateDataCards(data);
  })
  .catch(error => {
    logToConsole(`Analysis error: ${error}`, "error");
    if (graphContainer) {
      graphContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error processing data: ${error.message}</p>
        </div>
      `;
    }
  });
}

/**
 * Populate domain filter based on data
 */
function populateDomainFilter(data) {
  const filter = document.getElementById('domain-filter');
  if (!filter) return;
  
  filter.innerHTML = '<option value="all">All Domains</option>';
  
  // Extract unique domains
  const domains = new Set();
  if (data.original_scout_data && data.original_scout_data.relevant_trends) {
    data.original_scout_data.relevant_trends.forEach(trend => {
      if (trend.domain) domains.add(trend.domain);
    });
  }
  
  // Add options
  domains.forEach(domain => {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    filter.appendChild(option);
  });
}

/**
 * Filter graph by domain
 */
function filterByDomain(domain) {
  if (!graphData || !forceGraph) return;
  
  logToConsole(`Filtering graph by domain: ${domain}`, "info");
  
  if (domain === 'all') {
    // Reset to original graph
    renderForceGraph(graphData);
    return;
  }
  
  // Filter nodes and links
  const filteredData = {
    nodes: graphData.graph_data.nodes.filter(node => node.domain === domain),
    links: []
  };
  
  // Only keep links between remaining nodes
  const nodeIds = new Set(filteredData.nodes.map(n => n.id));
  filteredData.links = graphData.graph_data.links.filter(link => 
    nodeIds.has(link.source) && nodeIds.has(link.target)
  );
  
  // Update graph
  forceGraph.graphData(filteredData);
}

/**
 * Render Force Graph
 */
function renderForceGraph(data) {
  const graphContainer = document.getElementById("graph-container");
  if (!graphContainer) return;
  
  graphContainer.innerHTML = ""; // Clear previous content
  
  if (!data || !data.original_scout_data || !data.original_scout_data.relevant_trends) {
    graphContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>No trend data available for visualization</p>
      </div>
    `;
    return;
  }
  
  // Use the graph data directly if available
  if (data.graph_data && data.graph_data.nodes && data.graph_data.links) {
    forceGraph = ForceGraph()(graphContainer)
      .graphData(data.graph_data)
      .nodeId('id')
      .nodeLabel(node => `${node.title} (${node.type})`)
      .nodeColor(node => node.color || getNodeColor(node))
      .nodeRelSize(currentNodeSize)
      .linkWidth(link => link.weight || 1)
      .linkDirectionalParticles(2)
      .linkDirectionalParticleWidth(link => link.weight || 1)
      .onNodeClick(node => {
        selectedNodeId = node.id;
        showNodeDetails(node);
      })
      .onLinkClick(link => showLinkDetails(link))
      .nodeCanvasObject(renderNode);
      
    logToConsole(`Rendered graph with ${data.graph_data.nodes.length} nodes and ${data.graph_data.links.length} links`, "info");
    return;
  }
  
  // If no graph_data, build it from trends
  const trends = data.original_scout_data.relevant_trends;
  const nodes = [];
  const links = [];
  const nodeMap = new Map();
  
  // Process trend nodes and their relationships
  trends.forEach((trend, index) => {
    const nodeId = trend.id || `trend-${index}`;
    nodes.push({
      id: nodeId,
      title: trend.title || "Unnamed Trend",
      type: "trend",
      domain: trend.domain || "Unknown",
      similarity_score: trend.similarity_score || 0,
      data: trend
    });
    nodeMap.set(nodeId, nodes[nodes.length - 1]);
    
    // Process technologies
    if (Array.isArray(trend.technologies)) {
      trend.technologies.forEach(tech => {
        const techId = `tech-${tech.replace(/\s+/g, '-').toLowerCase()}`;
        
        if (!nodeMap.has(techId)) {
          nodes.push({
            id: techId,
            title: tech,
            type: "technology",
            domain: trend.domain || "Unknown"
          });
          nodeMap.set(techId, nodes[nodes.length - 1]);
        }
        
        links.push({
          source: nodeId,
          target: techId,
          type: "uses",
          weight: 1
        });
      });
    }
    
    // Process keywords
    if (Array.isArray(trend.keywords)) {
      trend.keywords.forEach(keyword => {
        const keywordId = `keyword-${keyword.replace(/\s+/g, '-').toLowerCase()}`;
        
        if (!nodeMap.has(keywordId)) {
          nodes.push({
            id: keywordId,
            title: keyword,
            type: "keyword",
            domain: trend.domain || "Unknown"
          });
          nodeMap.set(keywordId, nodes[nodes.length - 1]);
        }
        
        links.push({
          source: nodeId,
          target: keywordId,
          type: "has",
          weight: 0.7
        });
      });
    }
  });
  
  // Add connections between trends
  trends.forEach((trend1, i) => {
    const trend1Id = trend1.id || `trend-${i}`;
    trends.slice(i + 1).forEach((trend2, j) => {
      const trend2Id = trend2.id || `trend-${i + j + 1}`;
      
      // Connect if similar domain or score
      if ((trend1.domain === trend2.domain) || 
          (trend1.similarity_score && trend2.similarity_score && 
           Math.abs(trend1.similarity_score - trend2.similarity_score) < 0.2)) {
        
        const weight = (trend1.domain === trend2.domain) ? 2 : 1;
        links.push({
          source: trend1Id,
          target: trend2Id,
          type: "related",
          weight: weight
        });
      }
    });
  });
  
  // Store graph data
  data.graph_data = { nodes, links };
  
  // Create Force Graph
  forceGraph = ForceGraph()(graphContainer)
    .graphData({ nodes, links })
    .nodeId('id')
    .nodeLabel(node => `${node.title} (${node.type})`)
    .nodeColor(node => getNodeColor(node))
    .nodeRelSize(currentNodeSize)
    .linkWidth(link => link.weight || 1)
    .linkDirectionalParticles(2)
    .linkDirectionalParticleWidth(link => link.weight || 1)
    .onNodeClick(node => {
      selectedNodeId = node.id;
      showNodeDetails(node);
    })
    .onLinkClick(link => showLinkDetails(link))
    .nodeCanvasObject(renderNode);
    
  logToConsole(`Built and rendered graph with ${nodes.length} nodes and ${links.length} links`, "info");
}

/**
 * Get color for node type
 */
function getNodeColor(node) {
  switch(node.type) {
    case 'trend': return '#4a6de5';
    case 'technology': return '#28a745';
    case 'keyword': return '#fd7e14';
    default: return '#6c757d';
  }
}

/**
 * Custom node rendering function
 */
function renderNode(node, ctx, globalScale) {
  // Node base rendering
  const label = node.title;
  const fontSize = 12/globalScale;
  const nodeSize = (node.id === selectedNodeId) 
    ? (14/globalScale) 
    : ((node.similarity_score || 1) * 10/globalScale);
  
  ctx.beginPath();
  ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
  ctx.fillStyle = (node.id === selectedNodeId) 
    ? '#ff5252'  // Highlighted node
    : node.color || getNodeColor(node);
  ctx.fill();
  
  // Add text only if zoomed in enough
  if (globalScale > 0.4) {
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText(label, node.x, node.y);
  }
}

/**
 * Show link details
 */
function showLinkDetails(link) {
  logToConsole(`Link selected: ${link.source.title || link.source} → ${link.target.title || link.target}`, "info");
  
  if (!forceGraph) return;
  
  // Clear any selected node
  selectedNodeId = null;
  
  if (typeof link.source === 'object') {
    // Highlight source and target nodes
    forceGraph
      .nodeColor(node => {
        if (node.id === link.source.id || node.id === link.target.id) {
          return '#ff5252'; // Highlight color
        }
        
        return getNodeColor(node);
      })
      .refresh();
  }
}

/**
 * Show node details
 */
function showNodeDetails(node) {
  const modal = document.getElementById('node-details-modal');
  if (!modal) return;
  
  document.getElementById('node-details-title').textContent = node.title || 'Node Details';
  
  let detailsHtml = `
    <div class="node-details">
      <p><strong>Type:</strong> ${node.type || 'Unknown'}</p>
      <p><strong>Domain:</strong> ${node.domain || 'Not specified'}</p>
  `;
  
  // Add additional details based on node type
  if (node.type === 'trend') {
    const trend = node.data || {};
    detailsHtml += `
      <p><strong>Knowledge Type:</strong> ${trend.knowledge_type || 'Not specified'}</p>
      <p><strong>Publication Date:</strong> ${trend.publication_date || 'Not specified'}</p>
      <p><strong>Similarity Score:</strong> ${(trend.similarity_score || 0).toFixed(4)}</p>
      <p><strong>Data Quality Score:</strong> ${(trend.data_quality_score || 0).toFixed(2)}</p>
      
      <div class="details-section">
        <h5>Summary</h5>
        <p>${trend.summary_text || 'No summary available'}</p>
      </div>
    `;
    
    // Add technologies if available
    if (trend.technologies && trend.technologies.length > 0) {
      detailsHtml += `
        <div class="details-section">
          <h5>Technologies</h5>
          <ul>
            ${trend.technologies.map(tech => `<li>${tech}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    // Add keywords if available
    if (trend.keywords && trend.keywords.length > 0) {
      detailsHtml += `
        <div class="details-section">
          <h5>Keywords</h5>
          <ul>
            ${trend.keywords.map(keyword => `<li>${keyword}</li>`).join('')}
          </ul>
        </div>
      `;
    }
  }
  
  detailsHtml += `</div>`;
  document.getElementById('node-details-body').innerHTML = detailsHtml;
  
  // Show the modal
  modal.style.display = 'block';
  
  // Setup close button events
  document.querySelector('.close-modal').onclick = function() {
    modal.style.display = 'none';
    selectedNodeId = null;
    if (forceGraph) forceGraph.refresh();
  };
  document.querySelector('.close-button').onclick = function() {
    modal.style.display = 'none';
    selectedNodeId = null;
    if (forceGraph) forceGraph.refresh();
  };
  
  // Close when clicking outside
  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
      selectedNodeId = null;
      if (forceGraph) forceGraph.refresh();
    }
  };
}

/**
 * Show related nodes
 */
function showRelatedNodes() {
  if (!selectedNodeId || !forceGraph) return;
  
  const graphData = forceGraph.graphData();
  
  // Find links connected to the selected node
  const connectedLinks = graphData.links.filter(link => 
    (typeof link.source === 'object' ? link.source.id : link.source) === selectedNodeId ||
    (typeof link.target === 'object' ? link.target.id : link.target) === selectedNodeId
  );
  
  // Get connected node IDs
  const connectedNodeIds = new Set();
  connectedLinks.forEach(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    if (sourceId !== selectedNodeId) connectedNodeIds.add(sourceId);
    if (targetId !== selectedNodeId) connectedNodeIds.add(targetId);
  });
  
  logToConsole(`Found ${connectedNodeIds.size} related nodes`, "info");
  
  // Highlight the connected nodes
  forceGraph
    .nodeColor(node => {
      if (node.id === selectedNodeId) {
        return '#ff5252'; // Selected node
      } else if (connectedNodeIds.has(node.id)) {
        return '#ffab00'; // Connected nodes
      }
      
      // Default colors
      return getNodeColor(node);
    })
    .linkWidth(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return 4; // Highlight connected links
      }
      return link.weight || 1;
    })
    .linkDirectionalParticles(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return 4;
      }
      return 0;
    })
    .refresh();
    
  // Close the modal
  const modal = document.getElementById('node-details-modal');
  if (modal) modal.style.display = 'none';
}

/**
 * Update node size
 */
function updateNodeSize(size) {
  currentNodeSize = size;
  if (forceGraph) {
    forceGraph.nodeRelSize(currentNodeSize);
  }
}

/**
 * Toggle fullscreen for graph
 */
function toggleFullscreenGraph() {
  const container = document.querySelector('.graph-visualization');
  if (!container) return;
  
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    }
    logToConsole("Entered fullscreen mode", "info");
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    logToConsole("Exited fullscreen mode", "info");
  }
}

/**
 * Download graph as image
 */
function downloadGraphImage() {
  if (!forceGraph) {
    logToConsole("No graph to download", "warning");
    return;
  }
  
  try {
    // Get canvas from force graph
    const canvas = document.querySelector('.graph-visualization canvas');
    if (!canvas) {
      logToConsole("Graph canvas not found", "error");
      return;
    }
    
    // Create a download link
    const link = document.createElement('a');
    link.download = 'knowledge-graph.png';
    link.href = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logToConsole("Graph image downloaded", "info");
  } catch (error) {
    logToConsole(`Error downloading image: ${error.message}`, "error");
  }
}

/**
 * Search for nodes
 */
function searchNodes() {
  const searchTerm = document.getElementById('node-search')?.value?.toLowerCase();
  
  if (!searchTerm || !forceGraph || !graphData) return;
  
  logToConsole(`Searching for: ${searchTerm}`, "info");
  
  // Find matching nodes
  const matchingNodes = graphData.graph_data.nodes.filter(node => 
    (node.title && node.title.toLowerCase().includes(searchTerm)) ||
    (node.id && node.id.toLowerCase().includes(searchTerm))
  );
  
  if (matchingNodes.length === 0) {
    logToConsole(`No nodes found matching "${searchTerm}"`, "warning");
    return;
  }
  
  // Highlight the first matching node
  const firstMatch = matchingNodes[0];
  
  // Center view on the node
  forceGraph.centerAt(
    firstMatch.x, 
    firstMatch.y, 
    1000 // transition duration
  );
  
  setTimeout(() => {
    forceGraph.zoom(2.5, 1000); // zoom level, transition duration
    
    // Highlight the node
    selectedNodeId = firstMatch.id;
    forceGraph.refresh();
    
    // Show node details
    showNodeDetails(firstMatch);
  }, 1000);
  
  logToConsole(`Found ${matchingNodes.length} matching nodes`, "info");
}

/**
 * Switch between graph and card views
 */
function switchView(viewType) {
  // Update button states
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.view-btn[data-view="${viewType}"]`)?.classList.add('active');
  
  // Show/hide appropriate containers
  if (viewType === 'graph') {
    document.querySelector('.graph-visualization').style.display = 'block';
    document.getElementById('data-cards-container').style.display = 'none';
  } else {
    document.querySelector('.graph-visualization').style.display = 'none';
    document.getElementById('data-cards-container').style.display = 'grid';
  }
  
  logToConsole(`Switched to ${viewType} view`, "info");
}

/**
 * Generate data cards for card view
 */
function generateDataCards(data) {
  const cardsContainer = document.getElementById('data-cards-container');
  if (!cardsContainer) return;
  
  cardsContainer.innerHTML = "";
  
  if (!data || !data.original_scout_data || !data.original_scout_data.relevant_trends) {
    cardsContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>No trend data available</p>
      </div>
    `;
    return;
  }
  
  const trends = data.original_scout_data.relevant_trends;
  
  trends.forEach(trend => {
    // Create card element
    const card = document.createElement('div');
    card.className = 'data-card';
    
    // Calculate color based on domain
    let domainColor = '#4a6de5'; // Default blue
    if (trend.domain) {
      switch(trend.domain.toLowerCase()) {
        case 'healthcare': domainColor = '#28a745'; break; // Green
        case 'mobility': domainColor = '#fd7e14'; break; // Orange
        case 'technology': domainColor = '#17a2b8'; break; // Teal
      }
    }
    
    card.innerHTML = `
      <div class="card-header" style="border-color: ${domainColor}">
        <h3 class="card-title">${trend.title || 'Unnamed Trend'}</h3>
        <span class="card-badge" style="background-color: ${domainColor}">${trend.domain || 'Unknown'}</span>
      </div>
      <div class="card-body">
        <p class="card-summary">${trend.summary_text || 'No summary available'}</p>
        <div class="card-details">
          <div class="detail-item">
            <span class="detail-label">Type:</span>
            <span class="detail-value">${trend.knowledge_type || 'Unknown'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Publication:</span>
            <span class="detail-value">${trend.publication_date || 'Unknown'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Similarity:</span>
            <span class="detail-value">${(trend.similarity_score || 0).toFixed(4)}</span>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <div class="tags-container">
          ${Array.isArray(trend.keywords) && trend.keywords.length > 0 
            ? trend.keywords.slice(0, 3).map(kw => `<span class="tag">${kw}</span>`).join('') 
            : '<span class="tag muted">No keywords</span>'}
        </div>
        <button class="card-action-btn" onclick="showCardDetails('${trend.id}')">
          <i class="fas fa-info-circle"></i> Details
        </button>
      </div>
    `;
    
    cardsContainer.appendChild(card);
  });
  
  logToConsole(`Generated ${trends.length} data cards`, "info");
}

/**
 * Show details for a specific card
 */
function showCardDetails(trendId) {
  if (!graphData || !graphData.original_scout_data) return;
  
  const trend = graphData.original_scout_data.relevant_trends.find(t => t.id === trendId);
  if (!trend) {
    logToConsole(`Trend with ID ${trendId} not found`, "error");
    return;
  }
  
  // Create a node-like object to pass to showNodeDetails
  const nodeObj = {
    id: trend.id,
    title: trend.title,
    type: 'trend',
    domain: trend.domain,
    data: trend
  };
  
  // Show details modal
  showNodeDetails(nodeObj);
}

/**
 * Render insights
 */
function renderInsights(data) {
  const insightsContainer = document.getElementById("insights-container");
  if (!insightsContainer) return;
  
  insightsContainer.innerHTML = ""; // Clear previous content

  // Check for error
  if (data.error) {
    insightsContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>${data.error}</p>
      </div>
    `;
    return;
  }

  const insights = data.graph_insights || {};

  // Create insights section
  const insightsDiv = document.createElement("div");
  insightsDiv.classList.add("insights-details");

  // Render different types of insights
  const sections = [
    { key: "central_technologies", title: "Central Technologies", icon: "fa-microchip" },
    { key: "cross_domain_connections", title: "Cross-Domain Connections", icon: "fa-link" },
    { key: "innovation_pathways", title: "Innovation Pathways", icon: "fa-road" },
  ];

  sections.forEach((section) => {
    if (insights[section.key]) {
      const sectionDiv = document.createElement("div");
      sectionDiv.classList.add("insight-section");

      const titleEl = document.createElement("h4");
      titleEl.innerHTML = `<i class="fas ${section.icon}"></i> ${section.title}`;
      sectionDiv.appendChild(titleEl);

      const contentEl = document.createElement("div");
      contentEl.classList.add("insight-content");
      contentEl.innerHTML = insights[section.key].replace(/\n/g, '<br>');
      sectionDiv.appendChild(contentEl);

      insightsDiv.appendChild(sectionDiv);
    }
  });

  insightsContainer.appendChild(insightsDiv);
}

// ==================================================
// INITIALIZATION FUNCTIONS
// ==================================================

/**
 * Initialize the page based on current page type
 */
document.addEventListener("DOMContentLoaded", function() {
  // Determine which page we're on
  const currentPage = getCurrentPage();
  
  // Connect socket for any page
  connectSocket();
  
  // Initialize based on page type
  switch(currentPage) {
    case 'chatbot':
      // Nothing specific needed for chatbot beyond the shared initialization
      logToConsole("ChatBot interface initialized", "system");
      break;
      
    case 'scout':
      // Initialize Scout Agent specific features
      document.getElementById("response-box").style.display = "none";
      logToConsole("Scout Agent interface initialized", "system");
      break;
      
    case 'analyst':
      // Initialize Analyst Agent specific features
      // Setup tab switching
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
      });
      
      // Setup scout result selection
      const resultSelector = document.getElementById('scout-results-select');
      if (resultSelector) {
        resultSelector.addEventListener('change', handleScoutResultSelection);
      }
      
      // Hide response box until we have data
      const responseBox = document.getElementById("response-box");
      if (responseBox) responseBox.style.display = "none";
      
      logToConsole("Analyst Agent interface initialized", "system");
      break;
  }
});

/**
 * Determine which page we're currently on
 */
function getCurrentPage() {
  // Check for page-specific elements
  if (document.getElementById('chat-query')) {
    return 'chatbot';
  } else if (document.getElementById('scout-prompt')) {
    return 'scout';
  } else if (document.getElementById('scout-data-input')) {
    return 'analyst';
  }
  
  // Default to home page
  return 'home';
}