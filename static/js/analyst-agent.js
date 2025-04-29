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

function renderForceGraph(data) {
  const graphContainer = document.getElementById("graph-container");
  graphContainer.innerHTML = ""; // Clear previous content

  if (
    !data ||
    !data.graph_data ||
    !data.graph_data.nodes ||
    data.graph_data.nodes.length === 0
  ) {
    graphContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>No graph data available for visualization</p>
      </div>
    `;
    return;
  }

  // Extract graph data
  const nodes = data.graph_data.nodes;
  const links = data.graph_data.links;

  // Set dimensions
  const width = graphContainer.clientWidth;
  const height = graphContainer.clientHeight || 600;

  // Create SVG element
  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  // Create tooltip
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "graph-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background-color", "rgba(0, 0, 0, 0.7)")
    .style("color", "white")
    .style("border-radius", "5px")
    .style("padding", "10px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", 1000);

  // Generate color scale based on node type
  const colorScale = d3
    .scaleOrdinal()
    .domain(["trend", "technology", "keyword", "unknown"])
    .range(["#4a6de5", "#28a745", "#fd7e14", "#6c757d"]);

  // Create force simulation
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(100)
    )
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collide",
      d3.forceCollide().radius((d) => calculateNodeRadius(d) + 5)
    );

  // Add links
  const link = svg
    .append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", (d) => Math.sqrt(d.weight || 1));

  // Add nodes
  const node = svg
    .append("g")
    .selectAll(".node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    )
    .on("click", (event, d) => {
      event.stopPropagation();
      selectedNodeId = d.id;
      showNodeDetails(d);
    });

  // Function to calculate node radius based on type and score
  function calculateNodeRadius(d) {
    if (d.type === "trend") {
      return 5 + (d.similarity_score || 0) * 15;
    } else if (d.type === "technology") {
      return 8;
    } else if (d.type === "keyword") {
      return 6;
    } else {
      return 5;
    }
  }

  // Add circles for nodes
  node
    .append("circle")
    .attr("r", calculateNodeRadius)
    .attr("fill", (d) => d.color || colorScale(d.type || "unknown"))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .on("mouseover", function (event, d) {
      // Highlight the node
      d3.select(this).attr("stroke", "#ff5252").attr("stroke-width", 2);

      // Show tooltip
      tooltip.transition().duration(200).style("opacity", 0.9);

      // Format tooltip content
      let content = `<strong>${d.title || d.id}</strong><br>`;
      content += `Type: ${d.type || "Unknown"}<br>`;

      if (d.domain) {
        content += `Domain: ${d.domain}<br>`;
      }

      if (d.knowledge_type) {
        content += `Knowledge Type: ${d.knowledge_type}<br>`;
      }

      if (d.similarity_score !== undefined) {
        content += `Similarity Score: ${d.similarity_score.toFixed(2)}<br>`;
      }

      if (d.publication_date) {
        content += `Published: ${d.publication_date}<br>`;
      }

      tooltip
        .html(content)
        .style("left", event.pageX + 15 + "px")
        .style("top", event.pageY - 30 + "px");
    })
    .on("mouseout", function () {
      // Reset highlight
      d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1.5);

      // Hide tooltip
      tooltip.transition().duration(500).style("opacity", 0);
    });

  // Add labels to nodes
  node
    .append("text")
    .text((d) => d.title || d.id)
    .attr("x", (d) => calculateNodeRadius(d) + 5)
    .attr("y", "0.31em")
    .style("font-size", "10px")
    .style("pointer-events", "none")
    .style("text-shadow", "0 1px 0 rgba(255,255,255,0.6)")
    .style("fill", "#333");

  // Add title for accessibility
  node.append("title").text((d) => d.title || d.id);

  // Update positions in simulation
  simulation.on("tick", () => {
    // Keep nodes within bounds
    nodes.forEach((d) => {
      d.x = Math.max(20, Math.min(width - 20, d.x));
      d.y = Math.max(20, Math.min(height - 20, d.y));
    });

    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  // Drag functions
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Add zoom capabilities
  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => {
      svg.selectAll("g").attr("transform", event.transform);
    });

  svg.call(zoom);

  // Add nodes to container
  graphContainer.appendChild(svg.node());

  // Create legend
  createGraphLegend(colorScale);

  // Store reference to simulation and other elements for later use
  window.graphViz = {
    svg: svg,
    simulation: simulation,
    nodes: nodes,
    links: links,
    colorScale: colorScale,
    zoom: zoom,
  };

  logToConsole(
    `Rendered knowledge graph with ${nodes.length} nodes and ${links.length} links`,
    "info"
  );

  return {
    svg: svg,
    simulation: simulation,
    nodes: nodes,
    links: links,
  };
}

/**
 * Create legend for the graph visualization
 */
function createGraphLegend(colorScale) {
  const legendContainer = document.createElement("div");
  legendContainer.className = "graph-legend";
  legendContainer.style.position = "absolute";
  legendContainer.style.top = "10px";
  legendContainer.style.right = "10px";
  legendContainer.style.background = "rgba(255, 255, 255, 0.8)";
  legendContainer.style.padding = "10px";
  legendContainer.style.borderRadius = "5px";
  legendContainer.style.boxShadow = "0 1px 4px rgba(0,0,0,0.2)";

  const title = document.createElement("div");
  title.textContent = "Node Types";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "5px";
  legendContainer.appendChild(title);

  const types = ["trend", "technology", "keyword", "unknown"];
  const labels = ["Trend", "Technology", "Keyword", "Other"];

  types.forEach((type, i) => {
    const item = document.createElement("div");
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.marginBottom = "5px";

    const colorBox = document.createElement("div");
    colorBox.style.width = "12px";
    colorBox.style.height = "12px";
    colorBox.style.backgroundColor = colorScale(type);
    colorBox.style.marginRight = "5px";

    const label = document.createElement("span");
    label.textContent = labels[i];
    label.style.fontSize = "12px";

    item.appendChild(colorBox);
    item.appendChild(label);
    legendContainer.appendChild(item);
  });

  const graphContainer = document.getElementById("graph-container");
  graphContainer.appendChild(legendContainer);
}

/**
 * Show related nodes
 */
function showRelatedNodes() {
  if (!window.graphViz || !selectedNodeId) {
    showToast("No node selected or graph not available");
    return;
  }

  const { svg, simulation, nodes, links, colorScale } = window.graphViz;

  // Find links connected to the selected node
  const connectedLinks = links.filter(
    (link) =>
      (typeof link.source === "object" ? link.source.id : link.source) ===
        selectedNodeId ||
      (typeof link.target === "object" ? link.target.id : link.target) ===
        selectedNodeId
  );

  // Get connected node IDs
  const connectedNodeIds = new Set();
  connectedLinks.forEach((link) => {
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId !== selectedNodeId) connectedNodeIds.add(sourceId);
    if (targetId !== selectedNodeId) connectedNodeIds.add(targetId);
  });

  // If no connections, show a message
  if (connectedNodeIds.size === 0) {
    showToast("No related nodes found for this node");
    return;
  }

  logToConsole(`Found ${connectedNodeIds.size} related nodes`, "info");

  // Update node colors
  svg
    .selectAll("circle")
    .attr("fill", (d) => {
      if (d.id === selectedNodeId) {
        return "#ff5252"; // Selected node
      } else if (connectedNodeIds.has(d.id)) {
        return "#ffab00"; // Connected nodes
      }

      // Default colors (dimmed)
      return d.color || colorScale(d.type || "unknown");
    })
    .attr("opacity", (d) => {
      if (d.id === selectedNodeId || connectedNodeIds.has(d.id)) {
        return 1; // Full opacity for selected and connected nodes
      }
      return 0.3; // Dim other nodes
    });

  // Update link visibility and width
  svg
    .selectAll("line")
    .attr("stroke-opacity", (d) => {
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId = typeof d.target === "object" ? d.target.id : d.target;

      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return 0.8; // Higher opacity for connected links
      }
      return 0.1; // Very dim for other links
    })
    .attr("stroke-width", (d) => {
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId = typeof d.target === "object" ? d.target.id : d.target;

      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return Math.sqrt(d.weight || 1) * 2; // Thicker for connected links
      }
      return Math.sqrt(d.weight || 1);
    })
    .attr("stroke", (d) => {
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId = typeof d.target === "object" ? d.target.id : d.target;

      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return "#ffab00"; // Highlight connected links
      }
      return "#999"; // Default color for other links
    });

  // Update text opacity
  svg.selectAll("text").attr("opacity", (d) => {
    if (d.id === selectedNodeId || connectedNodeIds.has(d.id)) {
      return 1; // Full opacity for selected and connected node labels
    }
    return 0.3; // Dim other labels
  });

  // Close the modal
  document.getElementById("node-details-modal").style.display = "none";

  // Add a reset button if it doesn't exist already
  if (!document.getElementById("reset-graph-view")) {
    const resetBtn = document.createElement("button");
    resetBtn.id = "reset-graph-view";
    resetBtn.className = "reset-view-btn";
    resetBtn.innerHTML = '<i class="fas fa-undo"></i> Reset View';
    resetBtn.onclick = resetGraphView;
    resetBtn.style.position = "absolute";
    resetBtn.style.bottom = "20px";
    resetBtn.style.right = "20px";
    resetBtn.style.zIndex = "100";

    const graphContainer = document.getElementById("graph-container");
    graphContainer.appendChild(resetBtn);
  }

  showToast(`Showing ${connectedNodeIds.size} related nodes`);
}

/**
 * Reset graph view to normal
 */
function resetGraphView() {
  if (!window.graphViz) return;

  const { svg, colorScale } = window.graphViz;

  // Reset node colors and opacity
  svg
    .selectAll("circle")
    .attr("fill", (d) => d.color || colorScale(d.type || "unknown"))
    .attr("opacity", 1)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);

  // Reset link properties
  svg
    .selectAll("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", (d) => Math.sqrt(d.weight || 1));

  // Reset text opacity
  svg.selectAll("text").attr("opacity", 1);

  // Clear selected node
  selectedNodeId = null;

  // Remove reset button
  const resetBtn = document.getElementById("reset-graph-view");
  if (resetBtn) {
    resetBtn.remove();
  }

  showToast("Graph view reset");
}

/**
 * Filter graph by domain
 */
function filterByDomain(domain) {
  if (!window.graphViz) {
    logToConsole("No graph data to filter", "warning");
    return;
  }

  const { svg, nodes, links, simulation } = window.graphViz;

  if (domain === "all") {
    // Show all nodes and links
    svg.selectAll("circle").attr("opacity", 1);
    svg.selectAll("text").attr("opacity", 1);
    svg.selectAll("line").attr("opacity", 0.6);

    logToConsole("Showing all domains", "info");
    return;
  }

  // Filter nodes by domain
  const filteredNodeIds = new Set();
  nodes.forEach((node) => {
    if (node.domain === domain) {
      filteredNodeIds.add(node.id);
    }
  });

  // Update node visibility
  svg
    .selectAll("circle")
    .attr("opacity", (d) => (filteredNodeIds.has(d.id) ? 1 : 0.2));

  svg
    .selectAll("text")
    .attr("opacity", (d) => (filteredNodeIds.has(d.id) ? 1 : 0.2));

  // Update link visibility
  svg.selectAll("line").attr("opacity", (d) => {
    const sourceId = typeof d.source === "object" ? d.source.id : d.source;
    const targetId = typeof d.target === "object" ? d.target.id : d.target;

    return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId)
      ? 0.6
      : 0.1;
  });

  logToConsole(`Filtered graph to domain: ${domain}`, "info");
}

/**
 * Search for nodes
 */
function searchNodes() {
  const searchTerm = document.getElementById("node-search").value.toLowerCase();
  if (!searchTerm || !window.graphViz) return;

  const { svg, nodes, zoom } = window.graphViz;

  logToConsole(`Searching for: ${searchTerm}`, "info");

  // Find matching nodes
  const matchingNodes = nodes.filter(
    (node) =>
      (node.title && node.title.toLowerCase().includes(searchTerm)) ||
      (node.id && node.id.toLowerCase().includes(searchTerm))
  );

  if (matchingNodes.length === 0) {
    logToConsole(`No nodes found matching "${searchTerm}"`, "warning");
    showToast("No matching nodes found");
    return;
  }

  // Highlight the matching nodes
  svg
    .selectAll("circle")
    .attr("stroke", (d) => (matchingNodes.includes(d) ? "#ff5252" : "#fff"))
    .attr("stroke-width", (d) => (matchingNodes.includes(d) ? 3 : 1.5))
    .attr("opacity", (d) => (matchingNodes.includes(d) ? 1 : 0.3));

  svg
    .selectAll("text")
    .attr("opacity", (d) => (matchingNodes.includes(d) ? 1 : 0.3));

  // Focus on the first match if available
  if (matchingNodes.length > 0) {
    const firstMatch = matchingNodes[0];

    // Center view on the first matching node
    if (zoom && firstMatch.x && firstMatch.y) {
      const zoomTransform = d3.zoomIdentity
        .translate(window.innerWidth / 2, window.innerHeight / 2)
        .scale(1.5)
        .translate(-firstMatch.x, -firstMatch.y);

      svg.transition().duration(750).call(zoom.transform, zoomTransform);
    }

    // Show details for the first match
    showNodeDetails(firstMatch);
  }

  // Add a reset button if it doesn't exist already
  if (!document.getElementById("reset-search")) {
    const resetBtn = document.createElement("button");
    resetBtn.id = "reset-search";
    resetBtn.className = "reset-search-btn";
    resetBtn.innerHTML = '<i class="fas fa-times"></i>';
    resetBtn.onclick = resetSearch;
    resetBtn.style.position = "absolute";
    resetBtn.style.right = "10px";
    resetBtn.style.top = "10px";

    const searchBox = document.querySelector(".search-box");
    if (searchBox) {
      searchBox.style.position = "relative";
      searchBox.appendChild(resetBtn);
    }
  }

  logToConsole(`Found ${matchingNodes.length} matching nodes`, "info");
  showToast(`Found ${matchingNodes.length} matches`);
}

/**
 * Reset search highlighting
 */
function resetSearch() {
  if (!window.graphViz) return;

  const { svg } = window.graphViz;

  // Reset node highlighting
  svg
    .selectAll("circle")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .attr("opacity", 1);

  svg.selectAll("text").attr("opacity", 1);

  // Clear search input
  document.getElementById("node-search").value = "";

  // Remove reset button
  const resetBtn = document.getElementById("reset-search");
  if (resetBtn) {
    resetBtn.remove();
  }

  logToConsole("Search reset", "info");
}

/**
 * Update node size
 */
function updateNodeSize(size) {
  if (!window.graphViz) return;

  const { svg, simulation } = window.graphViz;

  // Update node sizes
  svg.selectAll("circle").attr("r", (d) => {
    // Base calculation from node type
    let baseSize;
    if (d.type === "trend") {
      baseSize = 5 + (d.similarity_score || 0) * 15;
    } else if (d.type === "technology") {
      baseSize = 8;
    } else if (d.type === "keyword") {
      baseSize = 6;
    } else {
      baseSize = 5;
    }

    // Scale by the size factor
    return baseSize * (parseInt(size) / 8);
  });

  // Update collision force
  simulation.force(
    "collide",
    d3.forceCollide().radius((d) => {
      let baseSize;
      if (d.type === "trend") {
        baseSize = 5 + (d.similarity_score || 0) * 15;
      } else if (d.type === "technology") {
        baseSize = 8;
      } else if (d.type === "keyword") {
        baseSize = 6;
      } else {
        baseSize = 5;
      }

      return baseSize * (parseInt(size) / 8) + 5;
    })
  );

  // Restart simulation
  simulation.alpha(0.3).restart();

  logToConsole(`Updated node size to ${size}`, "info");
}

/**
 * Toggle fullscreen mode for the graph visualization
 */
function toggleFullscreenGraph() {
  const container = document.querySelector(".graph-visualization");

  if (!container) {
    logToConsole("Graph container not found", "error");
    return;
  }

  // Function to handle fullscreen change
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
      if (window.graphViz && window.graphViz.svg) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          window.graphViz.svg
            .attr("width", window.innerWidth)
            .attr("height", window.innerHeight);
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
      if (window.graphViz && window.graphViz.svg) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          window.graphViz.svg
            .attr("width", container.clientWidth)
            .attr("height", container.clientHeight);
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

/**
 * Helper function to calculate bounds for a set of node positions
 */
function calculateBounds(positions) {
  if (!positions || positions.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  const minX = Math.min(...positions.map((p) => p.x));
  const maxX = Math.max(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const maxY = Math.max(...positions.map((p) => p.y));

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
 * Download graph as image
 */
function downloadGraphImage() {
  if (!window.graphViz || !window.graphViz.svg) {
    logToConsole("No graph to download", "warning");
    showToast("No graph to download");
    return;
  }

  try {
    // Get SVG element
    const svgElement = window.graphViz.svg.node();

    // Get SVG data
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);

    // Create canvas
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    // Set canvas dimensions to match SVG
    const width = svgElement.width.baseVal.value;
    const height = svgElement.height.baseVal.value;
    canvas.width = width;
    canvas.height = height;

    // Create image from SVG
    const img = new Image();
    img.onload = function () {
      // Draw white background
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);

      // Draw the image
      context.drawImage(img, 0, 0);

      // Convert to PNG
      const pngUrl = canvas.toDataURL("image/png");

      // Create download link
      const downloadLink = document.createElement("a");
      downloadLink.download = "knowledge-graph.png";
      downloadLink.href = pngUrl;
      downloadLink.style.display = "none";

      // Append to body, click, and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Clean up
      URL.revokeObjectURL(svgUrl);
    };

    // Load the SVG data
    img.src = svgUrl;

    logToConsole("Graph image downloading...", "info");
    showToast("Downloading graph image...");
  } catch (error) {
    logToConsole(`Error downloading graph: ${error.message}`, "error");
    showToast("Error downloading graph image");
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

// S-curve variables
let sCurveData = null;
let sCurveChart = null;
let currentTimeFilter = "All";

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

/**
 * Safely render the S-Curve visualization with DOM error prevention
 */
function renderSCurve(data) {
  try {
    // Get container and verify it exists
    const container = document.getElementById("s-curve-container");
    if (!container) {
      console.error("S-curve container not found");
      return;
    }

    // Clear any existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Show error message if no data
    if (!data || !data.s_curve_data) {
      container.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>No data available for S-Curve visualization</p>
        </div>
      `;
      return;
    }

    // Create a new SVG element with D3
    try {
      // Set dimensions
      const margin = { top: 40, right: 120, bottom: 60, left: 50 };
      const width = container.clientWidth - margin.left - margin.right;
      const height = 400 - margin.top - margin.bottom;

      // Create SVG element using document.createElementNS
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", width + margin.left + margin.right);
      svg.setAttribute("height", height + margin.top + margin.bottom);

      // Append SVG to container directly
      container.appendChild(svg);

      // Now use D3 to manipulate the existing SVG
      const svgGroup = d3
        .select(svg)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      // Once SVG is attached to DOM, proceed with visualization
      renderSCurveContent(svgGroup, data.s_curve_data, width, height, margin);

      logToConsole("S-Curve rendered successfully", "info");
    } catch (e) {
      console.error("Error creating SVG:", e);
      container.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error rendering S-Curve: ${e.message}</p>
        </div>
      `;
    }
  } catch (e) {
    console.error("Fatal error in S-Curve rendering:", e);
    // Try to show error message
    try {
      document.getElementById("s-curve-container").innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Fatal error in S-Curve visualization: ${e.message}</p>
        </div>
      `;
    } catch (innerError) {
      console.error("Could not even show error message:", innerError);
    }
  }
}
