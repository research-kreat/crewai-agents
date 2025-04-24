// ==================================================
// ANALYST AGENT FUNCTIONALITY
// ==================================================

// Graph visualization variables
let graphData = null;
let forceGraph = null;
let selectedNodeId = null;
let currentNodeSize = 8;

// Scout results storage if needed in analyst page
let scoutResults = [];

/**
 * Switch between tabs in the Analyst interface
 */
function switchTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active");
  });

  // Deactivate all tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  // Activate selected tab
  document.getElementById(tabId).classList.add("active");
  document
    .querySelector(`.tab-btn[data-tab="${tabId}"]`)
    .classList.add("active");

  logToConsole(`Switched to ${tabId} tab`, "info");
}

/**
 * Update Scout Results UI in Analyst Agent page
 */
function updateScoutResultsUI() {
  // Check if we're on the analyst page
  const resultsContainer = document.getElementById("scout-results-container");
  if (!resultsContainer) return;

  // Clear container
  resultsContainer.innerHTML = "";

  if (scoutResults.length === 0) {
    resultsContainer.innerHTML = `
      <div class="no-results-message">
        <i class="fas fa-search"></i>
        <p>No Scout results available. Run some queries first.</p>
      </div>
    `;
    return;
  }

  // Sort results by timestamp (newest first)
  const sortedResults = [...scoutResults].sort((a, b) => {
    return (
      new Date(b.date + " " + b.timestamp) -
      new Date(a.date + " " + a.timestamp)
    );
  });

  // Group by date
  const resultsByDate = {};
  sortedResults.forEach((result) => {
    if (!resultsByDate[result.date]) {
      resultsByDate[result.date] = [];
    }
    resultsByDate[result.date].push(result);
  });

  // Create date groups
  Object.keys(resultsByDate)
    .sort((a, b) => new Date(b) - new Date(a))
    .forEach((date) => {
      // Create date header
      const dateHeader = document.createElement("div");
      dateHeader.className = "results-date-header";
      dateHeader.textContent = date;
      resultsContainer.appendChild(dateHeader);

      // Create results grid for this date
      const resultsGrid = document.createElement("div");
      resultsGrid.className = "scout-results-grid";

      // Add result cards
      resultsByDate[date].forEach((result) => {
        const card = createScoutResultCard(result);
        resultsGrid.appendChild(card);
      });

      resultsContainer.appendChild(resultsGrid);
    });
}

/**
 * Create a Scout Result Card
 */
function createScoutResultCard(result) {
  const card = document.createElement("div");
  card.className = "scout-result-card";
  card.setAttribute("data-id", result.id);

  // Determine color based on domain (if available)
  let mainDomain = "Unknown";
  let domainColor = "#6c757d"; // default gray

  if (result.data.relevant_trends && result.data.relevant_trends.length > 0) {
    // Count domains to find the most common one
    const domainCounts = {};
    result.data.relevant_trends.forEach((trend) => {
      if (trend.domain) {
        domainCounts[trend.domain] = (domainCounts[trend.domain] || 0) + 1;
      }
    });

    // Find the most common domain
    let maxCount = 0;
    Object.keys(domainCounts).forEach((domain) => {
      if (domainCounts[domain] > maxCount) {
        maxCount = domainCounts[domain];
        mainDomain = domain;
      }
    });

    // Set color based on domain
    switch (mainDomain.toLowerCase()) {
      case "healthcare":
        domainColor = "#28a745"; // green
        break;
      case "mobility":
        domainColor = "#fd7e14"; // orange
        break;
      case "technology":
        domainColor = "#17a2b8"; // teal
        break;
    }
  }

  // Format timestamp
  const formattedTime = result.timestamp;

  // Get number of trends
  const trendsCount = result.data.relevant_trends?.length || 0;

  // Truncate prompt for display
  const promptDisplay =
    result.prompt.length > 60
      ? result.prompt.substring(0, 60) + "..."
      : result.prompt;

  // Generate card HTML
  card.innerHTML = `
    <div class="card-header" style="border-color: ${domainColor}">
      <div class="card-time">${formattedTime}</div>
      <div class="card-actions">
        <button class="card-action-btn copy-btn" title="Copy JSON to clipboard">
          <i class="fas fa-copy"></i>
        </button>
        <button class="card-action-btn analyze-btn" title="Analyze with Analyst Agent">
          <i class="fas fa-chart-line"></i>
        </button>
        <button class="card-action-btn delete-btn" title="Delete this result">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-prompt">${promptDisplay}</div>
      <div class="card-stats">
        <span class="card-domain" style="background-color: ${domainColor}">${mainDomain}</span>
        <span class="card-trends-count">${trendsCount} trends</span>
      </div>
    </div>
  `;

  // Add event listeners
  card.querySelector(".analyze-btn").addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent card click
    processScoutResultById(result.id);
  });

  card.querySelector(".delete-btn").addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent card click
    deleteScoutResult(result.id);
  });

  // Add event listener for the copy button
  card.querySelector(".copy-btn").addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent card click
    copyScoutResultJson(result.id);
  });

  // Make whole card clickable to preview
  card.addEventListener("click", () => {
    previewScoutResult(result);
  });

  return card;
}

/**
 * Delete a scout result
 */
function deleteScoutResult(resultId) {
  // Remove from array
  scoutResults = scoutResults.filter((result) => result.id !== resultId);

  // Remove from localStorage
  localStorage.removeItem(`scoutResult_${resultId}`);

  // Update index
  saveScoutResultsToLocalStorage();

  // Update UI
  updateScoutResultsUI();

  logToConsole(`Deleted scout result ${resultId}`, "info");
  showToast("Result deleted");
}

/**
 * Save scout results to localStorage
 */
function saveScoutResultsToLocalStorage() {
  try {
    // Create a version suitable for storage
    const storageData = scoutResults.map((result) => ({
      id: result.id,
      timestamp: result.timestamp,
      date: result.date,
      prompt: result.prompt,
      // Only store essential data to save space
      summary: result.data.response_to_user_prompt || "",
      trendsCount: result.data.relevant_trends?.length || 0,
    }));

    localStorage.setItem("scoutResultsIndex", JSON.stringify(storageData));

    // Store each full result separately to avoid size limits
    scoutResults.forEach((result) => {
      localStorage.setItem(
        `scoutResult_${result.id}`,
        JSON.stringify(result.data)
      );
    });

    logToConsole("Scout results saved to localStorage", "system");
  } catch (e) {
    logToConsole(`Error saving to localStorage: ${e.message}`, "error");
  }
}

/**
 * Load scout results from localStorage
 */
function loadScoutResultsFromLocalStorage() {
  try {
    const storedIndex = localStorage.getItem("scoutResultsIndex");
    if (!storedIndex) return;

    const indexData = JSON.parse(storedIndex);

    // Clear current results
    scoutResults = [];

    // Load each result
    indexData.forEach((item) => {
      const storedData = localStorage.getItem(`scoutResult_${item.id}`);
      if (storedData) {
        scoutResults.push({
          id: item.id,
          timestamp: item.timestamp,
          date: item.date,
          prompt: item.prompt,
          data: JSON.parse(storedData),
        });
      }
    });

    logToConsole(
      `Loaded ${scoutResults.length} scout results from localStorage`,
      "system"
    );

    // Update UI
    updateScoutResultsUI();
  } catch (e) {
    logToConsole(`Error loading from localStorage: ${e.message}`, "error");
  }
}

/**
 * Preview a Scout Result
 */
function previewScoutResult(result) {
  const previewElement = document.getElementById("scout-result-preview");
  if (!previewElement) return;

  previewElement.innerHTML = `
      <div class="preview-header">
        <h4>Query: "${result.prompt}"</h4>
        <span class="preview-timestamp">${result.date} at ${
    result.timestamp
  }</span>
        <button class="preview-copy-btn" onclick="copyScoutResultJson('${
          result.id
        }')">
          <i class="fas fa-copy"></i> Copy JSON
        </button>
      </div>
      <div class="preview-content">
        <div class="preview-response">
          ${
            result.data.response_to_user_prompt ||
            "No direct response available"
          }
        </div>
        <div class="preview-stats">
          <div class="preview-stat">
            <span class="stat-label">Trends Found:</span>
            <span class="stat-value">${
              result.data.relevant_trends?.length || 0
            }</span>
          </div>
          <div class="preview-stat">
            <span class="stat-label">Data Available:</span>
            <span class="stat-value">${result.data.isData ? "Yes" : "No"}</span>
          </div>
        </div>
        <div class="preview-actions">
          <button class="primary-button analyze-preview-btn" id="analyze-id-btn" onclick="processScoutResultById('${
            result.id
          }')">
            <i class="fas fa-chart-line"></i> Analyze This Data
          </button>
        </div>
      </div>
    `;

  // Check if analyze button exists before trying to enable it
  const analyzeButton = document.getElementById("analyze-selected-button");
  if (analyzeButton) {
    analyzeButton.disabled = false;
  }
}

/**
 * Process Analyst Query with proper button handling
 */
function processAnalystQuery(predefinedData = null) {
  // Either use predefined data or get from textarea
  let scoutData;

  if (predefinedData) {
    scoutData = predefinedData;
  } else {
    const scoutDataInput = document.getElementById("scout-data-input").value;

    // Validate input
    if (!scoutDataInput.trim()) {
      logToConsole("Please enter Scout Agent data", "warning");
      showToast("Please enter Scout Agent data");
      return;
    }

    // Parse JSON
    try {
      scoutData = JSON.parse(scoutDataInput);
    } catch (error) {
      logToConsole("Invalid JSON input: " + error.message, "error");
      showToast("Invalid JSON format: " + error.message);
      return;
    }
  }

  // IMPORTANT FIX: Disable buttons directly without using the utility function
  // This ensures buttons are definitely disabled regardless of any state tracking issues
  const analyzeButton = document.getElementById("analyze-button");
  if (analyzeButton) {
    analyzeButton.disabled = true;
    analyzeButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    analyzeButton.style.opacity = "0.7";
    analyzeButton.style.cursor = "not-allowed";
  }

  const analyzeIdButton = document.getElementById("analyze-id-btn");
  if (analyzeIdButton) {
    analyzeIdButton.disabled = true;
    analyzeIdButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    analyzeIdButton.style.opacity = "0.7";
    analyzeIdButton.style.cursor = "not-allowed";
  }

  // Disable all analyze buttons in result cards
  document.querySelectorAll(".analyze-btn").forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
  });

  // Show loading state for graph
  document.getElementById("graph-container").innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Generating Knowledge Graph...</p>
    </div>
  `;

  // Show loading state for S-Curve
  document.getElementById("s-curve-container").innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Generating S-Curve Visualization...</p>
    </div>
  `;

  // Show loading state for insights
  document.getElementById("insights-container").innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Generating insights...</p>
    </div>
  `;

  // Send to Analyst Agent
  logToConsole("Sending data to Analyst Agent for processing...", "info");
  fetch(`${apiUrl}/agent/analyst/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(scoutData),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      logToConsole("Analysis complete", "system");
      saveAnalystResultToLocalStorage(data);

      graphData = data;

      // Populate domain filter
      populateDomainFilter(data);

      // Render Knowledge Graph
      renderForceGraph(data);

      // Render S-Curve Visualization
      try {
        renderSCurve(data);
      } catch (error) {
        logToConsole(
          `Error in S-Curve visualization: ${error.message}`,
          "error"
        );
        document.getElementById("s-curve-container").innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>Error generating S-Curve: ${error.message}</p>
          </div>
        `;
      }

      // Render Insights
      renderInsights(data);

      // Generate data cards
      generateDataCards(data);

      // IMPORTANT FIX: Re-enable buttons directly
      if (analyzeButton) {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze Trends';
        analyzeButton.style.opacity = "";
        analyzeButton.style.cursor = "";
      }

      if (analyzeIdButton) {
        analyzeIdButton.disabled = false;
        analyzeIdButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze This Data';
        analyzeIdButton.style.opacity = "";
        analyzeIdButton.style.cursor = "";
      }

      // Re-enable all analyze buttons in result cards
      document.querySelectorAll(".analyze-btn").forEach((btn) => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-chart-line"></i>';
        btn.style.opacity = "";
        btn.style.cursor = "";
      });

      showToast("Analysis completed successfully");
    })
    .catch((error) => {
      logToConsole(`Analysis error: ${error}`, "error");

      // Show error message for graph
      document.getElementById("graph-container").innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error processing data: ${error.message}</p>
        </div>
      `;

      // Show error message for S-Curve
      document.getElementById("s-curve-container").innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error processing data: ${error.message}</p>
        </div>
      `;

      // Show error message for insights
      document.getElementById("insights-container").innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error generating insights: ${error.message}</p>
        </div>
      `;

      showToast("Analysis failed: " + error.message);

      // IMPORTANT FIX: Re-enable buttons directly even in case of error
      if (analyzeButton) {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze Trends';
        analyzeButton.style.opacity = "";
        analyzeButton.style.cursor = "";
      }

      if (analyzeIdButton) {
        analyzeIdButton.disabled = false;
        analyzeIdButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze This Data';
        analyzeIdButton.style.opacity = "";
        analyzeIdButton.style.cursor = "";
      }

      // Re-enable all analyze buttons in result cards
      document.querySelectorAll(".analyze-btn").forEach((btn) => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-chart-line"></i>';
        btn.style.opacity = "";
        btn.style.cursor = "";
      });
    });
}

/**
 * Process a Scout Result by ID with proper button handling
 */
function processScoutResultById(resultId) {
  const result = scoutResults.find((r) => r.id === resultId);
  if (!result) {
    logToConsole(`Result with ID ${resultId} not found`, "error");
    showToast(`Result with ID ${resultId} not found`);
    return;
  }

  // IMPORTANT FIX: Directly disable the clicked button
  const clickedButton = document.getElementById("analyze-id-btn");
  if (clickedButton) {
    clickedButton.disabled = true;
    clickedButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    clickedButton.style.opacity = "0.7";
    clickedButton.style.cursor = "not-allowed";
  }

  // Disable analyze buttons in the cards
  document.querySelectorAll(".analyze-btn").forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
  });

  // Disable the main analyze button as well
  const analyzeButton = document.getElementById("analyze-button");
  if (analyzeButton) {
    analyzeButton.disabled = true;
    analyzeButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    analyzeButton.style.opacity = "0.7";
    analyzeButton.style.cursor = "not-allowed";
  }

  logToConsole(
    `Processing Scout result: ${result.prompt.substring(0, 30)}...`,
    "info"
  );

  // Process the data
  processAnalystQuery(result.data);
  // Note: The buttons will be re-enabled in the processAnalystQuery function
}

// Populate domain filter based on data
function populateDomainFilter(data) {
  const filter = document.getElementById("domain-filter");
  filter.innerHTML = '<option value="all">All Domains</option>';

  // Extract unique domains
  const domains = new Set();
  if (data.original_scout_data && data.original_scout_data.relevant_trends) {
    data.original_scout_data.relevant_trends.forEach((trend) => {
      if (trend.domain) domains.add(trend.domain);
    });
  }

  // Add options
  domains.forEach((domain) => {
    const option = document.createElement("option");
    option.value = domain;
    option.textContent = domain;
    filter.appendChild(option);
  });
}

// Filter graph by domain
function filterByDomain(domain) {
  if (!graphData || !forceGraph) return;

  logToConsole(`Filtering graph by domain: ${domain}`, "info");

  if (domain === "all") {
    // Reset to original graph
    renderForceGraph(graphData);
    return;
  }

  // Filter nodes and links
  const filteredData = {
    nodes: graphData.graph_data.nodes.filter((node) => node.domain === domain),
    links: [],
  };

  // Only keep links between remaining nodes
  const nodeIds = new Set(filteredData.nodes.map((n) => n.id));
  filteredData.links = graphData.graph_data.links.filter(
    (link) => nodeIds.has(link.source) && nodeIds.has(link.target)
  );

  // Update graph
  forceGraph.graphData(filteredData);
}

// Search for nodes
function searchNodes() {
  const searchTerm = document.getElementById("node-search").value.toLowerCase();
  if (!searchTerm || !forceGraph) return;

  logToConsole(`Searching for: ${searchTerm}`, "info");

  // Find matching nodes
  const matchingNodes = graphData.graph_data.nodes.filter(
    (node) =>
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

    forceGraph.nodeColor((node) => {
      if (node.id === selectedNodeId) {
        return "#ff5252"; // Highlighted node color
      }

      // Default node colors
      switch (node.type) {
        case "trend":
          return "#4a6de5";
        case "technology":
          return "#28a745";
        case "keyword":
          return "#fd7e14";
        default:
          return "#6c757d";
      }
    });

    // Show node details
    showNodeDetails(firstMatch);
  }, 1000);

  logToConsole(`Found ${matchingNodes.length} matching nodes`, "info");
}

// Switch between graph and card views
function switchView(viewType) {
  // Update button states
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .querySelector(`.view-btn[data-view="${viewType}"]`)
    .classList.add("active");

  // Show/hide appropriate containers
  if (viewType === "graph") {
    document.querySelector(".graph-visualization").style.display = "block";
    document.querySelector(".s-visualization").style.display = "block";
    document.getElementById("data-cards-container").style.display = "none";
  } else {
    document.querySelector(".graph-visualization").style.display = "none";
    document.querySelector(".s-visualization").style.display = "none";
    document.getElementById("data-cards-container").style.display = "grid";
  }

  logToConsole(`Switched to ${viewType} view`, "info");
}

// Render Force Graph using force-graph library
function renderForceGraph(data) {
  const graphContainer = document.getElementById("graph-container");
  graphContainer.innerHTML = ""; // Clear previous content

  if (
    !data ||
    !data.original_scout_data ||
    !data.original_scout_data.relevant_trends
  ) {
    graphContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>No trend data available for visualization</p>
      </div>
    `;
    return;
  }

  // Transform scout data into graph structure
  const trends = data.original_scout_data.relevant_trends;

  // Generate graph data
  const nodes = [];
  const links = [];
  const nodeMap = new Map();

  // Add trend nodes
  trends.forEach((trend, index) => {
    const node = {
      id: trend.id || `trend-${index}`,
      title: trend.title || "Unnamed Trend",
      type: "trend",
      domain: trend.domain || "Unknown",
      knowledge_type: trend.knowledge_type || "Unknown",
      similarity_score: trend.similarity_score || 0,
      data: trend,
    };

    nodes.push(node);
    nodeMap.set(node.id, node);

    // Add technology nodes from each trend
    if (trend.technologies && Array.isArray(trend.technologies)) {
      trend.technologies.forEach((tech) => {
        const techId = `tech-${tech.replace(/\s+/g, "-").toLowerCase()}`;

        // Only add if not already in nodes
        if (!nodeMap.has(techId)) {
          const techNode = {
            id: techId,
            title: tech,
            type: "technology",
            domain: trend.domain || "Unknown",
          };
          nodes.push(techNode);
          nodeMap.set(techId, techNode);
        }

        // Add link from trend to technology
        links.push({
          source: node.id,
          target: techId,
          type: "uses",
        });
      });
    }

    // Add keyword nodes
    if (trend.keywords && Array.isArray(trend.keywords)) {
      trend.keywords.forEach((keyword) => {
        const keywordId = `keyword-${keyword
          .replace(/\s+/g, "-")
          .toLowerCase()}`;

        if (!nodeMap.has(keywordId)) {
          const keywordNode = {
            id: keywordId,
            title: keyword,
            type: "keyword",
            domain: trend.domain || "Unknown",
          };
          nodes.push(keywordNode);
          nodeMap.set(keywordId, keywordNode);
        }

        links.push({
          source: node.id,
          target: keywordId,
          type: "has",
        });
      });
    }
  });

  // Add connections between trends based on similarity
  trends.forEach((trend1, i) => {
    trends.slice(i + 1).forEach((trend2) => {
      // Add link if they share domain or have similar scores
      if (
        trend1.domain === trend2.domain ||
        (trend1.similarity_score &&
          trend2.similarity_score &&
          Math.abs(trend1.similarity_score - trend2.similarity_score) < 0.2)
      ) {
        const weight = trend1.domain === trend2.domain ? 2 : 1;
        links.push({
          source: trend1.id || `trend-${i}`,
          target: trend2.id || `trend-${trends.indexOf(trend2)}`,
          type: "related",
          value: weight,
        });
      }
    });
  });

  // Save graph data for future reference
  data.graph_data = { nodes, links };

  // Create Force Graph
  forceGraph = ForceGraph()(graphContainer)
    .graphData({ nodes, links })
    .nodeId("id")
    .nodeLabel((node) => `${node.title} (${node.type})`)
    .nodeColor((node) => {
      switch (node.type) {
        case "trend":
          return "#4a6de5";
        case "technology":
          return "#28a745";
        case "keyword":
          return "#fd7e14";
        default:
          return "#6c757d";
      }
    })
    .nodeRelSize(currentNodeSize)
    .linkWidth((link) => link.value || 1)
    .linkDirectionalParticles(2)
    .linkDirectionalParticleWidth((link) => link.value || 1)
    .onNodeClick((node) => {
      selectedNodeId = node.id;
      showNodeDetails(node);
    })
    .onLinkClick((link) => {
      showLinkDetails(link);
    })
    .nodeCanvasObject((node, ctx, globalScale) => {
      // Node base rendering
      const label = node.title;
      const fontSize = 12 / globalScale;
      const nodeSize =
        node.id === selectedNodeId
          ? 14 / globalScale
          : ((node.similarity_score || 1) * 10) / globalScale;

      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
      ctx.fillStyle =
        node.id === selectedNodeId
          ? "#ff5252" // Highlighted node
          : node.color ||
            (node.type === "trend"
              ? "#4a6de5"
              : node.type === "technology"
              ? "#28a745"
              : "#fd7e14");
      ctx.fill();

      // Add text only if zoomed in enough for readability
      if (globalScale > 0.4) {
        ctx.font = `${fontSize}px Sans-Serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";
        ctx.fillText(label, node.x, node.y);
      }
    });

  logToConsole(
    `Rendered knowledge graph with ${nodes.length} nodes and ${links.length} links`,
    "info"
  );
}

// Update node size
function updateNodeSize(size) {
  currentNodeSize = size;
  if (forceGraph) {
    forceGraph.nodeRelSize(currentNodeSize);
  }
}

// Show node details
function showNodeDetails(node) {
  const modal = document.getElementById("node-details-modal");
  document.getElementById("node-details-title").textContent =
    node.title || "Node Details";

  let detailsHtml = `
    <div class="node-details">
      <p><strong>Type:</strong> ${node.type || "Unknown"}</p>
      <p><strong>Domain:</strong> ${node.domain || "Not specified"}</p>
  `;

  // Add additional details based on node type
  if (node.type === "trend") {
    const trend = node.data || {};
    detailsHtml += `
      <p><strong>Knowledge Type:</strong> ${
        trend.knowledge_type || "Not specified"
      }</p>
      <p><strong>Publication Date:</strong> ${
        trend.publication_date || "Not specified"
      }</p>
      <p><strong>Similarity Score:</strong> ${(
        trend.similarity_score || 0
      ).toFixed(4)}</p>
      <p><strong>Data Quality Score:</strong> ${(
        trend.data_quality_score || 0
      ).toFixed(2)}</p>
    `;

    // Add technologies if available
    if (trend.technologies && trend.technologies.length > 0) {
      detailsHtml += `
        <div class="details-section">
          <h5>Technologies</h5>
          <ul>
            ${trend.technologies.map((tech) => `<li>${tech}</li>`).join("")}
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
            ${trend.keywords.map((keyword) => `<li>${keyword}</li>`).join("")}
          </ul>
        </div>
      `;
    }
  }

  detailsHtml += `</div>`;
  document.getElementById("node-details-body").innerHTML = detailsHtml;

  // Show the modal
  modal.style.display = "block";

  // Setup close button event
  document.querySelector(".close-modal").onclick = function () {
    modal.style.display = "none";
    selectedNodeId = null;

    // Reset node highlighting
    if (forceGraph) {
      forceGraph.nodeColor((node) => {
        switch (node.type) {
          case "trend":
            return "#4a6de5";
          case "technology":
            return "#28a745";
          case "keyword":
            return "#fd7e14";
          default:
            return "#6c757d";
        }
      });
    }
  };

  document.querySelector(".close-button").onclick = function () {
    modal.style.display = "none";
    selectedNodeId = null;

    // Reset node highlighting
    if (forceGraph) {
      forceGraph.nodeColor((node) => {
        switch (node.type) {
          case "trend":
            return "#4a6de5";
          case "technology":
            return "#28a745";
          case "keyword":
            return "#fd7e14";
          default:
            return "#6c757d";
        }
      });
    }
  };

  // Close when clicking outside
  window.onclick = function (event) {
    if (event.target === modal) {
      modal.style.display = "none";
      selectedNodeId = null;

      // Reset node highlighting
      if (forceGraph) {
        forceGraph.nodeColor((node) => {
          switch (node.type) {
            case "trend":
              return "#4a6de5";
            case "technology":
              return "#28a745";
            case "keyword":
              return "#fd7e14";
            default:
              return "#6c757d";
          }
        });
      }
    }
  };
}

// Show link details
function showLinkDetails(link) {
  logToConsole(
    `Link selected: ${link.source.title || link.source} → ${
      link.target.title || link.target
    }`,
    "info"
  );

  // Highlight connected nodes
  selectedNodeId = null; // Clear any selected node

  if (typeof link.source === "object") {
    // Highlight source and target nodes
    forceGraph
      .nodeColor((node) => {
        if (node.id === link.source.id || node.id === link.target.id) {
          return "#ff5252"; // Highlight color
        }

        switch (node.type) {
          case "trend":
            return "#4a6de5";
          case "technology":
            return "#28a745";
          case "keyword":
            return "#fd7e14";
          default:
            return "#6c757d";
        }
      })
      .refresh();
  }
}

// Show related nodes
/**
 * Show related nodes with enhanced graph visualization integration
 */
function showRelatedNodes() {
  if (!selectedNodeId || !forceGraph || !graphData) {
    showToast("No node selected or graph not available");
    return;
  }

  const graphData = forceGraph.graphData();

  // Find links connected to the selected node
  const connectedLinks = graphData.links.filter(
    (link) =>
      (typeof link.source === "object" ? link.source.id : link.source) === selectedNodeId ||
      (typeof link.target === "object" ? link.target.id : link.target) === selectedNodeId
  );

  // Get connected node IDs
  const connectedNodeIds = new Set();
  connectedLinks.forEach((link) => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId !== selectedNodeId) connectedNodeIds.add(sourceId);
    if (targetId !== selectedNodeId) connectedNodeIds.add(targetId);
  });

  // If no connections, show a message
  if (connectedNodeIds.size === 0) {
    showToast("No related nodes found for this node");
    return;
  }

  logToConsole(`Found ${connectedNodeIds.size} related nodes`, "info");

  // Create an array of connectedNodeIds for camera animation
  const connectedNodes = Array.from(connectedNodeIds)
    .map(id => graphData.nodes.find(node => node.id === id))
    .filter(Boolean);

  // Focus camera on the network of nodes (selected node + connected nodes)
  if (connectedNodes.length > 0) {
    // Calculate positions for camera focusing
    const allNodesToFocus = [
      graphData.nodes.find(node => node.id === selectedNodeId),
      ...connectedNodes
    ].filter(Boolean);
    
    // Calculate bounds for centering
    const nodePositions = allNodesToFocus.map(node => ({x: node.x, y: node.y}));
    const bounds = calculateBounds(nodePositions);
    
    // Focus camera on the network
    const distance = 100; // Extra padding around the network
    forceGraph.centerAt(bounds.centerX, bounds.centerY, 1000);
    
    // Apply appropriate zoom level based on bounds size
    setTimeout(() => {
      const zoomLevel = calculateZoomLevel(bounds.width, bounds.height, forceGraph);
      forceGraph.zoom(zoomLevel, 1000);
    }, 1100);
  }

  // Update node colors
  forceGraph.nodeColor((node) => {
    if (node.id === selectedNodeId) {
      return "#ff5252"; // Selected node
    } else if (connectedNodeIds.has(node.id)) {
      return "#ffab00"; // Connected nodes
    }

    // Default colors (dimmed)
    switch (node.type) {
      case "trend":
        return "rgba(74, 109, 229, 0.3)"; // Dimmed blue
      case "technology":
        return "rgba(40, 167, 69, 0.3)"; // Dimmed green
      case "keyword":
        return "rgba(253, 126, 20, 0.3)"; // Dimmed orange
      default:
        return "rgba(108, 117, 125, 0.3)"; // Dimmed gray
    }
  });

  // Update link widths and colors
  forceGraph.linkWidth((link) => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId === selectedNodeId || targetId === selectedNodeId) {
      return 4; // Highlight connected links
    }
    return link.value || 1;
  }).linkColor((link) => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId === selectedNodeId || targetId === selectedNodeId) {
      return "#ffab00"; // Highlight connected links
    }
    return "rgba(150, 150, 150, 0.2)"; // Dim other links
  });

  // Update link particles
  forceGraph.linkDirectionalParticles((link) => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId === selectedNodeId || targetId === selectedNodeId) {
      return 4; // Animated particles on connected links
    }
    return 0;
  }).linkDirectionalParticleColor(() => "#ffab00");

  // Close the modal
  document.getElementById("node-details-modal").style.display = "none";
  
  // Add "Reset View" button if it doesn't exist
  if (!document.getElementById("reset-relationship-view")) {
    const resetBtn = document.createElement("button");
    resetBtn.id = "reset-relationship-view";
    resetBtn.className = "reset-view-btn";
    resetBtn.innerHTML = '<i class="fas fa-undo"></i> Reset View';
    resetBtn.onclick = resetGraphView;
    
    const container = document.querySelector(".graph-visualization");
    container.appendChild(resetBtn);
  }
  
  // Show a toast with instructions
  showToast(`Showing ${connectedNodeIds.size} related nodes. Click on any node to view details.`);
}

/**
 * Helper function to calculate bounds for a set of node positions
 */
function calculateBounds(positions) {
  if (!positions || positions.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  
  const minX = Math.min(...positions.map(p => p.x));
  const maxX = Math.max(...positions.map(p => p.x));
  const minY = Math.min(...positions.map(p => p.y));
  const maxY = Math.max(...positions.map(p => p.y));
  
  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  
  return { minX, minY, maxX, maxY, width, height, centerX, centerY };
}

/**
 * Helper function to calculate appropriate zoom level
 */
function calculateZoomLevel(width, height, graph) {
  const graphWidth = graph.width();
  const graphHeight = graph.height();
  
  // Add padding
  const paddedWidth = width * 1.5;
  const paddedHeight = height * 1.5;
  
  // Calculate zoom levels for width and height to fit in view
  const zoomX = graphWidth / paddedWidth;
  const zoomY = graphHeight / paddedHeight;
  
  // Use the smaller value to ensure all nodes are visible
  return Math.min(zoomX, zoomY, 2.5); // Cap at 2.5x zoom
}

/**
 * Reset graph view to normal
 */
function resetGraphView() {
  if (!forceGraph) return;
  
  // Reset node colors
  forceGraph.nodeColor((node) => {
    // Default node colors
    switch (node.type) {
      case "trend":
        return "#4a6de5";
      case "technology":
        return "#28a745";
      case "keyword":
        return "#fd7e14";
      default:
        return "#6c757d";
    }
  });
  
  // Reset link properties
  forceGraph
    .linkWidth((link) => link.value || 1)
    .linkColor(() => "#cccccc")
    .linkDirectionalParticles(0);
  
  // Reset zoom to fit all nodes
  forceGraph.zoomToFit(1000, 50);
  
  // Clear selected node
  selectedNodeId = null;
  
  // Remove reset button
  const resetBtn = document.getElementById("reset-relationship-view");
  if (resetBtn) {
    resetBtn.remove();
  }
  
  showToast("Graph view reset");
}

/**
 * Toggle fullscreen mode for the graph visualization
 * Handles all major browsers and properly resizes the graph when entering/exiting fullscreen
 */
function toggleFullscreenGraph() {
  const container = document.querySelector(".graph-visualization");

  if (!container) {
    logToConsole("Graph container not found", "error");
    return;
  }

  // Function to handle fullscreen change events
  function fullscreenChangeHandler() {
    if (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    ) {
      // We've entered fullscreen mode
      logToConsole("Entered fullscreen mode", "info");

      // Update button icon if it exists
      const fsButton = document.querySelector(
        ".visualization-controls .icon-button:first-child i"
      );
      if (fsButton) {
        fsButton.className = "fas fa-compress";
      }

      // Resize the graph if it exists
      if (forceGraph) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          const width = container.clientWidth;
          const height = container.clientHeight;
          forceGraph.width(width).height(height);
          forceGraph.refresh();
        }, 100);
      }
    } else {
      // We've exited fullscreen mode
      logToConsole("Exited fullscreen mode", "info");

      // Update button icon back to expand
      const fsButton = document.querySelector(
        ".visualization-controls .icon-button:first-child i"
      );
      if (fsButton) {
        fsButton.className = "fas fa-expand";
      }

      // Resize the graph back to normal
      if (forceGraph) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          const width = container.clientWidth;
          const height = container.clientHeight;
          forceGraph.width(width).height(height);
          forceGraph.refresh();
        }, 100);
      }
    }
  }

  // Add event listeners for all browsers
  document.addEventListener("fullscreenchange", fullscreenChangeHandler);
  document.addEventListener("webkitfullscreenchange", fullscreenChangeHandler);
  document.addEventListener("mozfullscreenchange", fullscreenChangeHandler);
  document.addEventListener("MSFullscreenChange", fullscreenChangeHandler);

  // Toggle fullscreen state
  if (
    !document.fullscreenElement &&
    !document.webkitFullscreenElement &&
    !document.mozFullScreenElement &&
    !document.msFullscreenElement
  ) {
    // Enter fullscreen mode
    try {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.mozRequestFullScreen) {
        container.mozRequestFullScreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      } else {
        throw new Error("Fullscreen API not supported");
      }
    } catch (error) {
      logToConsole(
        `Failed to enter fullscreen mode: ${error.message}`,
        "error"
      );
      showToast("Fullscreen mode not supported in this browser");
    }
  } else {
    // Exit fullscreen mode
    try {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      } else {
        throw new Error("Fullscreen API not supported");
      }
    } catch (error) {
      logToConsole(`Failed to exit fullscreen mode: ${error.message}`, "error");
    }
  }
}

// Download graph as image
function downloadGraphImage() {
  if (!forceGraph) {
    logToConsole("No graph to download", "warning");
    return;
  }

  try {
    // Get canvas from force graph
    const canvas = document.querySelector(".graph-visualization canvas");
    if (!canvas) {
      logToConsole("Graph canvas not found", "error");
      return;
    }

    // Create a download link
    const link = document.createElement("a");
    link.download = "knowledge-graph.png";
    link.href = canvas
      .toDataURL("image/png")
      .replace("image/png", "image/octet-stream");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logToConsole("Graph image downloaded", "info");
  } catch (error) {
    logToConsole(`Error downloading image: ${error.message}`, "error");
  }
}

// Generate data cards for card view
function generateDataCards(data) {
  const cardsContainer = document.getElementById("data-cards-container");
  cardsContainer.innerHTML = "";

  if (
    !data ||
    !data.original_scout_data ||
    !data.original_scout_data.relevant_trends
  ) {
    cardsContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>No trend data available</p>
      </div>
    `;
    return;
  }

  const trends = data.original_scout_data.relevant_trends;

  trends.forEach((trend) => {
    // Create card element
    const card = document.createElement("div");
    card.className = "data-card";

    // Calculate color based on domain
    let domainColor = "#4a6de5"; // Default blue
    if (trend.domain) {
      switch (trend.domain.toLowerCase()) {
        case "healthcare":
          domainColor = "#28a745";
          break; // Green
        case "mobility":
          domainColor = "#fd7e14";
          break; // Orange
        case "technology":
          domainColor = "#17a2b8";
          break; // Teal
      }
    }

    card.innerHTML = `
      <div class="card-header" style="border-color: ${domainColor}">
        <h3 class="card-title">${trend.title || "Unnamed Trend"}</h3>
        <span class="card-badge" style="background-color: ${domainColor}">${
      trend.domain || "Unknown"
    }</span>
      </div>
      <div class="card-body">
        <div class="card-details">
          <div class="detail-item">
            <span class="detail-label">Type:</span>
            <span class="detail-value">${
              trend.knowledge_type || "Unknown"
            }</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Publication:</span>
            <span class="detail-value">${
              trend.publication_date || "Unknown"
            }</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Similarity:</span>
            <span class="detail-value">${(trend.similarity_score || 0).toFixed(
              4
            )}</span>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <div class="tags-container">
          ${
            Array.isArray(trend.keywords) && trend.keywords.length > 0
              ? trend.keywords
                  .slice(0, 3)
                  .map((kw) => `<span class="tag">${kw}</span>`)
                  .join("")
              : '<span class="tag muted">No keywords</span>'
          }
        </div>
        <button class="card-action-btn" onclick="showCardDetails('${
          trend.id
        }')">
          <i class="fas fa-info-circle"></i> Details
        </button>
      </div>
    `;

    cardsContainer.appendChild(card);
  });

  logToConsole(`Generated ${trends.length} data cards`, "info");
}

// Show details for a specific card
function showCardDetails(trendId) {
  if (!graphData || !graphData.original_scout_data) return;

  const trend = graphData.original_scout_data.relevant_trends.find(
    (t) => t.id === trendId
  );
  if (!trend) {
    logToConsole(`Trend with ID ${trendId} not found`, "error");
    return;
  }

  // Create a node-like object to pass to showNodeDetails
  const nodeObj = {
    id: trend.id,
    title: trend.title,
    type: "trend",
    domain: trend.domain,
    data: trend,
  };

  // Show details modal
  showNodeDetails(nodeObj);
}

// Render Insights
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

  // Add central technologies section
  if (insights.central_technologies) {
    const techSection = document.createElement("div");
    techSection.classList.add("insight-section");

    const titleEl = document.createElement("h4");
    titleEl.innerHTML = `<i class="fas fa-microchip"></i> Central Technologies`;
    techSection.appendChild(titleEl);

    const contentEl = document.createElement("div");
    contentEl.classList.add("insight-content");

    // Format central technologies content
    const techData = insights.central_technologies;
    let techHTML = "";

    // Check if it's a string (older format) or object (new format)
    if (typeof techData === "string") {
      techHTML = techData;
    } else if (typeof techData === "object") {
      // Main analysis
      if (techData.analysis) {
        techHTML += `<div class="section-overview"><p>${techData.analysis}</p></div>`;
      }

      // Individual technologies
      if (
        Array.isArray(techData.technologies) &&
        techData.technologies.length > 0
      ) {
        techHTML += `<ul class="tech-list">`;
        techData.technologies.forEach((tech) => {
          techHTML += `
            <li>
              <div class="tech-name"><strong>${
                tech.title || "Unnamed Technology"
              }</strong></div>
              <div class="tech-analysis">${
                tech.analysis || "No analysis available"
              }</div>
              ${
                tech.impact
                  ? `<div class="tech-impact"><em>Impact: ${tech.impact}</em></div>`
                  : ""
              }
            </li>
          `;
        });
        techHTML += `</ul>`;
      }
    }

    contentEl.innerHTML =
      techHTML || "No detailed central technologies information available";
    techSection.appendChild(contentEl);
    insightsDiv.appendChild(techSection);
  }

  // Add cross-domain connections section
  if (insights.cross_domain_connections) {
    const connectionSection = document.createElement("div");
    connectionSection.classList.add("insight-section");

    const titleEl = document.createElement("h4");
    titleEl.innerHTML = `<i class="fas fa-link"></i> Cross-Domain Connections`;
    connectionSection.appendChild(titleEl);

    const contentEl = document.createElement("div");
    contentEl.classList.add("insight-content");

    // Format cross domain connections
    const connectionData = insights.cross_domain_connections;
    let connectionHTML = "";

    // Check if it's a string (older format) or object (new format)
    if (typeof connectionData === "string") {
      connectionHTML = connectionData;
    } else if (typeof connectionData === "object") {
      // Main analysis
      if (connectionData.analysis) {
        connectionHTML += `<div class="section-overview"><p>${connectionData.analysis}</p></div>`;
      }

      // Individual opportunities
      if (
        Array.isArray(connectionData.opportunities) &&
        connectionData.opportunities.length > 0
      ) {
        connectionHTML += `<ul class="connection-list">`;
        connectionData.opportunities.forEach((conn) => {
          connectionHTML += `
            <li>
              <div class="connection-item"><strong>${
                conn.connection || "Unnamed Connection"
              }</strong></div>
              <div class="connection-potential">${
                conn.potential || "No potential identified"
              }</div>
            </li>
          `;
        });
        connectionHTML += `</ul>`;
      }
    }

    contentEl.innerHTML =
      connectionHTML || "No cross-domain connections information available";
    connectionSection.appendChild(contentEl);
    insightsDiv.appendChild(connectionSection);
  }

  // Add innovation pathways section
  if (insights.innovation_pathways) {
    const pathwaySection = document.createElement("div");
    pathwaySection.classList.add("insight-section");

    const titleEl = document.createElement("h4");
    titleEl.innerHTML = `<i class="fas fa-road"></i> Innovation Pathways`;
    pathwaySection.appendChild(titleEl);

    const contentEl = document.createElement("div");
    contentEl.classList.add("insight-content");

    // Format innovation pathways
    const pathwayData = insights.innovation_pathways;
    let pathwayHTML = "";

    // Check if it's a string (older format) or object (new format)
    if (typeof pathwayData === "string") {
      pathwayHTML = pathwayData;
    } else if (typeof pathwayData === "object") {
      // Main analysis
      if (pathwayData.analysis) {
        pathwayHTML += `<div class="section-overview"><p>${pathwayData.analysis}</p></div>`;
      }

      // Individual implications
      if (
        Array.isArray(pathwayData.implications) &&
        pathwayData.implications.length > 0
      ) {
        pathwayHTML += `<ul class="pathway-list">`;
        pathwayData.implications.forEach((path) => {
          pathwayHTML += `
            <li>
              <div class="pathway-path"><strong>${
                path.path || "Unnamed Pathway"
              }</strong></div>
              <div class="pathway-implication">${
                path.implication || "No implication identified"
              }</div>
            </li>
          `;
        });
        pathwayHTML += `</ul>`;
      }
    }

    contentEl.innerHTML =
      pathwayHTML || "No innovation pathways information available";
    pathwaySection.appendChild(contentEl);
    insightsDiv.appendChild(pathwaySection);
  }

  // Add the insights to the container
  insightsContainer.appendChild(insightsDiv);
}

// Initialize on page load if this is the analyst page
document.addEventListener("DOMContentLoaded", () => {
  if (getCurrentPage() === "analyst") {
    logToConsole("Analyst Agent initialized", "system");

    // Setup tab switching
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Load saved scout results for the scout results tab
    loadScoutResultsFromLocalStorage();

    // Set up event listeners for other UI elements
    const nodeSearch = document.getElementById("node-search");
    if (nodeSearch) {
      nodeSearch.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          searchNodes();
        }
      });
    }

    // Initialize S-Curve visualization
    setTimeout(initSCurveVisualization, 100); // Short delay to ensure DOM is ready

    // Add window resize handler for responsive charts
    window.addEventListener(
      "resize",
      debounce(function () {
        if (graphData) {
          // Only redraw if we have data
          if (forceGraph) {
            // Resize force graph
            const graphContainer = document.getElementById("graph-container");
            if (graphContainer) {
              forceGraph.width(graphContainer.clientWidth);
              forceGraph.height(graphContainer.clientHeight);
            }
          }

          // Redraw S-Curve if needed
          if (sCurveData) {
            renderSCurve(graphData);
          }
        }
      }, 250)
    ); // 250ms debounce
  }
});

/**
 * Simple debounce function for resize events
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function copyScoutResultJson(resultId) {
  const result = scoutResults.find((r) => r.id === resultId);
  if (!result) {
    logToConsole(`Result with ID ${resultId} not found for copying`, "error");
    return;
  }

  // Create JSON string
  const jsonStr = JSON.stringify(result.data, null, 2);

  // Copy to clipboard
  navigator.clipboard
    .writeText(jsonStr)
    .then(() => {
      showToast("JSON copied to clipboard");
      logToConsole("Scout result JSON copied to clipboard", "info");
    })
    .catch((err) => {
      showToast("Failed to copy JSON: " + err);
      logToConsole(`Error copying JSON: ${err}`, "error");
    });
}

// ==================================================
// S-CURVE VISUALIZATION FUNCTIONS
// ==================================================

// S-curve variables
let sCurveData = null;
let sCurveChart = null;
let currentTimeFilter = "All";

/**
 * Render S-Curve visualization using D3.js
 */
/**
 * Render S-Curve visualization using D3.js with error handling
 */
function renderSCurve(data) {
  const sCurveContainer = document.getElementById("s-curve-container");
  if (!sCurveContainer) {
    console.error("S-curve container not found in DOM");
    return;
  }

  // Clear previous content
  sCurveContainer.innerHTML = "";

  if (!data || !data.s_curve_data || data.s_curve_data.error) {
    sCurveContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>${
          data.s_curve_data?.error ||
          "No data available for S-Curve visualization"
        }</p>
      </div>
    `;
    return;
  }

  // Store data globally for filtering later
  sCurveData = data.s_curve_data;

  try {
    // Set up the S-Curve container
    const margin = { top: 40, right: 120, bottom: 60, left: 50 };
    const width = sCurveContainer.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Create SVG element - with defensive check
    d3.select("#s-curve-container svg").remove(); // First remove any existing SVG

    const svg = d3
      .select("#s-curve-container")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Extract technologies data
    const technologies = sCurveData.technologies;

    // If no technologies, show error message
    if (!technologies || technologies.length === 0) {
      sCurveContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>No technology trends available for S-Curve visualization</p>
        </div>
      `;
      return;
    }

    // Filter data based on selected time period
    const filteredData = filterSCurveDataByTime(
      technologies,
      currentTimeFilter
    );

    // Set up scales
    const x = d3
      .scaleTime()
      .domain([
        new Date(filteredData.minYear, 0, 1),
        new Date(filteredData.maxYear, 11, 31),
      ])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, filteredData.maxCumulative * 1.1]) // Add 10% padding
      .range([height, 0]);

    // Add X and Y axes
    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    svg.append("g").call(d3.axisLeft(y));

    // Add X and Y axis labels
    svg
      .append("text")
      .attr("text-anchor", "middle")
      .attr("x", width / 2)
      .attr("y", height + margin.bottom - 10)
      .text("Year");

    svg
      .append("text")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -margin.left + 15)
      .text("Technology Adoption (Cumulative Mentions)");

    // Add title
    svg
      .append("text")
      .attr("text-anchor", "middle")
      .attr("x", width / 2)
      .attr("y", -15)
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .text("Technology S-Curve Analysis");

    // Generate line paths
    const line = d3
      .line()
      .x((d) => x(new Date(d.year, 0, 1)))
      .y((d) => y(d.cumulative))
      .curve(d3.curveMonotoneX);

    // Create color scale for technologies
    const colorScale = d3
      .scaleOrdinal(d3.schemeCategory10)
      .domain(filteredData.technologies.map((t) => t.technology));

    // Add the lines
    const paths = svg
      .selectAll(".line")
      .data(filteredData.technologies)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("class", "line")
      .attr("stroke", (d) => colorScale(d.technology))
      .attr("stroke-width", 2)
      .attr("d", (d) => line(d.filteredData));

    // Add hover effect
    paths
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke-width", 4);

        // Show tooltip
        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "tooltip")
          .style("position", "absolute")
          .style("background", "rgba(0,0,0,0.7)")
          .style("color", "white")
          .style("padding", "8px")
          .style("border-radius", "4px")
          .style("pointer-events", "none")
          .style("font-size", "12px")
          .style("opacity", 0);

        tooltip.transition().duration(200).style("opacity", 0.9);

        tooltip
          .html(
            `
          <strong>${d.technology}</strong><br/>
          Stage: ${d.stage}<br/>
          Total Mentions: ${d.total_mentions}<br/>
          Domains: ${d.domains.join(", ")}
        `
          )
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr("stroke-width", 2);

        // Remove tooltip
        d3.selectAll(".tooltip").remove();
      });

    // Add dots for each data point
    filteredData.technologies.forEach((tech) => {
      svg
        .selectAll(`.dot-${tech.technology.replace(/\s+/g, "-").toLowerCase()}`)
        .data(tech.filteredData)
        .enter()
        .append("circle")
        .attr("class", "dot")
        .attr("cx", (d) => x(new Date(d.year, 0, 1)))
        .attr("cy", (d) => y(d.cumulative))
        .attr("r", 3)
        .attr("fill", colorScale(tech.technology));
    });

    // Add a legend
    const legend = svg
      .append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width + 10}, 0)`);

    const legendItems = legend
      .selectAll(".legend-item")
      .data(filteredData.technologies)
      .enter()
      .append("g")
      .attr("class", "legend-item")
      .attr("transform", (d, i) => `translate(0, ${i * 20})`);

    legendItems
      .append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", (d) => colorScale(d.technology));

    legendItems
      .append("text")
      .attr("x", 15)
      .attr("y", 8)
      .attr("font-size", "10px")
      .text((d) => `${d.technology} (${d.stage})`);

    // Save reference to the chart for later updates
    sCurveChart = {
      svg,
      width,
      height,
      margin,
      x,
      y,
      colorScale,
      line,
    };

    logToConsole(
      `Rendered S-Curve with ${filteredData.technologies.length} technologies`,
      "info"
    );
  } catch (error) {
    logToConsole(`Error rendering S-Curve: ${error.message}`, "error");
    sCurveContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error rendering S-Curve: ${error.message}</p>
      </div>
    `;
    console.error("S-Curve rendering error:", error);
  }
}

/**
 * Filter S-Curve data by time period
 */
/**
 * Filter S-Curve data by time period with improved error handling
 */
function filterSCurveDataByTime(technologies, period = "All") {
  try {
    // If no data, return empty object with defaults
    if (!technologies || technologies.length === 0) {
      return {
        technologies: [],
        minYear: new Date().getFullYear() - 5,
        maxYear: new Date().getFullYear(),
        maxCumulative: 1,
      };
    }

    // Get current year
    const currentYear = new Date().getFullYear();

    // Determine year range based on selected period
    let minYear;
    const maxYear = currentYear; // Always use current year as max

    switch (period) {
      case "1Y":
        minYear = currentYear - 1;
        break;
      case "3Y":
        minYear = currentYear - 3;
        break;
      case "5Y":
        minYear = currentYear - 5;
        break;
      case "All":
      default:
        // Find the earliest year in the data
        try {
          minYear = Math.min(
            ...technologies.flatMap((tech) =>
              tech.data.map((d) => parseInt(d.year))
            )
          );
        } catch (e) {
          // If we can't determine the min year, default to 5 years back
          minYear = currentYear - 5;
          console.error("Error determining minimum year:", e);
        }
        break;
    }

    // Filter technologies data by year range
    const filteredTechnologies = technologies
      .map((tech) => {
        try {
          // Ensure tech.data is valid
          if (!Array.isArray(tech.data)) {
            console.warn(
              `Invalid data format for technology ${tech.technology}`,
              tech
            );
            return null;
          }

          // Filter data points by year
          const filteredData = tech.data.filter((d) => {
            // Parse year to ensure it's a number
            const year = parseInt(d.year);
            return !isNaN(year) && year >= minYear && year <= maxYear;
          });

          // If no data in range, skip
          if (filteredData.length === 0) {
            return null;
          }

          // Adjust cumulative values to start from first visible year
          let baseValue = 0;
          if (filteredData[0] && parseInt(filteredData[0].year) > minYear) {
            // Find the largest cumulative value before minYear
            const earlierPoints = tech.data.filter(
              (d) => parseInt(d.year) < minYear
            );
            if (earlierPoints.length > 0) {
              baseValue = earlierPoints[earlierPoints.length - 1].cumulative;
            }
          }

          // Return filtered technology data
          return {
            ...tech,
            filteredData: filteredData,
          };
        } catch (e) {
          console.error(`Error processing technology ${tech.technology}:`, e);
          return null;
        }
      })
      .filter(Boolean); // Remove null items

    // Calculate maximum cumulative value for Y-axis scaling with safety check
    let maxCumulative = 1; // Default
    try {
      const allValues = filteredTechnologies.flatMap((tech) =>
        tech.filteredData.map((d) => parseFloat(d.cumulative) || 0)
      );
      maxCumulative = allValues.length > 0 ? Math.max(...allValues) : 1;
    } catch (e) {
      console.error("Error calculating max cumulative value:", e);
    }

    return {
      technologies: filteredTechnologies,
      minYear,
      maxYear,
      maxCumulative: maxCumulative || 1, // Ensure it's never 0 or NaN
    };
  } catch (error) {
    console.error("Error filtering S-Curve data:", error);
    // Return safe default values
    return {
      technologies: [],
      minYear: new Date().getFullYear() - 5,
      maxYear: new Date().getFullYear(),
      maxCumulative: 1,
    };
  }
}

/**
 * Filter S-Curve by time period
 */
function filterCurveByTime(period) {
  if (!sCurveData || !sCurveData.technologies) {
    logToConsole("No S-Curve data available for filtering", "warning");
    return;
  }

  // Update active button
  document.querySelectorAll(".year-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .querySelector(`.year-btn[data-period="${period}"]`)
    .classList.add("active");

  // Update current filter
  currentTimeFilter = period;

  // Re-render chart
  updateSCurveVisualization(period);

  logToConsole(`Filtered S-Curve to period: ${period}`, "info");
}

/**
 * Update S-Curve visualization with new filter
 */
function updateSCurveVisualization(period) {
  // If no chart or data, return
  if (!sCurveChart || !sCurveData) return;

  const { svg, width, height, margin, colorScale, line } = sCurveChart;

  // Filter data
  const filteredData = filterSCurveDataByTime(sCurveData.technologies, period);

  // Update scales
  const x = d3
    .scaleTime()
    .domain([
      new Date(filteredData.minYear, 0, 1),
      new Date(filteredData.maxYear, 11, 31),
    ])
    .range([0, width]);

  const y = d3
    .scaleLinear()
    .domain([0, filteredData.maxCumulative * 1.1])
    .range([height, 0]);

  // Update X axis
  svg
    .select("g")
    .transition()
    .duration(1000)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")));

  // Update Y axis
  svg
    .selectAll("g:not(:first-child)")
    .filter(function () {
      return d3.select(this).attr("transform") !== `translate(0,${height})`;
    })
    .transition()
    .duration(1000)
    .call(d3.axisLeft(y));

  // Update line generator
  const updatedLine = d3
    .line()
    .x((d) => x(new Date(d.year, 0, 1)))
    .y((d) => y(d.cumulative))
    .curve(d3.curveMonotoneX);

  // Remove existing lines and dots
  svg.selectAll(".line").remove();
  svg.selectAll(".dot").remove();

  // Add new lines
  const paths = svg
    .selectAll(".line")
    .data(filteredData.technologies)
    .enter()
    .append("path")
    .attr("fill", "none")
    .attr("class", "line")
    .attr("stroke", (d) => colorScale(d.technology))
    .attr("stroke-width", 2)
    .attr("d", (d) => updatedLine(d.filteredData));

  // Add hover effect
  paths
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 4);

      // Show tooltip
      const tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background", "rgba(0,0,0,0.7)")
        .style("color", "white")
        .style("padding", "8px")
        .style("border-radius", "4px")
        .style("pointer-events", "none")
        .style("font-size", "12px")
        .style("opacity", 0);

      tooltip.transition().duration(200).style("opacity", 0.9);

      tooltip
        .html(
          `
        <strong>${d.technology}</strong><br/>
        Stage: ${d.stage}<br/>
        Total Mentions: ${d.total_mentions}<br/>
        Domains: ${d.domains.join(", ")}
      `
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseout", function (event, d) {
      d3.select(this).attr("stroke-width", 2);

      // Remove tooltip
      d3.selectAll(".tooltip").remove();
    });

  // Add new dots
  filteredData.technologies.forEach((tech) => {
    svg
      .selectAll(`.dot-${tech.technology.replace(/\s+/g, "-")}`)
      .data(tech.filteredData)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d) => x(new Date(d.year, 0, 1)))
      .attr("cy", (d) => y(d.cumulative))
      .attr("r", 3)
      .attr("fill", colorScale(tech.technology));
  });

  // Update the legend
  svg.select(".legend").remove();

  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width + 10}, 0)`);

  const legendItems = legend
    .selectAll(".legend-item")
    .data(filteredData.technologies)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(0, ${i * 20})`);

  legendItems
    .append("rect")
    .attr("width", 10)
    .attr("height", 10)
    .attr("fill", (d) => colorScale(d.technology));

  legendItems
    .append("text")
    .attr("x", 15)
    .attr("y", 8)
    .attr("font-size", "10px")
    .text((d) => `${d.technology} (${d.stage})`);
}

/**
 * Initialize S-Curve functionality
 */
function initSCurveVisualization() {
  // Set default time filter if not already set
  if (!currentTimeFilter) {
    currentTimeFilter = "All";
  }

  // Add event listeners to time filter buttons
  document.querySelectorAll(".year-btn").forEach((btn) => {
    // Remove existing event listeners to prevent duplicates
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Add event listener to the new button
    newBtn.addEventListener("click", function () {
      filterCurveByTime(this.dataset.period);
    });
  });

  // Set active button
  const activeBtn = document.querySelector(
    `.year-btn[data-period="${currentTimeFilter}"]`
  );
  if (activeBtn) {
    activeBtn.classList.add("active");
  }

  logToConsole("S-Curve visualization initialized", "system");
}

/**
 * Download S-Curve image with better error handling
 */
function downloadSCurveImage() {
  // Check if S-Curve exists
  const svgContainer = document.querySelector("#s-curve-container svg");
  if (!svgContainer) {
    logToConsole("No S-Curve to download", "warning");
    showToast("No S-Curve visualization to download");
    return;
  }

  try {
    // Get SVG string
    const svgString = new XMLSerializer().serializeToString(svgContainer);

    // Create a canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Set dimensions
    const svgWidth = svgContainer.width.baseVal.value;
    const svgHeight = svgContainer.height.baseVal.value;

    if (svgWidth <= 0 || svgHeight <= 0) {
      throw new Error("Invalid SVG dimensions");
    }

    canvas.width = svgWidth;
    canvas.height = svgHeight;

    // Create SVG image
    const img = new Image();
    img.onload = function () {
      // Draw SVG on canvas
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, svgWidth, svgHeight);
      ctx.drawImage(img, 0, 0);

      // Convert to PNG
      try {
        const pngData = canvas.toDataURL("image/png");

        // Create download link
        const downloadLink = document.createElement("a");
        downloadLink.href = pngData;
        downloadLink.download = "technology-s-curve.png";

        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        logToConsole("S-Curve image downloaded", "info");
        showToast("S-Curve image downloaded");
      } catch (e) {
        logToConsole(`Error creating image data: ${e.message}`, "error");
        showToast("Failed to generate image - security restriction");
      }
    };

    img.onerror = function (e) {
      logToConsole(`Error loading SVG image: ${e}`, "error");
      showToast("Failed to generate S-Curve image");
    };

    // Use a try-catch for converting SVG to data URL
    try {
      // Load SVG data
      img.src =
        "data:image/svg+xml;base64," +
        btoa(unescape(encodeURIComponent(svgString)));
    } catch (e) {
      logToConsole(`Error encoding SVG: ${e.message}`, "error");
      showToast("Failed to encode SVG data");
    }
  } catch (error) {
    logToConsole(`Error downloading S-Curve: ${error.message}`, "error");
    showToast("Failed to download S-Curve image");
  }
}

/**
 * Render the actual contents of the S-Curve inside the SVG
 */
function renderSCurveContent(svgGroup, data, width, height, margin) {
  try {
    // Extract technologies
    const technologies = data.technologies || [];

    if (technologies.length === 0) {
      throw new Error("No technology data available");
    }

    // Get filtered data based on time
    const filteredData = filterSCurveDataByTime(
      technologies,
      currentTimeFilter || "All"
    );

    // Set up scales
    const x = d3
      .scaleTime()
      .domain([
        new Date(filteredData.minYear, 0, 1),
        new Date(filteredData.maxYear, 11, 31),
      ])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, filteredData.maxCumulative * 1.1])
      .range([height, 0]);

    // Add X axis
    svgGroup
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    // Add Y axis
    svgGroup.append("g").call(d3.axisLeft(y));

    // Add labels and title
    svgGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("x", width / 2)
      .attr("y", height + margin.bottom - 10)
      .text("Year");

    svgGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -margin.left + 15)
      .text("Technology Adoption (Cumulative Mentions)");

    svgGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("x", width / 2)
      .attr("y", -15)
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .text("Technology S-Curve Analysis");

    // Line generator
    const line = d3
      .line()
      .x((d) => x(new Date(d.year, 0, 1)))
      .y((d) => y(d.cumulative))
      .curve(d3.curveMonotoneX);

    // Color scale
    const colorScale = d3
      .scaleOrdinal(d3.schemeCategory10)
      .domain(filteredData.technologies.map((t) => t.technology));

    // Add lines
    filteredData.technologies.forEach((tech) => {
      if (!tech.filteredData || tech.filteredData.length === 0) return;

      svgGroup
        .append("path")
        .datum(tech.filteredData)
        .attr("fill", "none")
        .attr("class", "line")
        .attr("stroke", colorScale(tech.technology))
        .attr("stroke-width", 2)
        .attr("d", line);

      // Add dots
      tech.filteredData.forEach((d) => {
        svgGroup
          .append("circle")
          .attr("class", "dot")
          .attr("cx", x(new Date(d.year, 0, 1)))
          .attr("cy", y(d.cumulative))
          .attr("r", 3)
          .attr("fill", colorScale(tech.technology));
      });
    });

    // Add legend
    const legend = svgGroup
      .append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width + 10}, 0)`);

    filteredData.technologies.forEach((tech, i) => {
      const legendItem = legend
        .append("g")
        .attr("transform", `translate(0, ${i * 20})`);

      legendItem
        .append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", colorScale(tech.technology));

      legendItem
        .append("text")
        .attr("x", 15)
        .attr("y", 8)
        .attr("font-size", "10px")
        .text(`${tech.technology} (${tech.stage || "unknown"})`);
    });

    // Store reference for later updates
    sCurveChart = {
      svg: svgGroup,
      width,
      height,
      margin,
      x,
      y,
      colorScale,
      line,
    };
  } catch (e) {
    console.error("Error rendering S-Curve content:", e);
    throw e;
  }
}