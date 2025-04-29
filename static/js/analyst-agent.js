function updateScoutResultsUI() {
  const resultsContainer = document.getElementById("scout-results-container");
  if (!resultsContainer) return;
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
  const sortedResults = [...scoutResults].sort((a, b) => {
    return (
      new Date(b.date + " " + b.timestamp) -
      new Date(a.date + " " + a.timestamp)
    );
  });
  const resultsByDate = {};
  sortedResults.forEach((result) => {
    if (!resultsByDate[result.date]) {
      resultsByDate[result.date] = [];
    }
    resultsByDate[result.date].push(result);
  });
  Object.keys(resultsByDate)
    .sort((a, b) => new Date(b) - new Date(a))
    .forEach((date) => {
      const dateHeader = document.createElement("div");
      dateHeader.className = "results-date-header";
      dateHeader.textContent = date;
      resultsContainer.appendChild(dateHeader);
      const resultsGrid = document.createElement("div");
      resultsGrid.className = "scout-results-grid";
      resultsByDate[date].forEach((result) => {
        const card = createScoutResultCard(result);
        resultsGrid.appendChild(card);
      });
      resultsContainer.appendChild(resultsGrid);
    });
}

function createScoutResultCard(result) {
  const card = document.createElement("div");
  card.className = "scout-result-card";
  card.setAttribute("data-id", result.id);
  let mainDomain = "Unknown";
  let domainColor = "#6c757d";
  if (result.data.relevant_trends && result.data.relevant_trends.length > 0) {
    const domainCounts = {};
    result.data.relevant_trends.forEach((trend) => {
      if (trend.domain) {
        domainCounts[trend.domain] = (domainCounts[trend.domain] || 0) + 1;
      }
    });
    let maxCount = 0;
    Object.keys(domainCounts).forEach((domain) => {
      if (domainCounts[domain] > maxCount) {
        maxCount = domainCounts[domain];
        mainDomain = domain;
      }
    });
    switch (mainDomain.toLowerCase()) {
      case "healthcare":
        domainColor = "#28a745";
        break;
      case "mobility":
        domainColor = "#fd7e14";
        break;
      case "technology":
        domainColor = "#17a2b8";
        break;
    }
  }
  const formattedTime = result.timestamp;
  const trendsCount = result.data.relevant_trends?.length || 0;
  const promptDisplay =
    result.prompt.length > 60
      ? result.prompt.substring(0, 60) + "..."
      : result.prompt;
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
  card.querySelector(".analyze-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    processScoutResultById(result.id);
  });
  card.querySelector(".delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteScoutResult(result.id);
  });
  card.querySelector(".copy-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    copyScoutResultJson(result.id);
  });
  card.addEventListener("click", () => {
    previewScoutResult(result);
  });
  return card;
}

function deleteScoutResult(resultId) {
  scoutResults = scoutResults.filter((result) => result.id !== resultId);
  localStorage.removeItem(`scoutResult_${resultId}`);
  saveScoutResultsToLocalStorage();
  updateScoutResultsUI();
  logToConsole(`Deleted scout result ${resultId}`, "info");
  showToast("Result deleted");
}

function saveScoutResultsToLocalStorage() {
  try {
    const storageData = scoutResults.map((result) => ({
      id: result.id,
      timestamp: result.timestamp,
      date: result.date,
      prompt: result.prompt,
      summary: result.data.response_to_user_prompt || "",
      trendsCount: result.data.relevant_trends?.length || 0,
    }));
    localStorage.setItem("scoutResultsIndex", JSON.stringify(storageData));
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

function loadScoutResultsFromLocalStorage() {
  try {
    const storedIndex = localStorage.getItem("scoutResultsIndex");
    if (!storedIndex) return;
    const indexData = JSON.parse(storedIndex);
    scoutResults = [];
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
    updateScoutResultsUI();
  } catch (e) {
    logToConsole(`Error loading from localStorage: ${e.message}`, "error");
  }
}

function previewScoutResult(result) {
  const previewElement = document.getElementById("scout-result-preview");
  if (!previewElement) return;
  previewElement.innerHTML = `
  <div class="preview-header">
    <h4>Query: "${result.prompt}"</h4>
    <span class="preview-timestamp">${result.date} at ${result.timestamp}</span>
    <button class="preview-copy-btn" onclick="copyScoutResultJson('${
      result.id
    }')">
      <i class="fas fa-copy"></i> Copy JSON
    </button>
  </div>
  <div class="preview-content">
    <div class="preview-response">
      ${result.data.response_to_user_prompt || "No direct response available"}
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
  const analyzeButton = document.getElementById("analyze-selected-button");
  if (analyzeButton) {
    analyzeButton.disabled = !1;
  }
}

function processAnalystQuery(predefinedData = null) {
  let scoutData;
  if (predefinedData) {
    scoutData = predefinedData;
  } else {
    const scoutDataInput = document.getElementById("scout-data-input").value;
    if (!scoutDataInput.trim()) {
      logToConsole("Please enter Scout Agent data", "warning");
      showToast("Please enter Scout Agent data");
      return;
    }
    try {
      scoutData = JSON.parse(scoutDataInput);
    } catch (error) {
      logToConsole("Invalid JSON input: " + error.message, "error");
      showToast("Invalid JSON format: " + error.message);
      return;
    }
  }
  const analyzeButton = document.getElementById("analyze-button");
  if (analyzeButton) {
    analyzeButton.disabled = !0;
    analyzeButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    analyzeButton.style.opacity = "0.7";
    analyzeButton.style.cursor = "not-allowed";
  }
  const analyzeIdButton = document.getElementById("analyze-id-btn");
  if (analyzeIdButton) {
    analyzeIdButton.disabled = !0;
    analyzeIdButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    analyzeIdButton.style.opacity = "0.7";
    analyzeIdButton.style.cursor = "not-allowed";
  }
  document.querySelectorAll(".analyze-btn").forEach((btn) => {
    btn.disabled = !0;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
  });
  document.getElementById("graph-container").innerHTML = `
<div class="loading">
  <div class="spinner"></div>
  <p>Generating Knowledge Graph...</p>
</div>
`;
  document.getElementById("s-curve-container").innerHTML = `
<div class="loading">
  <div class="spinner"></div>
  <p>Generating S-Curve Visualization...</p>
</div>
`;
  document.getElementById("insights-container").innerHTML = `
<div class="loading">
  <div class="spinner"></div>
  <p>Generating insights...</p>
</div>
`;
  logToConsole("Sending data to Analyst Agent for processing...", "info");
  fetch(`${apiUrl}/agent/analyst/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
      populateDomainFilter(data);
      renderForceGraph(data);
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
      renderInsights(data);
      generateDataCards(data);
      if (analyzeButton) {
        analyzeButton.disabled = !1;
        analyzeButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze Trends';
        analyzeButton.style.opacity = "";
        analyzeButton.style.cursor = "";
      }
      if (analyzeIdButton) {
        analyzeIdButton.disabled = !1;
        analyzeIdButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze This Data';
        analyzeIdButton.style.opacity = "";
        analyzeIdButton.style.cursor = "";
      }
      document.querySelectorAll(".analyze-btn").forEach((btn) => {
        btn.disabled = !1;
        btn.innerHTML = '<i class="fas fa-chart-line"></i>';
        btn.style.opacity = "";
        btn.style.cursor = "";
      });
      showToast("Analysis completed successfully");
    })
    .catch((error) => {
      logToConsole(`Analysis error: ${error}`, "error");
      document.getElementById("graph-container").innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      <p>Error processing data: ${error.message}</p>
    </div>
  `;
      document.getElementById("s-curve-container").innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      <p>Error processing data: ${error.message}</p>
    </div>
  `;
      document.getElementById("insights-container").innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      <p>Error generating insights: ${error.message}</p>
    </div>
  `;
      showToast("Analysis failed: " + error.message);
      if (analyzeButton) {
        analyzeButton.disabled = !1;
        analyzeButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze Trends';
        analyzeButton.style.opacity = "";
        analyzeButton.style.cursor = "";
      }
      if (analyzeIdButton) {
        analyzeIdButton.disabled = !1;
        analyzeIdButton.innerHTML =
          '<i class="fas fa-chart-line"></i> Analyze This Data';
        analyzeIdButton.style.opacity = "";
        analyzeIdButton.style.cursor = "";
      }
      document.querySelectorAll(".analyze-btn").forEach((btn) => {
        btn.disabled = !1;
        btn.innerHTML = '<i class="fas fa-chart-line"></i>';
        btn.style.opacity = "";
        btn.style.cursor = "";
      });
    });
}

function processScoutResultById(resultId) {
  const result = scoutResults.find((r) => r.id === resultId);
  if (!result) {
    logToConsole(`Result with ID ${resultId} not found`, "error");
    showToast(`Result with ID ${resultId} not found`);
    return;
  }
  const clickedButton = document.getElementById("analyze-id-btn");
  if (clickedButton) {
    clickedButton.disabled = !0;
    clickedButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    clickedButton.style.opacity = "0.7";
    clickedButton.style.cursor = "not-allowed";
  }
  document.querySelectorAll(".analyze-btn").forEach((btn) => {
    btn.disabled = !0;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    btn.style.opacity = "0.7";
    btn.style.cursor = "not-allowed";
  });
  const analyzeButton = document.getElementById("analyze-button");
  if (analyzeButton) {
    analyzeButton.disabled = !0;
    analyzeButton.innerHTML =
      '<i class="fas fa-circle-notch fa-spin"></i> Analyzing...';
    analyzeButton.style.opacity = "0.7";
    analyzeButton.style.cursor = "not-allowed";
  }
  logToConsole(
    `Processing Scout result: ${result.prompt.substring(0, 30)}...`,
    "info"
  );
  processAnalystQuery(result.data);
}

function populateDomainFilter(data) {
  const filter = document.getElementById("domain-filter");
  filter.innerHTML = '<option value="all">All Domains</option>';
  const domains = new Set();
  if (data.original_scout_data && data.original_scout_data.relevant_trends) {
    data.original_scout_data.relevant_trends.forEach((trend) => {
      if (trend.domain) domains.add(trend.domain);
    });
  }
  domains.forEach((domain) => {
    const option = document.createElement("option");
    option.value = domain;
    option.textContent = domain;
    filter.appendChild(option);
  });
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active");
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(tabId).classList.add("active");
  document
    .querySelector(`.tab-btn[data-tab="${tabId}"]`)
    .classList.add("active");
  logToConsole(`Switched to ${tabId} tab`, "info");
}

function switchView(viewType) {
  const graphContainer = document.querySelector("#graph-container");
  const sCurveContainer = document.querySelector(".s-visualization");
  const dataCardsContainer = document.getElementById("data-cards-container");
  if (!graphContainer || !sCurveContainer || !dataCardsContainer) {
    logToConsole(
      "Cannot switch view - required DOM elements not found",
      "error"
    );
    return;
  }
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .querySelector(`.view-btn[data-view="${viewType}"]`)
    .classList.add("active");
  if (viewType === "graph") {
    graphContainer.style.display = "block";
    sCurveContainer.style.display = "block";
    dataCardsContainer.style.display = "none";
  } else {
    graphContainer.style.display = "none";
    sCurveContainer.style.display = "none";
    dataCardsContainer.style.display = "grid";
    if (graphData && dataCardsContainer.children.length === 0) {
      generateDataCards(graphData);
    }
  }
  logToConsole(`Switched to ${viewType} view`, "info");
}

function renderForceGraph(data) {
  const graphContainer = document.getElementById("graph-container");
  graphContainer.innerHTML = "";
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
  const nodes = data.graph_data.nodes;
  const links = data.graph_data.links;
  const width = graphContainer.clientWidth;
  const height = graphContainer.clientHeight || 600;
  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);
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
  const colorScale = d3
    .scaleOrdinal()
    .domain(["trend", "technology", "keyword", "unknown"])
    .range(["#4a6de5", "#28a745", "#fd7e14", "#6c757d"]);
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
  const link = svg
    .append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", (d) => Math.sqrt(d.weight || 1));
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
  node
    .append("circle")
    .attr("r", calculateNodeRadius)
    .attr("fill", (d) => d.color || colorScale(d.type || "unknown"))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke", "#ff5252").attr("stroke-width", 2);
      tooltip.transition().duration(200).style("opacity", 0.9);
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
      d3.select(this).attr("stroke", "#fff").attr("stroke-width", 1.5);
      tooltip.transition().duration(500).style("opacity", 0);
    });
  node
    .append("text")
    .text((d) => d.title || d.id)
    .attr("x", (d) => calculateNodeRadius(d) + 5)
    .attr("y", "0.31em")
    .style("font-size", "10px")
    .style("pointer-events", "none")
    .style("text-shadow", "0 1px 0 rgba(255,255,255,0.6)")
    .style("fill", "#333");
  node.append("title").text((d) => d.title || d.id);
  simulation.on("tick", () => {
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
  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => {
      svg.selectAll("g").attr("transform", event.transform);
    });
  svg.call(zoom);
  graphContainer.appendChild(svg.node());
  createGraphLegend(colorScale);
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
  return { svg: svg, simulation: simulation, nodes: nodes, links: links };
}

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

function showRelatedNodes() {
  if (!window.graphViz || !selectedNodeId) {
    showToast("No node selected or graph not available");
    return;
  }
  const { svg, simulation, nodes, links, colorScale } = window.graphViz;
  const connectedLinks = links.filter(
    (link) =>
      (typeof link.source === "object" ? link.source.id : link.source) ===
        selectedNodeId ||
      (typeof link.target === "object" ? link.target.id : link.target) ===
        selectedNodeId
  );
  const connectedNodeIds = new Set();
  connectedLinks.forEach((link) => {
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;
    if (sourceId !== selectedNodeId) connectedNodeIds.add(sourceId);
    if (targetId !== selectedNodeId) connectedNodeIds.add(targetId);
  });
  if (connectedNodeIds.size === 0) {
    showToast("No related nodes found for this node");
    return;
  }
  logToConsole(`Found ${connectedNodeIds.size} related nodes`, "info");
  svg
    .selectAll("circle")
    .attr("fill", (d) => {
      if (d.id === selectedNodeId) {
        return "#ff5252";
      } else if (connectedNodeIds.has(d.id)) {
        return "#ffab00";
      }
      return d.color || colorScale(d.type || "unknown");
    })
    .attr("opacity", (d) => {
      if (d.id === selectedNodeId || connectedNodeIds.has(d.id)) {
        return 1;
      }
      return 0.3;
    });
  svg
    .selectAll("line")
    .attr("stroke-opacity", (d) => {
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId = typeof d.target === "object" ? d.target.id : d.target;
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return 0.8;
      }
      return 0.1;
    })
    .attr("stroke-width", (d) => {
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId = typeof d.target === "object" ? d.target.id : d.target;
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return Math.sqrt(d.weight || 1) * 2;
      }
      return Math.sqrt(d.weight || 1);
    })
    .attr("stroke", (d) => {
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId = typeof d.target === "object" ? d.target.id : d.target;
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return "#ffab00";
      }
      return "#999";
    });
  svg.selectAll("text").attr("opacity", (d) => {
    if (d.id === selectedNodeId || connectedNodeIds.has(d.id)) {
      return 1;
    }
    return 0.3;
  });
  document.getElementById("node-details-modal").style.display = "none";
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

function resetGraphView() {
  if (!window.graphViz) return;
  const { svg, colorScale } = window.graphViz;
  svg
    .selectAll("circle")
    .attr("fill", (d) => d.color || colorScale(d.type || "unknown"))
    .attr("opacity", 1)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5);
  svg
    .selectAll("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", (d) => Math.sqrt(d.weight || 1));
  svg.selectAll("text").attr("opacity", 1);
  selectedNodeId = null;
  const resetBtn = document.getElementById("reset-graph-view");
  if (resetBtn) {
    resetBtn.remove();
  }
  showToast("Graph view reset");
}

function filterByDomain(domain) {
  if (!window.graphViz) {
    logToConsole("No graph data to filter", "warning");
    return;
  }
  const { svg, nodes, links, simulation } = window.graphViz;
  if (domain === "all") {
    svg.selectAll("circle").attr("opacity", 1);
    svg.selectAll("text").attr("opacity", 1);
    svg.selectAll("line").attr("opacity", 0.6);
    logToConsole("Showing all domains", "info");
    return;
  }
  const filteredNodeIds = new Set();
  nodes.forEach((node) => {
    if (node.domain === domain) {
      filteredNodeIds.add(node.id);
    }
  });
  svg
    .selectAll("circle")
    .attr("opacity", (d) => (filteredNodeIds.has(d.id) ? 1 : 0.2));
  svg
    .selectAll("text")
    .attr("opacity", (d) => (filteredNodeIds.has(d.id) ? 1 : 0.2));
  svg.selectAll("line").attr("opacity", (d) => {
    const sourceId = typeof d.source === "object" ? d.source.id : d.source;
    const targetId = typeof d.target === "object" ? d.target.id : d.target;
    return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId)
      ? 0.6
      : 0.1;
  });
  logToConsole(`Filtered graph to domain: ${domain}`, "info");
}

function searchNodes() {
  const searchTerm = document.getElementById("node-search").value.toLowerCase();
  if (!searchTerm || !window.graphViz) return;
  const { svg, nodes, zoom } = window.graphViz;
  logToConsole(`Searching for: ${searchTerm}`, "info");
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
  svg
    .selectAll("circle")
    .attr("stroke", (d) => (matchingNodes.includes(d) ? "#ff5252" : "#fff"))
    .attr("stroke-width", (d) => (matchingNodes.includes(d) ? 3 : 1.5))
    .attr("opacity", (d) => (matchingNodes.includes(d) ? 1 : 0.3));
  svg
    .selectAll("text")
    .attr("opacity", (d) => (matchingNodes.includes(d) ? 1 : 0.3));
  if (matchingNodes.length > 0) {
    const firstMatch = matchingNodes[0];
    if (zoom && firstMatch.x && firstMatch.y) {
      const zoomTransform = d3.zoomIdentity
        .translate(window.innerWidth / 2, window.innerHeight / 2)
        .scale(1.5)
        .translate(-firstMatch.x, -firstMatch.y);
      svg.transition().duration(750).call(zoom.transform, zoomTransform);
    }
    showNodeDetails(firstMatch);
  }
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

function resetSearch() {
  if (!window.graphViz) return;
  const { svg } = window.graphViz;
  svg
    .selectAll("circle")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .attr("opacity", 1);
  svg.selectAll("text").attr("opacity", 1);
  document.getElementById("node-search").value = "";
  const resetBtn = document.getElementById("reset-search");
  if (resetBtn) {
    resetBtn.remove();
  }
  logToConsole("Search reset", "info");
}

function updateNodeSize(size) {
  if (!window.graphViz) return;
  const { svg, simulation } = window.graphViz;
  svg.selectAll("circle").attr("r", (d) => {
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
    return baseSize * (parseInt(size) / 8);
  });
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
  simulation.alpha(0.3).restart();
  logToConsole(`Updated node size to ${size}`, "info");
}

function toggleFullscreenGraph() {
  const container = document.querySelector(".graph-visualization");
  if (!container) {
    logToConsole("Graph container not found", "error");
    return;
  }
  function fullscreenChangeHandler() {
    if (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    ) {
      logToConsole("Entered fullscreen mode", "info");
      const fsButton = document.querySelector(
        ".visualization-controls .icon-button:first-child i"
      );
      if (fsButton) {
        fsButton.className = "fas fa-compress";
      }
      if (window.graphViz && window.graphViz.svg) {
        setTimeout(() => {
          window.graphViz.svg
            .attr("width", window.innerWidth)
            .attr("height", window.innerHeight);
        }, 100);
      }
    } else {
      logToConsole("Exited fullscreen mode", "info");
      const fsButton = document.querySelector(
        ".visualization-controls .icon-button:first-child i"
      );
      if (fsButton) {
        fsButton.className = "fas fa-expand";
      }
      if (window.graphViz && window.graphViz.svg) {
        setTimeout(() => {
          window.graphViz.svg
            .attr("width", container.clientWidth)
            .attr("height", container.clientHeight);
        }, 100);
      }
    }
  }
  document.addEventListener("fullscreenchange", fullscreenChangeHandler);
  document.addEventListener("webkitfullscreenchange", fullscreenChangeHandler);
  document.addEventListener("mozfullscreenchange", fullscreenChangeHandler);
  document.addEventListener("MSFullscreenChange", fullscreenChangeHandler);
  if (
    !document.fullscreenElement &&
    !document.webkitFullscreenElement &&
    !document.mozFullScreenElement &&
    !document.msFullscreenElement
  ) {
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

function showNodeDetails(node) {
  const modal = document.getElementById("node-details-modal");
  document.getElementById("node-details-title").textContent =
    node.title || "Node Details";
  let detailsHtml = `
<div class="node-details">
  <p><strong>Type:</strong> ${node.type || "Unknown"}</p>
  <p><strong>Domain:</strong> ${node.domain || "Not specified"}</p>
`;
  if (node.type === "trend") {
    const trend = node.data || {};
    detailsHtml += `
  <p><strong>Knowledge Type:</strong> ${
    trend.knowledge_type || "Not specified"
  }</p>
  <p><strong>Publication Date:</strong> ${
    trend.publication_date || "Not specified"
  }</p>
  <p><strong>Similarity Score:</strong> ${(trend.similarity_score || 0).toFixed(
    4
  )}</p>
  <p><strong>Data Quality Score:</strong> ${(
    trend.data_quality_score || 0
  ).toFixed(2)}</p>
`;
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
  modal.style.display = "block";
  document.querySelector(".close-modal").onclick = function () {
    modal.style.display = "none";
    selectedNodeId = null;
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
  window.onclick = function (event) {
    if (event.target === modal) {
      modal.style.display = "none";
      selectedNodeId = null;
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

function showLinkDetails(link) {
  logToConsole(
    `Link selected: ${link.source.title || link.source} → ${
      link.target.title || link.target
    }`,
    "info"
  );
  selectedNodeId = null;
  if (typeof link.source === "object") {
    forceGraph
      .nodeColor((node) => {
        if (node.id === link.source.id || node.id === link.target.id) {
          return "#ff5252";
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

function downloadGraphImage() {
  if (!window.graphViz || !window.graphViz.svg) {
    logToConsole("No graph to download", "warning");
    showToast("No graph to download");
    return;
  }
  try {
    const svgElement = window.graphViz.svg.node();
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const width = svgElement.width.baseVal.value;
    const height = svgElement.height.baseVal.value;
    canvas.width = width;
    canvas.height = height;
    const img = new Image();
    img.onload = function () {
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "knowledge-graph.png";
      downloadLink.href = pngUrl;
      downloadLink.style.display = "none";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
    logToConsole("Graph image downloading...", "info");
    showToast("Downloading graph image...");
  } catch (error) {
    logToConsole(`Error downloading graph: ${error.message}`, "error");
    showToast("Error downloading graph image");
  }
}

function generateDataCards(data) {
  const cardsContainer = document.getElementById("data-cards-container");
  if (!cardsContainer) {
    logToConsole("Data cards container not found", "error");
    return;
  }
  cardsContainer.innerHTML = "";
  if (
    !data ||
    !data.original_scout_data ||
    !data.original_scout_data.relevant_trends ||
    !Array.isArray(data.original_scout_data.relevant_trends)
  ) {
    cardsContainer.innerHTML = `
  <div class="error-message">
    <i class="fas fa-exclamation-circle"></i>
    <p>No trend data available for card view</p>
  </div>
`;
    return;
  }
  const trends = data.original_scout_data.relevant_trends;
  if (trends.length === 0) {
    cardsContainer.innerHTML = `
  <div class="error-message">
    <i class="fas fa-exclamation-circle"></i>
    <p>No trends found in the data</p>
  </div>
`;
    return;
  }
  logToConsole(`Generating ${trends.length} data cards`, "info");
  trends.forEach((trend) => {
    const trendId =
      trend.id || `trend-${Math.random().toString(36).substr(2, 9)}`;
    const card = document.createElement("div");
    card.className = "data-card";
    let domainColor = "#4a6de5";
    if (trend.domain) {
      switch (trend.domain.toLowerCase()) {
        case "healthcare":
          domainColor = "#28a745";
          break;
        case "mobility":
          domainColor = "#fd7e14";
          break;
        case "technology":
          domainColor = "#17a2b8";
          break;
        case "energy":
          domainColor = "#ffc107";
          break;
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
        <span class="detail-value">${trend.knowledge_type || "Unknown"}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Publication:</span>
        <span class="detail-value">${trend.publication_date || "Unknown"}</span>
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
    <button class="card-action-btn" onclick="showCardDetails('${trendId}')">
      <i class="fas fa-info-circle"></i> Details
    </button>
  </div>
`;
    cardsContainer.appendChild(card);
  });
  logToConsole(`Generated ${trends.length} data cards`, "info");
}

function showCardDetails(trendId) {
  if (!graphData || !graphData.original_scout_data) {
    logToConsole("No data available to show trend details", "warning");
    return;
  }
  const trends = graphData.original_scout_data.relevant_trends || [];
  const trend = trends.find((t) => t.id === trendId);
  if (!trend) {
    logToConsole(
      `Trend with ID ${trendId} not found, searching by index...`,
      "warning"
    );
    const trendIndex = parseInt(trendId.replace(/^trend-/, ""));
    if (!isNaN(trendIndex) && trendIndex < trends.length) {
      trend = trends[trendIndex];
    }
    if (!trend) {
      logToConsole(`Unable to find trend with ID ${trendId}`, "error");
      return;
    }
  }
  const modal = document.getElementById("node-details-modal");
  if (!modal) {
    logToConsole("Modal element not found", "error");
    return;
  }
  const modalTitle = document.getElementById("node-details-title");
  if (modalTitle) {
    modalTitle.textContent = trend.title || "Trend Details";
  }
  let detailsHtml = `
<div class="node-details">
  <p><strong>Type:</strong> Trend</p>
  <p><strong>Domain:</strong> ${trend.domain || "Not specified"}</p>
  <p><strong>Knowledge Type:</strong> ${
    trend.knowledge_type || "Not specified"
  }</p>
  <p><strong>Publication Date:</strong> ${
    trend.publication_date || "Not specified"
  }</p>
  <p><strong>Similarity Score:</strong> ${(trend.similarity_score || 0).toFixed(
    4
  )}</p>
`;
  if (Array.isArray(trend.technologies) && trend.technologies.length > 0) {
    detailsHtml += `
  <div class="details-section">
    <h5>Technologies</h5>
    <ul>
      ${trend.technologies.map((tech) => `<li>${tech}</li>`).join("")}
    </ul>
  </div>
`;
  }
  if (Array.isArray(trend.keywords) && trend.keywords.length > 0) {
    detailsHtml += `
  <div class="details-section">
    <h5>Keywords</h5>
    <ul>
      ${trend.keywords.map((keyword) => `<li>${keyword}</li>`).join("")}
    </ul>
  </div>
`;
  }
  if (trend.source) {
    detailsHtml += `<p><strong>Source:</strong> ${trend.source}</p>`;
  }
  detailsHtml += `</div>`;
  const modalBody = document.getElementById("node-details-body");
  if (modalBody) {
    modalBody.innerHTML = detailsHtml;
  }
  selectedNodeId = trendId;
  modal.style.display = "block";
  const closeModal = () => {
    modal.style.display = "none";
    selectedNodeId = null;
  };
  const closeButton = document.querySelector(".close-modal");
  if (closeButton) {
    closeButton.onclick = closeModal;
  }
  const closeButtonAlt = document.querySelector(".close-button");
  if (closeButtonAlt) {
    closeButtonAlt.onclick = closeModal;
  }
  window.onclick = function (event) {
    if (event.target === modal) {
      closeModal();
    }
  };
}

function renderInsights(data) {
  const insightsContainer = document.getElementById("insights-container");
  if (!insightsContainer) return;
  insightsContainer.innerHTML = "";
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
  const insightsDiv = document.createElement("div");
  insightsDiv.classList.add("insights-details");
  if (insights.central_technologies) {
    const techSection = document.createElement("div");
    techSection.classList.add("insight-section");
    const titleEl = document.createElement("h4");
    titleEl.innerHTML = `<i class="fas fa-microchip"></i> Central Technologies`;
    techSection.appendChild(titleEl);
    const contentEl = document.createElement("div");
    contentEl.classList.add("insight-content");
    const techData = insights.central_technologies;
    let techHTML = "";
    if (typeof techData === "string") {
      techHTML = techData;
    } else if (typeof techData === "object") {
      if (techData.analysis) {
        techHTML += `<div class="section-overview"><p>${techData.analysis}</p></div>`;
      }
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
              ? `<div class="tech-impact"><em>Impact:${tech.impact}</em></div>`
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
  if (insights.cross_domain_connections) {
    const connectionSection = document.createElement("div");
    connectionSection.classList.add("insight-section");
    const titleEl = document.createElement("h4");
    titleEl.innerHTML = `<i class="fas fa-link"></i> Cross-Domain Connections`;
    connectionSection.appendChild(titleEl);
    const contentEl = document.createElement("div");
    contentEl.classList.add("insight-content");
    const connectionData = insights.cross_domain_connections;
    let connectionHTML = "";
    if (typeof connectionData === "string") {
      connectionHTML = connectionData;
    } else if (typeof connectionData === "object") {
      if (connectionData.analysis) {
        connectionHTML += `<div class="section-overview"><p>${connectionData.analysis}</p></div>`;
      }
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
  if (insights.innovation_pathways) {
    const pathwaySection = document.createElement("div");
    pathwaySection.classList.add("insight-section");
    const titleEl = document.createElement("h4");
    titleEl.innerHTML = `<i class="fas fa-road"></i> Innovation Pathways`;
    pathwaySection.appendChild(titleEl);
    const contentEl = document.createElement("div");
    contentEl.classList.add("insight-content");
    const pathwayData = insights.innovation_pathways;
    let pathwayHTML = "";
    if (typeof pathwayData === "string") {
      pathwayHTML = pathwayData;
    } else if (typeof pathwayData === "object") {
      if (pathwayData.analysis) {
        pathwayHTML += `<div class="section-overview"><p>${pathwayData.analysis}</p></div>`;
      }
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
  insightsContainer.appendChild(insightsDiv);
}
document.addEventListener("DOMContentLoaded", () => {
  if (getCurrentPage() === "analyst") {
    logToConsole("Analyst Agent initialized", "system");
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.dataset.tab);
      });
    });
    loadScoutResultsFromLocalStorage();
    const nodeSearch = document.getElementById("node-search");
    if (nodeSearch) {
      nodeSearch.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          searchNodes();
        }
      });
    }
    setTimeout(initSCurveVisualization, 100);
    window.addEventListener(
      "resize",
      debounce(function () {
        if (graphData) {
          if (forceGraph) {
            const graphContainer = document.getElementById("graph-container");
            if (graphContainer) {
              forceGraph.width(graphContainer.clientWidth);
              forceGraph.height(graphContainer.clientHeight);
            }
          }
          if (sCurveData) {
            renderSCurve(graphData);
          }
        }
      }, 250)
    );
  }
});
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
  const jsonStr = JSON.stringify(result.data, null, 2);
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
let sCurveData = null;
let sCurveChart = null;
let currentTimeFilter = "All";
function filterSCurveDataByTime(technologies, period = "All") {
  try {
    if (!technologies || technologies.length === 0) {
      return {
        technologies: [],
        minYear: new Date().getFullYear() - 5,
        maxYear: new Date().getFullYear(),
        maxCumulative: 1,
      };
    }
    const currentYear = new Date().getFullYear();
    let minYear;
    const maxYear = currentYear;
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
        try {
          minYear = Math.min(
            ...technologies.flatMap((tech) =>
              tech.data.map((d) => parseInt(d.year))
            )
          );
        } catch (e) {
          minYear = currentYear - 5;
          console.error("Error determining minimum year:", e);
        }
        break;
    }
    const filteredTechnologies = technologies
      .map((tech) => {
        try {
          if (!Array.isArray(tech.data)) {
            console.warn(
              `Invalid data format for technology ${tech.technology}`,
              tech
            );
            return null;
          }
          const filteredData = tech.data.filter((d) => {
            const year = parseInt(d.year);
            return !isNaN(year) && year >= minYear && year <= maxYear;
          });
          if (filteredData.length === 0) {
            return null;
          }
          let baseValue = 0;
          if (filteredData[0] && parseInt(filteredData[0].year) > minYear) {
            const earlierPoints = tech.data.filter(
              (d) => parseInt(d.year) < minYear
            );
            if (earlierPoints.length > 0) {
              baseValue = earlierPoints[earlierPoints.length - 1].cumulative;
            }
          }
          return { ...tech, filteredData: filteredData };
        } catch (e) {
          console.error(`Error processing technology ${tech.technology}:`, e);
          return null;
        }
      })
      .filter(Boolean);
    let maxCumulative = 1;
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
      maxCumulative: maxCumulative || 1,
    };
  } catch (error) {
    console.error("Error filtering S-Curve data:", error);
    return {
      technologies: [],
      minYear: new Date().getFullYear() - 5,
      maxYear: new Date().getFullYear(),
      maxCumulative: 1,
    };
  }
}

function filterCurveByTime(period) {
  if (!sCurveData || !sCurveData.technologies) {
    logToConsole("No S-Curve data available for filtering", "warning");
    return;
  }
  document.querySelectorAll(".year-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .querySelector(`.year-btn[data-period="${period}"]`)
    .classList.add("active");
  currentTimeFilter = period;
  updateSCurveVisualization(period);
  logToConsole(`Filtered S-Curve to period: ${period}`, "info");
}

function updateSCurveVisualization(period) {
  if (!sCurveChart || !sCurveData) return;
  const { svg, width, height, margin, colorScale, line } = sCurveChart;
  const filteredData = filterSCurveDataByTime(sCurveData.technologies, period);
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
  svg
    .select("g")
    .transition()
    .duration(1000)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")));
  svg
    .selectAll("g:not(:first-child)")
    .filter(function () {
      return d3.select(this).attr("transform") !== `translate(0,${height})`;
    })
    .transition()
    .duration(1000)
    .call(d3.axisLeft(y));
  const updatedLine = d3
    .line()
    .x((d) => x(new Date(d.year, 0, 1)))
    .y((d) => y(d.cumulative))
    .curve(d3.curveMonotoneX);
  svg.selectAll(".line").remove();
  svg.selectAll(".dot").remove();
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
  paths
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke-width", 4);
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
      d3.selectAll(".tooltip").remove();
    });
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

function initSCurveVisualization() {
  if (!currentTimeFilter) {
    currentTimeFilter = "All";
  }
  document.querySelectorAll(".year-btn").forEach((btn) => {
    const newBtn = btn.cloneNode(!0);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener("click", function () {
      filterCurveByTime(this.dataset.period);
    });
  });
  const activeBtn = document.querySelector(
    `.year-btn[data-period="${currentTimeFilter}"]`
  );
  if (activeBtn) {
    activeBtn.classList.add("active");
  }
  logToConsole("S-Curve visualization initialized", "system");
}

function downloadSCurveImage() {
  const svgContainer = document.querySelector("#s-curve-container svg");
  if (!svgContainer) {
    logToConsole("No S-Curve to download", "warning");
    showToast("No S-Curve visualization to download");
    return;
  }
  try {
    const svgString = new XMLSerializer().serializeToString(svgContainer);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const svgWidth = svgContainer.width.baseVal.value;
    const svgHeight = svgContainer.height.baseVal.value;
    if (svgWidth <= 0 || svgHeight <= 0) {
      throw new Error("Invalid SVG dimensions");
    }
    canvas.width = svgWidth;
    canvas.height = svgHeight;
    const img = new Image();
    img.onload = function () {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, svgWidth, svgHeight);
      ctx.drawImage(img, 0, 0);
      try {
        const pngData = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngData;
        downloadLink.download = "technology-s-curve.png";
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
    try {
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

function renderSCurveContent(svgGroup, data, width, height, margin) {
  try {
    const technologies = data.technologies || [];
    if (technologies.length === 0) {
      throw new Error("No technology data available");
    }
    const filteredData = filterSCurveDataByTime(
      technologies,
      currentTimeFilter || "All"
    );
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
    svgGroup
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");
    svgGroup.append("g").call(d3.axisLeft(y));
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
    const line = d3
      .line()
      .x((d) => x(new Date(d.year, 0, 1)))
      .y((d) => y(d.cumulative))
      .curve(d3.curveMonotoneX);
    const colorScale = d3
      .scaleOrdinal(d3.schemeCategory10)
      .domain(filteredData.technologies.map((t) => t.technology));
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

function renderSCurve(data) {
  try {
    const container = document.getElementById("s-curve-container");
    if (!container) {
      console.error("S-curve container not found");
      return;
    }
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    if (!data || !data.s_curve_data) {
      container.innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      <p>No data available for S-Curve visualization</p>
    </div>
  `;
      return;
    }
    try {
      const margin = { top: 40, right: 120, bottom: 60, left: 50 };
      const width = container.clientWidth - margin.left - margin.right;
      const height = 400 - margin.top - margin.bottom;
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", width + margin.left + margin.right);
      svg.setAttribute("height", height + margin.top + margin.bottom);
      container.appendChild(svg);
      const svgGroup = d3
        .select(svg)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
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
