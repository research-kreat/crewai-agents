// ==================================================
// VISUALIZATION AGENT FUNCTIONALITY
// ==================================================

// Store data sources and visualization settings
let scoutResults = [];
let contextResults = [];
let currentData = null;
let currentVizType = "treemap";
let vizInstance = null;

/**
 * Load data sources from localStorage
 */
function loadDataSources() {
  try {
    // Load Scout results
    const storedScoutIndex = localStorage.getItem("scoutResultsIndex");
    if (storedScoutIndex) {
      const indexData = JSON.parse(storedScoutIndex);
      
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
      
      logToConsole(`Loaded ${scoutResults.length} scout results from localStorage`, "system");
    }
    
    // Load Context Analysis results
    const storedContextAnalyses = localStorage.getItem("contextAnalysisHistory");
    if (storedContextAnalyses) {
      contextResults = JSON.parse(storedContextAnalyses);
      logToConsole(`Loaded ${contextResults.length} context analyses from localStorage`, "system");
    }
    
    // Update select dropdowns
    updateScoutSelect();
    updateContextSelect();
  } catch (e) {
    logToConsole(`Error loading data sources: ${e.message}`, "error");
  }
}

/**
 * Update Scout results select dropdown
 */
function updateScoutSelect() {
  const selectElement = document.getElementById("scout-select");
  if (!selectElement) return;
  
  // Clear current options except the first one
  while (selectElement.options.length > 1) {
    selectElement.remove(1);
  }
  
  // Sort results by date (newest first)
  const sortedResults = [...scoutResults].sort((a, b) => {
    return new Date(b.date) - new Date(a.date) || b.timestamp.localeCompare(a.timestamp);
  });
  
  // Add options
  sortedResults.forEach((result) => {
    const option = document.createElement("option");
    option.value = result.id;
    // Truncate prompt if too long
    const promptDisplay = result.prompt.length > 40 
      ? result.prompt.substring(0, 40) + "..."
      : result.prompt;
    option.textContent = `${result.date} - ${promptDisplay}`;
    selectElement.appendChild(option);
  });
}

/**
 * Update Context Analysis select dropdown
 */
function updateContextSelect() {
  const selectElement = document.getElementById("context-select");
  if (!selectElement) return;
  
  // Clear current options except the first one
  while (selectElement.options.length > 1) {
    selectElement.remove(1);
  }
  
  // Sort results by date (newest first)
  const sortedResults = [...contextResults].sort((a, b) => {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  
  // Add options
  sortedResults.forEach((result, index) => {
    const option = document.createElement("option");
    option.value = result.id || index;
    // Use trend name or timestamp
    const trendName = result.trend_name || `Analysis ${new Date(result.timestamp).toLocaleString()}`;
    option.textContent = trendName;
    selectElement.appendChild(option);
  });
}

/**
 * Load data source based on selection
 */
function loadDataSource() {
  const sourceSelect = document.getElementById("viz-data-source");
  if (!sourceSelect) return;
  
  const selectedSource = sourceSelect.value;
  
  // Hide all source containers
  document.getElementById("scout-source-container").classList.add("hidden");
  document.getElementById("context-source-container").classList.add("hidden");
  document.getElementById("custom-source-container").classList.add("hidden");
  
  // Show the selected source container
  if (selectedSource === "scout") {
    document.getElementById("scout-source-container").classList.remove("hidden");
  } else if (selectedSource === "context") {
    document.getElementById("context-source-container").classList.remove("hidden");
  } else if (selectedSource === "custom") {
    document.getElementById("custom-source-container").classList.remove("hidden");
  }
  
  logToConsole(`Selected data source: ${selectedSource}`, "info");
}

/**
 * Load Scout data for visualization
 */
function loadScoutData() {
  const selectElement = document.getElementById("scout-select");
  if (!selectElement) return;
  
  const selectedId = selectElement.value;
  
  if (!selectedId) {
    currentData = null;
    return;
  }
  
  const result = scoutResults.find(r => r.id === selectedId);
  
  if (result) {
    currentData = {
      type: "scout",
      data: result.data,
      metadata: {
        id: result.id,
        prompt: result.prompt,
        timestamp: result.timestamp,
        date: result.date
      }
    };
    
    logToConsole(`Loaded Scout result: ${result.prompt.substring(0, 30)}...`, "info");
    updateDomainFilters();
  } else {
    currentData = null;
    logToConsole("Selected result not found", "warning");
  }
}

/**
 * Load Context Analysis data for visualization
 */
function loadContextData() {
  const selectElement = document.getElementById("context-select");
  if (!selectElement) return;
  
  const selectedId = selectElement.value;
  
  if (!selectedId) {
    currentData = null;
    return;
  }
  
  const result = contextResults.find(r => r.id === selectedId || contextResults.indexOf(r) === parseInt(selectedId));
  
  if (result) {
    currentData = {
      type: "context",
      data: result,
      metadata: {
        id: result.id || `context-${selectedId}`,
        timestamp: result.timestamp,
        trend_name: result.trend_name
      }
    };
    
    logToConsole(`Loaded Context Analysis for: ${result.trend_name || "Unknown Trend"}`, "info");
  } else {
    currentData = null;
    logToConsole("Selected context analysis not found", "warning");
  }
}

/**
 * Select visualization type
 */
function selectVizType(type) {
  // Update button states
  document.querySelectorAll(".viz-type-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  document.querySelector(`.viz-type-btn[data-viztype="${type}"]`).classList.add("active");
  
  // Update current type
  currentVizType = type;
  
  logToConsole(`Selected visualization type: ${type}`, "info");
}

/**
 * Update domain filters based on loaded data
 */
function updateDomainFilters() {
  const container = document.getElementById("domain-filters");
  if (!container || !currentData) return;
  
  // Clear existing filters except "All Domains"
  while (container.children.length > 1) {
    container.removeChild(container.lastChild);
  }
  
  // Extract domains from the data
  let domains = [];
  
  if (currentData.type === "scout" && currentData.data.relevant_trends) {
    domains = [...new Set(currentData.data.relevant_trends
      .map(trend => trend.domain)
      .filter(Boolean))];
  } else if (currentData.type === "context") {
    // Extract domains from context data
    // This would depend on the structure of your context data
  }
  
  // Add domain filters
  domains.forEach(domain => {
    const item = document.createElement("div");
    item.className = "viz-checkbox-item";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `domain-${domain.toLowerCase().replace(/\s+/g, "-")}`;
    checkbox.value = domain;
    checkbox.checked = true;
    checkbox.setAttribute("data-domain", domain);
    checkbox.onchange = updateVizOptions;
    
    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = domain;
    
    item.appendChild(checkbox);
    item.appendChild(label);
    container.appendChild(item);
  });
}

/**
 * Toggle all domains selection
 */
function toggleAllDomains() {
  const allCheckbox = document.getElementById("domain-all");
  const domainCheckboxes = document.querySelectorAll("#domain-filters input[type='checkbox']:not(#domain-all)");
  
  domainCheckboxes.forEach(checkbox => {
    checkbox.checked = allCheckbox.checked;
  });
}

/**
 * Update visualization options based on UI settings
 */
function updateVizOptions() {
  // This would be called when filter options change
  if (vizInstance) {
    // Update visualization with new options
    // This depends on the visualization library used
  }
}

/**
 * Generate visualization based on current data and settings
 */
function generateVisualization() {
  // Validate data
  if (!currentData) {
    showToast("Please select a data source first");
    logToConsole("No data selected for visualization", "warning");
    return;
  }
  
  // Show loading state
  document.getElementById("loading").classList.remove("hidden");
  
  // Hide any existing visualization
  const vizContainer = document.getElementById("viz-container");
  vizContainer.innerHTML = "";
  
  // Get visualization options
  const groupBy = document.getElementById("group-by").value;
  const colorBy = document.getElementById("color-by").value;
  const sizeBy = document.getElementById("size-by").value;
  
  // Get selected domains
  const selectedDomains = Array.from(
    document.querySelectorAll("#domain-filters input[type='checkbox']:not(#domain-all):checked")
  ).map(checkbox => checkbox.getAttribute("data-domain"));
  
  // Prepare visualization data
  let vizData = prepareVisualizationData(currentData, {
    groupBy,
    colorBy,
    sizeBy,
    selectedDomains
  });
  
  logToConsole(`Preparing ${currentVizType} visualization...`, "info");
  
  // Create the visualization based on selected type
  try {
    switch (currentVizType) {
      case "treemap":
        createTreemapVisualization(vizData);
        break;
      case "network":
        createNetworkVisualization(vizData);
        break;
      case "timeline":
        createTimelineVisualization(vizData);
        break;
      case "radar":
        createRadarVisualization(vizData);
        break;
      default:
        createTreemapVisualization(vizData);
    }
    
    // Hide loading
    document.getElementById("loading").classList.add("hidden");
    
    logToConsole(`${currentVizType} visualization created successfully`, "info");
  } catch (error) {
    // Hide loading
    document.getElementById("loading").classList.add("hidden");
    
    // Show error
    vizContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error generating visualization: ${error.message}</p>
      </div>
    `;
    
    logToConsole(`Error generating visualization: ${error.message}`, "error");
  }
}

/**
 * Prepare data for visualization based on selected options
 */
function prepareVisualizationData(sourceData, options) {
  if (!sourceData || !sourceData.data) {
    return [];
  }
  
  const { groupBy, colorBy, sizeBy, selectedDomains } = options;
  let processedData = [];
  
  if (sourceData.type === "scout") {
    const scoutData = sourceData.data;
    
    // Process relevant trends if they exist
    if (scoutData.relevant_trends && Array.isArray(scoutData.relevant_trends)) {
      // Filter by selected domains if applicable
      let trends = scoutData.relevant_trends;
      if (selectedDomains && selectedDomains.length > 0) {
        trends = trends.filter(trend => selectedDomains.includes(trend.domain));
      }
      
      // Process trends based on visualization type
      switch (currentVizType) {
        case "treemap":
          processedData = processForTreemap(trends, groupBy, colorBy, sizeBy);
          break;
        case "network":
          processedData = processForNetwork(trends, colorBy);
          break;
        case "timeline":
          processedData = processForTimeline(trends, colorBy, sizeBy);
          break;
        case "radar":
          processedData = processForRadar(trends, groupBy, colorBy);
          break;
        default:
          processedData = processForTreemap(trends, groupBy, colorBy, sizeBy);
      }
    }
  } else if (sourceData.type === "context") {
    // Process context analysis data
    // This would depend on the structure of your context data
    // and what you want to visualize from it
  }
  
  return processedData;
}

/**
 * Process data for treemap visualization
 */
function processForTreemap(trends, groupBy, colorBy, sizeBy) {
  // Group the trends
  const groups = {};
  
  trends.forEach(trend => {
    const groupValue = trend[groupBy] || "Unknown";
    
    if (!groups[groupValue]) {
      groups[groupValue] = {
        name: groupValue,
        children: []
      };
    }
    
    // Calculate size value based on selected metric
    let size = 1;
    if (sizeBy === "similarity_score" && trend.similarity_score !== undefined) {
      size = trend.similarity_score * 10;
    } else if (sizeBy === "data_quality_score" && trend.data_quality_score !== undefined) {
      size = trend.data_quality_score * 10;
    }
    
    // Calculate color value
    let color = trend[colorBy];
    
    // Add to children
    groups[groupValue].children.push({
      name: trend.title || `Trend ${groups[groupValue].children.length + 1}`,
      value: size,
      colorValue: color,
      id: trend.id,
      original: trend
    });
  });
  
  // Convert to hierarchy format for D3
  return {
    name: "Trends",
    children: Object.values(groups)
  };
}

/**
 * Process data for network visualization
 */
function processForNetwork(trends, colorBy) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();
  
  // Add all trends as nodes
  trends.forEach(trend => {
    const node = {
      id: trend.id || `trend-${nodes.length}`,
      name: trend.title || "Unnamed Trend",
      group: trend.domain || "Unknown",
      type: "trend",
      colorValue: trend[colorBy],
      original: trend
    };
    
    nodes.push(node);
    nodeMap.set(node.id, node);
    
    // Add technologies as nodes if they exist
    if (trend.technologies && Array.isArray(trend.technologies)) {
      trend.technologies.forEach(tech => {
        const techId = `tech-${tech.replace(/\s+/g, "-").toLowerCase()}`;
        
        // Only add if not already in nodes
        if (!nodeMap.has(techId)) {
          const techNode = {
            id: techId,
            name: tech,
            group: "Technology",
            type: "technology"
          };
          nodes.push(techNode);
          nodeMap.set(techId, techNode);
        }
        
        // Add link from trend to technology
        links.push({
          source: node.id,
          target: techId,
          type: "uses",
          value: 1
        });
      });
    }
    
    // Add keywords as nodes if they exist
    if (trend.keywords && Array.isArray(trend.keywords)) {
      trend.keywords.forEach(keyword => {
        const keywordId = `keyword-${keyword.replace(/\s+/g, "-").toLowerCase()}`;
        
        // Only add if not already in nodes
        if (!nodeMap.has(keywordId)) {
          const keywordNode = {
            id: keywordId,
            name: keyword,
            group: "Keyword",
            type: "keyword"
          };
          nodes.push(keywordNode);
          nodeMap.set(keywordId, keywordNode);
        }
        
        // Add link from trend to keyword
        links.push({
          source: node.id,
          target: keywordId,
          type: "has",
          value: 1
        });
      });
    }
  });
  
  // Add connections between trends with same domain
  trends.forEach((trend1, i) => {
    trends.slice(i + 1).forEach(trend2 => {
      if (trend1.domain && trend2.domain && trend1.domain === trend2.domain) {
        // Create source and target IDs
        const sourceId = trend1.id || `trend-${i}`;
        const targetId = trend2.id || `trend-${trends.indexOf(trend2)}`;
        
        // Add link
        links.push({
          source: sourceId,
          target: targetId,
          type: "related",
          value: 0.5
        });
      }
    });
  });
  
  return { nodes, links };
}

/**
 * Process data for timeline visualization
 */
function processForTimeline(trends, colorBy, sizeBy) {
  // Filter trends with publication date
  const timelineTrends = trends.filter(trend => trend.publication_date);
  
  // Format data for timeline
  return timelineTrends.map(trend => {
    // Calculate size based on selected metric
    let size = 1;
    if (sizeBy === "similarity_score" && trend.similarity_score !== undefined) {
      size = trend.similarity_score * 10;
    } else if (sizeBy === "data_quality_score" && trend.data_quality_score !== undefined) {
      size = trend.data_quality_score * 10;
    }
    
    return {
      id: trend.id,
      title: trend.title || "Unnamed Trend",
      date: trend.publication_date,
      group: trend.domain || "Unknown",
      colorValue: trend[colorBy],
      size: size,
      original: trend
    };
  });
}

/**
 * Process data for radar visualization
 */
function processForRadar(trends, groupBy, colorBy) {
  // Group trends by the selected grouping attribute
  const groups = {};
  
  trends.forEach(trend => {
    const groupValue = trend[groupBy] || "Unknown";
    
    if (!groups[groupValue]) {
      groups[groupValue] = {
        name: groupValue,
        metrics: {}
      };
    }
    
    // Collect various metrics for radar chart
    if (trend.similarity_score !== undefined) {
      groups[groupValue].metrics.similarity = (groups[groupValue].metrics.similarity || 0) + trend.similarity_score;
      groups[groupValue].metrics.count = (groups[groupValue].metrics.count || 0) + 1;
    }
    
    if (trend.data_quality_score !== undefined) {
      groups[groupValue].metrics.quality = (groups[groupValue].metrics.quality || 0) + trend.data_quality_score;
    }
    
    // Count technologies if they exist
    if (trend.technologies && Array.isArray(trend.technologies)) {
      groups[groupValue].metrics.technologies = (groups[groupValue].metrics.technologies || 0) + trend.technologies.length;
    }
    
    // Count keywords if they exist
    if (trend.keywords && Array.isArray(trend.keywords)) {
      groups[groupValue].metrics.keywords = (groups[groupValue].metrics.keywords || 0) + trend.keywords.length;
    }
  });
  
  // Calculate averages for metrics
  Object.values(groups).forEach(group => {
    if (group.metrics.count) {
      group.metrics.similarity = group.metrics.similarity / group.metrics.count;
      group.metrics.quality = group.metrics.quality / group.metrics.count;
    }
  });
  
  return Object.values(groups);
}

/**
 * Create treemap visualization using D3.js
 */
function createTreemapVisualization(data) {
  const container = document.getElementById("viz-container");
  container.innerHTML = "";
  
  const width = container.clientWidth;
  const height = container.clientHeight || 400;
  
  // Create SVG element
  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "font: 10px sans-serif; overflow: visible;");
  
  // Create treemap layout
  const root = d3.hierarchy(data)
    .sum(d => d.value || 1)
    .sort((a, b) => b.value - a.value);
  
  d3.treemap()
    .size([width, height])
    .padding(2)
    .round(true)
    (root);
  
  // Generate color scale
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
  
  // Create legend
  const legend = document.getElementById("color-legend");
  legend.innerHTML = "";
  
  // Add groups to legend
  const groups = new Set();
  root.children.forEach(child => {
    groups.add(child.data.name);
  });
  
  groups.forEach(group => {
    const item = document.createElement("div");
    item.className = "legend-item";
    
    const color = document.createElement("div");
    color.className = "legend-color";
    color.style.backgroundColor = colorScale(group);
    
    const label = document.createElement("span");
    label.textContent = group;
    
    item.appendChild(color);
    item.appendChild(label);
    legend.appendChild(item);
  });
  
  // Create tooltip
  const tooltip = document.getElementById("viz-tooltip");
  
  // Add leaf nodes (the actual data points)
  const leaf = svg.selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);
  
  leaf.append("rect")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => colorScale(d.parent.data.name))
    .attr("fill-opacity", 0.8)
    .on("mouseover", (event, d) => {
      // Show tooltip
      tooltip.style.display = "block";
      tooltip.style.left = `${event.pageX + 10}px`;
      tooltip.style.top = `${event.pageY - 28}px`;
      
      // Format tooltip content
      const original = d.data.original;
      let content = `<strong>${d.data.name}</strong><br>`;
      
      if (original) {
        content += `Domain: ${original.domain || "Unknown"}<br>`;
        content += `Type: ${original.knowledge_type || "Unknown"}<br>`;
        if (original.similarity_score !== undefined) {
          content += `Similarity: ${original.similarity_score.toFixed(2)}<br>`;
        }
        if (original.data_quality_score !== undefined) {
          content += `Quality: ${original.data_quality_score.toFixed(2)}<br>`;
        }
      }
      
      tooltip.innerHTML = content;
    })
    .on("mouseout", () => {
      tooltip.style.display = "none";
    });
  
  // Add labels
  leaf.append("text")
    .selectAll("tspan")
    .data(d => d.data.name.split(/(?=[A-Z][a-z])|\s+/).concat(d.value ? d.value.toFixed(2) : ""))
    .join("tspan")
    .attr("x", 3)
    .attr("y", (d, i, nodes) => `${(i === nodes.length - 1) * 0.3 + 1.1 + i * 0.9}em`)
    .attr("fill-opacity", (d, i, nodes) => i === nodes.length - 1 ? 0.7 : 1)
    .attr("font-weight", (d, i, nodes) => i === nodes.length - 1 ? "normal" : "bold")
    .text(d => d);
  
  container.appendChild(svg.node());
  
  // Save reference for later updates
  vizInstance = {
    type: "treemap",
    svg: svg,
    colorScale: colorScale,
    data: data
  };
}

/**
 * Create network visualization using D3.js force-directed graph
 */
function createNetworkVisualization(data) {
  const container = document.getElementById("viz-container");
  container.innerHTML = "";
  
  const width = container.clientWidth;
  const height = container.clientHeight || 400;
  
  // Create SVG element
  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);
  
  // Create tooltip
  const tooltip = document.getElementById("viz-tooltip");
  
  // Generate color scale
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
  
  // Create legend
  const legend = document.getElementById("color-legend");
  legend.innerHTML = "";
  
  // Add groups to legend
  const groups = new Set();
  data.nodes.forEach(node => {
    groups.add(node.group);
  });
  
  groups.forEach(group => {
    const item = document.createElement("div");
    item.className = "legend-item";
    
    const color = document.createElement("div");
    color.className = "legend-color";
    color.style.backgroundColor = colorScale(group);
    
    const label = document.createElement("span");
    label.textContent = group;
    
    item.appendChild(color);
    item.appendChild(label);
    legend.appendChild(item);
  });
  
  // Create force simulation
  const simulation = d3.forceSimulation(data.nodes)
    .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(30));
  
  // Add links
  const link = svg.append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("stroke-width", d => Math.sqrt(d.value));
  
  // Add nodes
  const node = svg.append("g")
    .selectAll(".node")
    .data(data.nodes)
    .join("g")
    .attr("class", "node")
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));
  
  // Add circles for nodes
  node.append("circle")
    .attr("r", d => d.type === "trend" ? 8 : 5)
    .attr("fill", d => colorScale(d.group))
    .on("mouseover", (event, d) => {
      // Show tooltip
      tooltip.style.display = "block";
      tooltip.style.left = `${event.pageX + 10}px`;
      tooltip.style.top = `${event.pageY - 28}px`;
      
      // Format tooltip content
      let content = `<strong>${d.name}</strong><br>`;
      content += `Type: ${d.type}<br>`;
      content += `Group: ${d.group}<br>`;
      
      if (d.original) {
        if (d.original.similarity_score !== undefined) {
          content += `Similarity: ${d.original.similarity_score.toFixed(2)}<br>`;
        }
        if (d.original.data_quality_score !== undefined) {
          content += `Quality: ${d.original.data_quality_score.toFixed(2)}<br>`;
        }
      }
      
      tooltip.innerHTML = content;
    })
    .on("mouseout", () => {
      tooltip.style.display = "none";
    });
  
  // Add labels
  node.append("text")
    .text(d => d.name)
    .attr("x", 12)
    .attr("y", 3)
    .style("font-size", "8px");
  
  // Update positions in simulation
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    
    node
      .attr("transform", d => `translate(${d.x},${d.y})`);
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
  
  container.appendChild(svg.node());
  
  // Save reference for later updates
  vizInstance = {
    type: "network",
    svg: svg,
    simulation: simulation,
    colorScale: colorScale,
    data: data
  };
}

/**
 * Create timeline visualization using D3.js
 */
function createTimelineVisualization(data) {
  const container = document.getElementById("viz-container");
  container.innerHTML = "";
  
  const width = container.clientWidth;
  const height = container.clientHeight || 400;
  const margin = {top: 20, right: 30, bottom: 50, left: 40};
  
  // Create SVG element
  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);
  
  // Create tooltip
  const tooltip = document.getElementById("viz-tooltip");
  
  // Parse dates and sort by date
  data.forEach(d => {
    d.parsedDate = new Date(d.date);
  });
  
  data.sort((a, b) => a.parsedDate - b.parsedDate);
  
  // Generate color scale
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
  
  // Create legend
  const legend = document.getElementById("color-legend");
  legend.innerHTML = "";
  
  // Add groups to legend
  const groups = new Set();
  data.forEach(d => {
    groups.add(d.group);
  });
  
  groups.forEach(group => {
    const item = document.createElement("div");
    item.className = "legend-item";
    
    const color = document.createElement("div");
    color.className = "legend-color";
    color.style.backgroundColor = colorScale(group);
    
    const label = document.createElement("span");
    label.textContent = group;
    
    item.appendChild(color);
    item.appendChild(label);
    legend.appendChild(item);
  });
  
  // Create scales
  const x = d3.scaleTime()
    .domain(d3.extent(data, d => d.parsedDate))
    .range([margin.left, width - margin.right]);
  
  const y = d3.scalePoint()
    .domain([...groups])
    .range([margin.top, height - margin.bottom])
    .padding(0.5);
  
  // Add X axis
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  
  // Add Y axis
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));
  
  // Add data points
  svg.append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", d => x(d.parsedDate))
    .attr("cy", d => y(d.group))
    .attr("r", d => d.size || 5)
    .attr("fill", d => colorScale(d.group))
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .on("mouseover", (event, d) => {
      // Show tooltip
      tooltip.style.display = "block";
      tooltip.style.left = `${event.pageX + 10}px`;
      tooltip.style.top = `${event.pageY - 28}px`;
      
      // Format tooltip content
      let content = `<strong>${d.title}</strong><br>`;
      content += `Date: ${d.date}<br>`;
      content += `Group: ${d.group}<br>`;
      
      if (d.original) {
        if (d.original.similarity_score !== undefined) {
          content += `Similarity: ${d.original.similarity_score.toFixed(2)}<br>`;
        }
        if (d.original.data_quality_score !== undefined) {
          content += `Quality: ${d.original.data_quality_score.toFixed(2)}<br>`;
        }
      }
      
      tooltip.innerHTML = content;
    })
    .on("mouseout", () => {
      tooltip.style.display = "none";
    });
  
  // Add labels if space permits
  svg.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("x", d => x(d.parsedDate) + 10)
    .attr("y", d => y(d.group) + 4)
    .text(d => d.title.length > 20 ? d.title.substring(0, 20) + "..." : d.title)
    .style("font-size", "8px")
    .style("display", (d, i) => i % 2 === 0 ? "block" : "none"); // Show only every other label to reduce clutter
  
  container.appendChild(svg.node());
  
  // Save reference for later updates
  vizInstance = {
    type: "timeline",
    svg: svg,
    x: x,
    y: y,
    colorScale: colorScale,
    data: data
  };
}

/**
 * Create radar visualization using D3.js
 */
function createRadarVisualization(data) {
  const container = document.getElementById("viz-container");
  container.innerHTML = "";
  
  const width = container.clientWidth;
  const height = container.clientHeight || 400;
  const margin = 60;
  const radius = Math.min(width, height) / 2 - margin;
  
  // Create SVG element
  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);
  
  // Create tooltip
  const tooltip = document.getElementById("viz-tooltip");
  
  // Extract the metrics from the data
  const metrics = new Set();
  data.forEach(group => {
    Object.keys(group.metrics).forEach(metric => {
      if (metric !== "count") {
        metrics.add(metric);
      }
    });
  });
  
  const metricsList = [...metrics];
  
  // Calculate the angle for each metric
  const angleSlice = (Math.PI * 2) / metricsList.length;
  
  // Find the maximum value for each metric
  const maxValues = {};
  metricsList.forEach(metric => {
    maxValues[metric] = d3.max(data, d => d.metrics[metric]) || 1;
  });
  
  // Create scales for each metric
  const rScales = {};
  metricsList.forEach(metric => {
    rScales[metric] = d3.scaleLinear()
      .domain([0, maxValues[metric]])
      .range([0, radius]);
  });
  
  // Generate color scale
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
  
  // Create legend
  const legend = document.getElementById("color-legend");
  legend.innerHTML = "";
  
  // Add groups to legend
  data.forEach(group => {
    const item = document.createElement("div");
    item.className = "legend-item";
    
    const color = document.createElement("div");
    color.className = "legend-color";
    color.style.backgroundColor = colorScale(group.name);
    
    const label = document.createElement("span");
    label.textContent = group.name;
    
    item.appendChild(color);
    item.appendChild(label);
    legend.appendChild(item);
  });
  
  // Draw the circular grid
  const axisGrid = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);
  
  // Draw the axes
  const axes = axisGrid.selectAll(".axis")
    .data(metricsList)
    .enter()
    .append("g")
    .attr("class", "axis");
  
  // Draw axis lines
  axes.append("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", (d, i) => radius * Math.cos(angleSlice * i - Math.PI / 2))
    .attr("y2", (d, i) => radius * Math.sin(angleSlice * i - Math.PI / 2))
    .attr("stroke", "lightgray")
    .attr("stroke-width", 1);
  
  // Add axis labels
  axes.append("text")
    .attr("x", (d, i) => (radius + 10) * Math.cos(angleSlice * i - Math.PI / 2))
    .attr("y", (d, i) => (radius + 10) * Math.sin(angleSlice * i - Math.PI / 2))
    .attr("text-anchor", (d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      if (Math.abs(angle) < 0.1 || Math.abs(angle - Math.PI) < 0.1) {
        return "middle";
      } else if (angle > 0 && angle < Math.PI) {
        return "start";
      } else {
        return "end";
      }
    })
    .attr("dy", "0.35em")
    .text(d => d.charAt(0).toUpperCase() + d.slice(1))
    .style("font-size", "10px");
  
  // Draw the radar chart areas
  const radarLine = d3.lineRadial()
    .curve(d3.curveLinearClosed)
    .radius((d, i) => {
      const metric = metricsList[i];
      return rScales[metric](d);
    })
    .angle((d, i) => i * angleSlice);
  
  // Add radar areas
  const radarAreas = axisGrid.selectAll(".radar-area")
    .data(data)
    .enter()
    .append("path")
    .attr("class", "radar-area")
    .attr("d", d => {
      const values = metricsList.map(metric => d.metrics[metric] || 0);
      return radarLine(values);
    })
    .attr("fill", d => colorScale(d.name))
    .attr("fill-opacity", 0.1)
    .attr("stroke", d => colorScale(d.name))
    .attr("stroke-width", 2)
    .on("mouseover", (event, d) => {
      // Show tooltip
      tooltip.style.display = "block";
      tooltip.style.left = `${event.pageX + 10}px`;
      tooltip.style.top = `${event.pageY - 28}px`;
      
      // Format tooltip content
      let content = `<strong>${d.name}</strong><br>`;
      
      metricsList.forEach(metric => {
        if (d.metrics[metric] !== undefined) {
          content += `${metric.charAt(0).toUpperCase() + metric.slice(1)}: ${d.metrics[metric].toFixed(2)}<br>`;
        }
      });
      
      tooltip.innerHTML = content;
    })
    .on("mouseout", () => {
      tooltip.style.display = "none";
    });
  
  container.appendChild(svg.node());
  
  // Save reference for later updates
  vizInstance = {
    type: "radar",
    svg: svg,
    colorScale: colorScale,
    data: data
  };
}

/**
 * Reset visualization view
 */
function resetVisualization() {
  if (!vizInstance) return;
  
  // Different reset behavior based on visualization type
  if (vizInstance.type === "network" && vizInstance.simulation) {
    // Reset force simulation
    vizInstance.simulation.alpha(1).restart();
  } else if (vizInstance.type === "treemap" || vizInstance.type === "timeline" || vizInstance.type === "radar") {
    // Recreate the visualization
    generateVisualization();
  }
}

/**
 * Toggle labels in visualization
 */
function toggleLabels() {
  if (!vizInstance || !vizInstance.svg) return;
  
  const svg = vizInstance.svg.node();
  
  // Toggle label visibility based on visualization type
  if (vizInstance.type === "network") {
    const labels = svg.querySelectorAll(".node text");
    labels.forEach(label => {
      label.style.display = label.style.display === "none" ? "block" : "none";
    });
  } else if (vizInstance.type === "treemap") {
    const labels = svg.querySelectorAll("text");
    labels.forEach(label => {
      label.style.display = label.style.display === "none" ? "block" : "none";
    });
  } else if (vizInstance.type === "timeline") {
    const labels = svg.querySelectorAll("g > text");
    labels.forEach(label => {
      label.style.display = label.style.display === "none" ? "block" : "none";
    });
  }
}

/**
 * Toggle fullscreen mode for visualization
 */
function toggleFullscreen() {
  const container = document.getElementById("viz-container");
  
  if (!document.fullscreenElement) {
    // Enter fullscreen
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.mozRequestFullScreen) {
      container.mozRequestFullScreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    }
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

/**
 * Download visualization as SVG or PNG
 */
function downloadVisualization() {
  if (!vizInstance || !vizInstance.svg) {
    showToast("No visualization to download");
    return;
  }
  
  const svg = vizInstance.svg.node();
  
  try {
    // Convert SVG to string
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);
    
    // Add XML declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    
    // Convert to blob
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    // Create link and trigger download
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `visualization-${currentVizType}-${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    logToConsole("Visualization downloaded as SVG", "info");
  } catch (error) {
    showToast("Error downloading visualization: " + error.message);
    logToConsole(`Error downloading visualization: ${error.message}`, "error");
  }
}

/**
 * Generate insights for current visualization
 */
function generateVizInsights() {
  if (!currentData || !vizInstance) {
    showToast("Generate a visualization first");
    return;
  }
  
  // Show loading
  document.getElementById("insights-loading").classList.remove("hidden");
  
  // Clear previous insights
  const insightsContainer = document.getElementById("insights-content");
  insightsContainer.innerHTML = "";
  
  // Get data for insights
  const dataForInsights = {
    visualization_type: currentVizType,
    data_source: currentData.type,
    data: currentData.data,
    metadata: currentData.metadata,
    visualization_options: {
      groupBy: document.getElementById("group-by").value,
      colorBy: document.getElementById("color-by").value,
      sizeBy: document.getElementById("size-by").value
    }
  };
  
  // Send API request
  fetch(`${apiUrl}/agent/visualization/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dataForInsights)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      // Hide loading
      document.getElementById("insights-loading").classList.add("hidden");
      
      // Add insights
      if (data.insights && Array.isArray(data.insights)) {
        // Create summary section
        const summarySection = document.createElement("div");
        summarySection.className = "insights-section";
        
        const summaryTitle = document.createElement("h4");
        summaryTitle.textContent = "Summary";
        summarySection.appendChild(summaryTitle);
        
        const summaryText = document.createElement("p");
        summaryText.textContent = data.summary || "Visualization insights";
        summarySection.appendChild(summaryText);
        
        insightsContainer.appendChild(summarySection);
        
        // Create insights section
        const insightsSection = document.createElement("div");
        insightsSection.className = "insights-section";
        
        const insightsTitle = document.createElement("h4");
        insightsTitle.textContent = "Key Insights";
        insightsSection.appendChild(insightsTitle);
        
        const insightsList = document.createElement("ul");
        insightsList.className = "insights-list";
        
        data.insights.forEach(insight => {
          const item = document.createElement("li");
          item.textContent = insight;
          insightsList.appendChild(item);
        });
        
        insightsSection.appendChild(insightsList);
        insightsContainer.appendChild(insightsSection);
        
        // Create recommendations section if available
        if (data.recommendations && Array.isArray(data.recommendations)) {
          const recomSection = document.createElement("div");
          recomSection.className = "insights-section";
          
          const recomTitle = document.createElement("h4");
          recomTitle.textContent = "Recommendations";
          recomSection.appendChild(recomTitle);
          
          const recomList = document.createElement("ul");
          recomList.className = "insights-list";
          
          data.recommendations.forEach(recom => {
            const item = document.createElement("li");
            item.textContent = recom;
            recomList.appendChild(item);
          });
          
          recomSection.appendChild(recomList);
          insightsContainer.appendChild(recomSection);
        }
      } else {
        // Show default message if no insights
        insightsContainer.innerHTML = `
          <p>No specific insights generated for this visualization.</p>
        `;
      }
      
      logToConsole("Insights generated successfully", "info");
    })
    .catch(error => {
      // Hide loading
      document.getElementById("insights-loading").classList.add("hidden");
      
      // Show error
      insightsContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error generating insights: ${error.message}</p>
        </div>
      `;
      
      logToConsole(`Error generating insights: ${error.message}`, "error");
    });
}

/**
 * Copy insights to clipboard
 */
function copyInsights() {
  const insightsContainer = document.getElementById("insights-content");
  
  if (!insightsContainer || insightsContainer.querySelector(".placeholder-message")) {
    showToast("No insights to copy");
    return;
  }
  
  try {
    // Get text content
    const text = insightsContainer.innerText;
    
    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      showToast("Insights copied to clipboard");
      logToConsole("Insights copied to clipboard", "info");
    });
  } catch (error) {
    showToast("Failed to copy: " + error.message);
    logToConsole(`Failed to copy: ${error.message}`, "error");
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("viz-data-source")) {
    logToConsole("Visualization Agent initialized", "system");
    
    // Load data sources
    loadDataSources();
    
    // Connect to socket if available
    if (typeof io !== 'undefined') {
      connectSocket();
    }
  }
});