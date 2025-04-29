// Focus mode toggle
function toggleFocusMode() {
  const focusModeBtn = document.getElementById("focusModeBtn");
  const isFocusMode = focusModeBtn.classList.contains("active");

  if (isFocusMode) {
    // Disable focus mode
    focusModeBtn.classList.remove("active");
    graph.nodeColor((node) => getNodeColor(node));
    graph.linkWidth(
      (link) =>
        parseFloat(document.getElementById("linkWidth").value) *
        (link.weight || 1)
    );
    graph.linkColor(themes[currentTheme].link);

    // Reset selection
    selectedNodeId = null;

    showNotification("Focus mode disabled");
  } else {
    // Enable focus mode (but need a node selected first)
    showNotification("Focus mode enabled. Click on a node to focus.", "info");
    focusModeBtn.classList.add("active");
  }
}

// Handle node hover
function handleNodeHover(node, prevNode) {
  if (!node) {
    // Reset cursor and hide tooltip
    document.getElementById("graphDiv").style.cursor = "default";
    if (nodeTooltip) {
      nodeTooltip.style.opacity = 0;
    }
    return;
  }

  // Set cursor
  document.getElementById("graphDiv").style.cursor = "pointer";

  // Show tooltip if enabled
  if (document.getElementById("showTooltips").checked) {
    const mouseEvent = d3.event || window.event;

    nodeTooltip.style.left = `${mouseEvent.clientX + 10}px`;
    nodeTooltip.style.top = `${mouseEvent.clientY + 10}px`;

    let tooltipHTML = `<strong>${node.title || node.id}</strong><br>`;
    tooltipHTML += `Type: ${node.type || "Unknown"}<br>`;

    if (node.type === "trend" && node.similarity_score != null) {
      tooltipHTML += `Similarity: ${node.similarity_score.toFixed(2)}<br>`;
    }

    if (node.domain) {
      tooltipHTML += `Domain: ${node.domain}<br>`;
    }

    // Count connections
    const connections = graphData.links.filter(
      (link) =>
        link.source === node ||
        link.target === node ||
        link.source.id === node.id ||
        link.target.id === node.id
    ).length;

    tooltipHTML += `Connections: ${connections}`;

    nodeTooltip.innerHTML = tooltipHTML;
    nodeTooltip.style.opacity = 1;
  }
}

// Handle node click
function handleNodeClick(node) {
  // Show node details in modal
  selectedNode = node;
  selectedNodeId = node.id;

  // Check if focus mode is active
  const focusModeBtn = document.getElementById("focusModeBtn");
  if (focusModeBtn.classList.contains("active")) {
    focusOnNode(node.id);
  } else {
    showNodeDetails(node);
  }
}

// Handle link hover
function handleLinkHover(link) {
  if (!link) {
    document.getElementById("graphDiv").style.cursor = "default";
    return;
  }

  document.getElementById("graphDiv").style.cursor = "pointer";
}

// Handle link click
function handleLinkClick(link) {
  // Show link details
  const sourceNode =
    typeof link.source === "object"
      ? link.source
      : graphData.nodes.find((node) => node.id === link.source);
  const targetNode =
    typeof link.target === "object"
      ? link.target
      : graphData.nodes.find((node) => node.id === link.target);

  if (!sourceNode || !targetNode) return;

  const sourceName = sourceNode.title || sourceNode.id;
  const targetName = targetNode.title || targetNode.id;

  let relationshipType = link.type || "related";

  showNotification(`Link: ${sourceName} → ${targetName} (${relationshipType})`);

  // Highlight the link
  const highlightModeBtn = document.getElementById("highlightModeBtn");
  if (highlightModeBtn.classList.contains("active")) {
    highlightLink(link);
  }
}

// Focus on a specific node
function focusOnNode(nodeId) {
  if (!graphData) return;

  const node = graphData.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  // Highlight the selected node and its connections
  // Find connected nodes
  const connectedNodeIds = new Set();
  const connectedLinks = graphData.links.filter((link) => {
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId === nodeId) {
      connectedNodeIds.add(targetId);
      return true;
    }

    if (targetId === nodeId) {
      connectedNodeIds.add(sourceId);
      return true;
    }

    return false;
  });

  // Update node colors
  graph.nodeColor((n) => {
    if (n.id === nodeId) {
      // Selected node
      return "#f06292"; // Pink
    }

    if (connectedNodeIds.has(n.id)) {
      // Connected nodes
      return "#ffb74d"; // Orange
    }

    // Other nodes (dimmed)
    return `rgba(${hexToRgb(getNodeColor(n))}, 0.3)`;
  });

  // Update link colors and widths
  graph.linkWidth((link) => {
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId === nodeId || targetId === nodeId) {
      return parseFloat(document.getElementById("linkWidth").value) * 2;
    }

    return parseFloat(document.getElementById("linkWidth").value) * 0.5;
  });

  graph.linkColor((link) => {
    const sourceId =
      typeof link.source === "object" ? link.source.id : link.source;
    const targetId =
      typeof link.target === "object" ? link.target.id : link.target;

    if (sourceId === nodeId || targetId === nodeId) {
      return "#ffb74d"; // Orange
    }

    return `rgba(${hexToRgb(themes[currentTheme].link)}, 0.3)`;
  });

  // Center camera on the node
  const distance = 100;
  graph.centerAt(node.x, node.y, 300);

  setTimeout(() => {
    graph.zoom(2, 300);
  }, 300);

  showNotification(`Focused on ${node.title || node.id}`);
}

// Highlight a specific link
function highlightLink(link) {
  // Store original link width and color
  const originalWidth = parseFloat(document.getElementById("linkWidth").value);
  const originalColor = themes[currentTheme].link;

  // Highlight the link
  graph.linkWidth((l) => {
    if (l === link) {
      return originalWidth * 3;
    }
    return originalWidth * 0.5;
  });

  graph.linkColor((l) => {
    if (l === link) {
      return "#ff5252"; // Red
    }
    return `rgba(${hexToRgb(originalColor)}, 0.3)`;
  });

  // Also highlight the source and target nodes
  const sourceId =
    typeof link.source === "object" ? link.source.id : link.source;
  const targetId =
    typeof link.target === "object" ? link.target.id : link.target;

  graph.nodeColor((n) => {
    if (n.id === sourceId || n.id === targetId) {
      return "#ff5252"; // Red
    }
    return `rgba(${hexToRgb(getNodeColor(n))}, 0.3)`;
  });
}

// Toggle highlight mode
function toggleHighlightMode() {
  const highlightModeBtn = document.getElementById("highlightModeBtn");
  const isHighlightMode = highlightModeBtn.classList.contains("active");

  if (isHighlightMode) {
    // Disable highlight mode
    highlightModeBtn.classList.remove("active");

    // Reset colors
    graph.nodeColor((node) => getNodeColor(node));
    graph.linkWidth(
      (link) =>
        parseFloat(document.getElementById("linkWidth").value) *
        (link.weight || 1)
    );
    graph.linkColor(themes[currentTheme].link);

    showNotification("Highlight mode disabled");
  } else {
    // Enable highlight mode
    highlightModeBtn.classList.add("active");
    showNotification(
      "Highlight mode enabled. Click on a link to highlight.",
      "info"
    );
  }
}

// Show node details in modal
function showNodeDetails(node) {
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  modalTitle.textContent = node.title || node.id;

  let bodyHTML = '<div class="node-details">';

  // General section
  bodyHTML += '<div class="detail-section">';
  bodyHTML += "<h3>General Information</h3>";
  bodyHTML += '<div class="property-list">';
  bodyHTML += `<div class="property-name">Type:</div><div class="property-value">${
    node.type || "Unknown"
  }</div>`;
  bodyHTML += `<div class="property-name">ID:</div><div class="property-value">${node.id}</div>`;

  if (node.domain) {
    bodyHTML += `<div class="property-name">Domain:</div><div class="property-value">${node.domain}</div>`;
  }

  if (node.type === "trend" && node.similarity_score != null) {
    bodyHTML += `<div class="property-name">Similarity Score:</div><div class="property-value">${node.similarity_score.toFixed(
      4
    )}</div>`;
  }

  // Count connections
  const connections = graphData.links.filter(
    (link) =>
      link.source === node ||
      link.target === node ||
      link.source.id === node.id ||
      link.target.id === node.id
  ).length;

  bodyHTML += `<div class="property-name">Connections:</div><div class="property-value">${connections}</div>`;

  bodyHTML += "</div>"; // End property-list
  bodyHTML += "</div>"; // End detail-section

  // Additional details based on node type
  if (node.type === "trend") {
    if (node.data) {
      // Custom data section
      bodyHTML += '<div class="detail-section">';
      bodyHTML += "<h3>Trend Details</h3>";
      bodyHTML += '<div class="property-list">';

      // Show common trend properties
      if (node.data.publication_date) {
        bodyHTML += `<div class="property-name">Publication Date:</div><div class="property-value">${node.data.publication_date}</div>`;
      }

      if (node.data.knowledge_type) {
        bodyHTML += `<div class="property-name">Knowledge Type:</div><div class="property-value">${node.data.knowledge_type}</div>`;
      }

      bodyHTML += "</div>"; // End property-list

      // Show technologies if available
      if (node.data.technologies && node.data.technologies.length > 0) {
        bodyHTML += "<h3>Technologies</h3>";
        bodyHTML += '<div class="tag-list">';
        node.data.technologies.forEach((tech) => {
          bodyHTML += `<span class="tag">${tech}</span>`;
        });
        bodyHTML += "</div>";
      }

      // Show keywords if available
      if (node.data.keywords && node.data.keywords.length > 0) {
        bodyHTML += "<h3>Keywords</h3>";
        bodyHTML += '<div class="tag-list">';
        node.data.keywords.forEach((keyword) => {
          bodyHTML += `<span class="tag">${keyword}</span>`;
        });
        bodyHTML += "</div>";
      }

      bodyHTML += "</div>"; // End detail-section
    }
  }

  // Connections section
  bodyHTML += '<div class="detail-section">';
  bodyHTML += "<h3>Connections</h3>";

  const incomingLinks = graphData.links.filter(
    (link) =>
      (typeof link.target === "object" && link.target.id === node.id) ||
      (typeof link.target === "string" && link.target === node.id)
  );

  const outgoingLinks = graphData.links.filter(
    (link) =>
      (typeof link.source === "object" && link.source.id === node.id) ||
      (typeof link.source === "string" && link.source === node.id)
  );

  // Incoming connections
  if (incomingLinks.length > 0) {
    bodyHTML += "<h3>Incoming</h3>";
    bodyHTML += "<ul>";

    incomingLinks.forEach((link) => {
      const sourceNode =
        typeof link.source === "object"
          ? link.source
          : graphData.nodes.find((n) => n.id === link.source);
      if (sourceNode) {
        bodyHTML += `<li>${
          sourceNode.title || sourceNode.id
        } <span class="link-type">${
          link.type || "connected to"
        }</span> this node</li>`;
      }
    });

    bodyHTML += "</ul>";
  }

  // Outgoing connections
  if (outgoingLinks.length > 0) {
    bodyHTML += "<h3>Outgoing</h3>";
    bodyHTML += "<ul>";

    outgoingLinks.forEach((link) => {
      const targetNode =
        typeof link.target === "object"
          ? link.target
          : graphData.nodes.find((n) => n.id === link.target);
      if (targetNode) {
        bodyHTML += `<li>This node <span class="link-type">${
          link.type || "connected to"
        }</span> ${targetNode.title || targetNode.id}</li>`;
      }
    });

    bodyHTML += "</ul>";
  }

  bodyHTML += "</div>"; // End connections section
  bodyHTML += "</div>"; // End node-details

  modalBody.innerHTML = bodyHTML;

  // Show the modal
  nodeDetailsModal.style.display = "flex";
}

// Close the modal
function closeModal() {
  nodeDetailsModal.style.display = "none";
}

// Search for nodes
function searchNodes() {
  const searchInput = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();

  if (!searchInput || !graphData) {
    showNotification("Please enter a search term", "warning");
    return;
  }

  // Find matching nodes
  const matchingNodes = graphData.nodes.filter(
    (node) =>
      (node.title && node.title.toLowerCase().includes(searchInput)) ||
      (node.id && node.id.toLowerCase().includes(searchInput))
  );

  if (matchingNodes.length === 0) {
    showNotification(`No nodes found matching "${searchInput}"`, "warning");
    return;
  }

  // Focus on the first match
  const firstMatch = matchingNodes[0];

  // Center view on the node
  graph.centerAt(firstMatch.x, firstMatch.y, 300);

  setTimeout(() => {
    graph.zoom(2, 300);
  }, 300);

  // Highlight the node temporarily
  const originalColor = getNodeColor(firstMatch);
  const originalSize = graph.nodeVal()(firstMatch);

  graph.nodeColor((node) =>
    node === firstMatch ? "#f06292" : getNodeColor(node)
  );

  // Reset highlighting after a delay
  setTimeout(() => {
    graph.nodeColor((node) => getNodeColor(node));
  }, 2000);

  showNotification(`Found ${matchingNodes.length} matching nodes`);
}

// Toggle fullscreen
function toggleFullscreen() {
  const graphCanvas = document.querySelector(".graph-canvas");

  if (document.fullscreenElement || document.webkitFullscreenElement) {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }

    document.getElementById("fullscreenBtn").innerHTML =
      '<i class="fas fa-expand"></i> Fullscreen';
    graphCanvas.classList.remove("fullscreen");
  } else {
    // Enter fullscreen
    if (graphCanvas.requestFullscreen) {
      graphCanvas.requestFullscreen();
    } else if (graphCanvas.webkitRequestFullscreen) {
      graphCanvas.webkitRequestFullscreen();
    }

    document.getElementById("fullscreenBtn").innerHTML =
      '<i class="fas fa-compress"></i> Exit Fullscreen';
    graphCanvas.classList.add("fullscreen");
  }

  // Resize graph after transition
  setTimeout(() => {
    if (graph) {
      graph
        .width(graphDiv.parentElement.clientWidth)
        .height(graphDiv.parentElement.clientHeight);
    }
  }, 100);
}

// Clear all data
function clearData() {
  // Clear input
  document.getElementById("jsonInput").value = "";

  // Reset graph
  graphData = null;
  originalGraphData = null;
  graph.graphData({ nodes: [], links: [] });

  // Reset stats
  updateStats({ nodes: [], links: [] });

  showNotification("Data cleared");
}

// Load sample data
function loadSampleData() {
  const sampleData = {
    graph_data: {
      nodes: [
        {
          id: "trend-1",
          title: "Artificial Intelligence in Healthcare",
          type: "trend",
          domain: "Healthcare",
          similarity_score: 0.95,
          data: {
            publication_date: "2023-04-15",
            knowledge_type: "Research Paper",
            technologies: [
              "Machine Learning",
              "Neural Networks",
              "Computer Vision",
            ],
            keywords: ["AI", "Healthcare", "Diagnostics", "Medical Imaging"],
          },
        },
        {
          id: "trend-2",
          title: "Quantum Computing Applications",
          type: "trend",
          domain: "Technology",
          similarity_score: 0.88,
          data: {
            publication_date: "2023-05-22",
            knowledge_type: "Research Paper",
            technologies: ["Quantum Algorithms", "Quantum Cryptography"],
            keywords: ["Quantum", "Computing", "Optimization", "Cryptography"],
          },
        },
        {
          id: "trend-3",
          title: "Sustainable Energy Storage",
          type: "trend",
          domain: "Energy",
          similarity_score: 0.82,
          data: {
            publication_date: "2023-03-10",
            knowledge_type: "Industry Report",
            technologies: [
              "Battery Technology",
              "Grid Storage",
              "Flow Batteries",
            ],
            keywords: [
              "Renewable Energy",
              "Storage",
              "Batteries",
              "Sustainability",
            ],
          },
        },
        {
          id: "tech-machine-learning",
          title: "Machine Learning",
          type: "technology",
          domain: "Technology",
        },
        {
          id: "tech-neural-networks",
          title: "Neural Networks",
          type: "technology",
          domain: "Technology",
        },
        {
          id: "tech-computer-vision",
          title: "Computer Vision",
          type: "technology",
          domain: "Technology",
        },
        {
          id: "tech-quantum-algorithms",
          title: "Quantum Algorithms",
          type: "technology",
          domain: "Technology",
        },
        {
          id: "tech-quantum-cryptography",
          title: "Quantum Cryptography",
          type: "technology",
          domain: "Technology",
        },
        {
          id: "tech-battery-technology",
          title: "Battery Technology",
          type: "technology",
          domain: "Energy",
        },
        {
          id: "tech-grid-storage",
          title: "Grid Storage",
          type: "technology",
          domain: "Energy",
        },
        {
          id: "keyword-ai",
          title: "AI",
          type: "keyword",
          domain: "Technology",
        },
        {
          id: "keyword-healthcare",
          title: "Healthcare",
          type: "keyword",
          domain: "Healthcare",
        },
        {
          id: "keyword-diagnostics",
          title: "Diagnostics",
          type: "keyword",
          domain: "Healthcare",
        },
        {
          id: "keyword-quantum",
          title: "Quantum",
          type: "keyword",
          domain: "Technology",
        },
        {
          id: "keyword-computing",
          title: "Computing",
          type: "keyword",
          domain: "Technology",
        },
        {
          id: "keyword-renewable-energy",
          title: "Renewable Energy",
          type: "keyword",
          domain: "Energy",
        },
        {
          id: "keyword-sustainability",
          title: "Sustainability",
          type: "keyword",
          domain: "Energy",
        },
      ],
      links: [
        {
          source: "trend-1",
          target: "tech-machine-learning",
          type: "uses_technology",
          weight: 2,
        },
        {
          source: "trend-1",
          target: "tech-neural-networks",
          type: "uses_technology",
          weight: 2,
        },
        {
          source: "trend-1",
          target: "tech-computer-vision",
          type: "uses_technology",
          weight: 1.5,
        },
        {
          source: "trend-2",
          target: "tech-quantum-algorithms",
          type: "uses_technology",
          weight: 2,
        },
        {
          source: "trend-2",
          target: "tech-quantum-cryptography",
          type: "uses_technology",
          weight: 1.5,
        },
        {
          source: "trend-3",
          target: "tech-battery-technology",
          type: "uses_technology",
          weight: 2,
        },
        {
          source: "trend-3",
          target: "tech-grid-storage",
          type: "uses_technology",
          weight: 1.8,
        },
        {
          source: "trend-1",
          target: "keyword-ai",
          type: "has_keyword",
          weight: 1,
        },
        {
          source: "trend-1",
          target: "keyword-healthcare",
          type: "has_keyword",
          weight: 1,
        },
        {
          source: "trend-1",
          target: "keyword-diagnostics",
          type: "has_keyword",
          weight: 0.8,
        },
        {
          source: "trend-2",
          target: "keyword-quantum",
          type: "has_keyword",
          weight: 1,
        },
        {
          source: "trend-2",
          target: "keyword-computing",
          type: "has_keyword",
          weight: 1,
        },
        {
          source: "trend-3",
          target: "keyword-renewable-energy",
          type: "has_keyword",
          weight: 1,
        },
        {
          source: "trend-3",
          target: "keyword-sustainability",
          type: "has_keyword",
          weight: 1,
        },
        {
          source: "trend-1",
          target: "trend-2",
          type: "related",
          weight: 0.7,
        },
        {
          source: "tech-machine-learning",
          target: "keyword-ai",
          type: "related",
          weight: 0.9,
        },
        {
          source: "tech-quantum-algorithms",
          target: "keyword-quantum",
          type: "related",
          weight: 0.9,
        },
      ],
    },
  };

  // Set the sample data in the textarea
  document.getElementById("jsonInput").value = JSON.stringify(
    sampleData,
    null,
    2
  );

  // Load the data
  processGraphData(sampleData);

  showNotification("Sample data loaded");
}

// Update statistics
function updateStats(data) {
  document.getElementById("totalNodes").textContent = data.nodes.length;
  document.getElementById("totalLinks").textContent = data.links.length;

  // Count node types
  const counts = {
    trend: 0,
    technology: 0,
    keyword: 0,
  };

  data.nodes.forEach((node) => {
    if (node.type && counts[node.type] !== undefined) {
      counts[node.type]++;
    }
  });

  document.getElementById("trendCount").textContent = counts.trend;
  document.getElementById("techCount").textContent = counts.technology;
  document.getElementById("keywordCount").textContent = counts.keyword;
}

// Show notification toast
function showNotification(message, type = "info") {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  // Set background color based on type
  switch (type) {
    case "error":
      notification.style.backgroundColor = "#e74c3c";
      break;
    case "warning":
      notification.style.backgroundColor = "#f39c12";
      break;
    case "success":
      notification.style.backgroundColor = "#2ecc71";
      break;
    default:
      notification.style.backgroundColor = "#4a6de5";
  }

  // Auto-hide after 3 seconds
  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

// Export as PNG
function exportAsPNG() {
  if (!graph) {
    showNotification("No graph to export", "warning");
    return;
  }

  try {
    // Get canvas and create an image
    const canvas = document.querySelector(".graph-canvas canvas");
    if (!canvas) throw new Error("Canvas not found");

    const link = document.createElement("a");
    link.download = "network-graph.png";
    link.href = canvas.toDataURL("image/png");
    link.click();

    showNotification("Graph exported as PNG");
  } catch (error) {
    showNotification(`Error exporting PNG: ${error.message}`, "error");
    console.error("Error exporting PNG:", error);
  }
}

// Export as SVG
function exportAsSVG() {
  if (!graph) {
    showNotification("No graph to export", "warning");
    return;
  }

  try {
    // Force Graph doesn't provide direct SVG export
    // This is a simplified version that will capture the current view
    const svgBlob = new Blob(
      [
        `
            <svg xmlns="http://www.w3.org/2000/svg" width="${graph.width()}" height="${graph.height()}" viewBox="0 0 ${graph.width()} ${graph.height()}">
                <rect width="100%" height="100%" fill="${
                  themes[currentTheme].background
                }"/>
                <g id="graphSvg">
                    ${generateSVGContent()}
                </g>
            </svg>
        `,
      ],
      { type: "image/svg+xml" }
    );

    const link = document.createElement("a");
    link.download = "network-graph.svg";
    link.href = URL.createObjectURL(svgBlob);
    link.click();

    showNotification("Graph exported as SVG");
  } catch (error) {
    showNotification(`Error exporting SVG: ${error.message}`, "error");
    console.error("Error exporting SVG:", error);
  }
}

// Generate SVG content for export
function generateSVGContent() {
  if (!graphData) return "";

  let svgContent = "";

  // Add links
  graphData.links.forEach((link) => {
    const source =
      typeof link.source === "object"
        ? link.source
        : graphData.nodes.find((n) => n.id === link.source);
    const target =
      typeof link.target === "object"
        ? link.target
        : graphData.nodes.find((n) => n.id === link.target);

    if (!source || !target || !source.x || !target.x) return;

    svgContent += `<line x1="${source.x}" y1="${source.y}" x2="${
      target.x
    }" y2="${target.y}" 
            stroke="${themes[currentTheme].link}" stroke-width="${
      link.weight || 1
    }" 
            opacity="${document.getElementById("linkOpacity").value}"/>`;
  });

  // Add nodes
  graphData.nodes.forEach((node) => {
    if (!node.x || !node.y) return;

    const color = getNodeColor(node);
    const size = calculateNodeSize(node);

    svgContent += `<circle cx="${node.x}" cy="${node.y}" r="${size}" fill="${color}"/>`;
    // Global variables
    let graph = null;
    let graphData = null;
    let originalGraphData = null;
    let selectedNode = null;
    let selectedNodeId = null;
    let nodeTooltip = null;
    let isPaused = false;

    // DOM Elements
    const graphDiv = document.getElementById("graphDiv");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const nodeDetailsModal = document.getElementById("nodeDetailsModal");
    const notification = document.getElementById("notification");

    // Theme and color settings
    const themes = {
      light: {
        background: "#ffffff",
        node: {
          trend: "#4a6de5",
          technology: "#28a745",
          keyword: "#fd7e14",
          default: "#6c757d",
        },
        link: "#cccccc",
        text: "#333333",
        ui: "#f8f9fa",
      },
      dark: {
        background: "#2c3e50",
        node: {
          trend: "#5d7feb",
          technology: "#38c758",
          keyword: "#fd9c45",
          default: "#adb5bd",
        },
        link: "#6c757d",
        text: "#f8f9fa",
        ui: "#293846",
      },
      blue: {
        background: "#e9f5ff",
        node: {
          trend: "#3d62d8",
          technology: "#249a3e",
          keyword: "#ef7411",
          default: "#5a6268",
        },
        link: "#a9d0f5",
        text: "#2c3e50",
        ui: "#d1e7fa",
      },
    };

    let currentTheme = "light";

    // Initialize the application
    document.addEventListener("DOMContentLoaded", () => {
      initGraph();
      setupEventListeners();
      setupCollapsibles();
    });

    // Initialize the force graph
    function initGraph() {
      graph = ForceGraph()(graphDiv)
        .backgroundColor(themes[currentTheme].background)
        .nodeColor((node) => getNodeColor(node))
        .nodeLabel((node) => node.title || node.id)
        .linkDirectionalArrowLength(6)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalParticles(3)
        .linkDirectionalParticleSpeed(0.005)
        .linkWidth((link) => link.weight || 1)
        .onNodeHover(handleNodeHover)
        .onNodeClick(handleNodeClick)
        .onLinkHover(handleLinkHover)
        .onLinkClick(handleLinkClick)
        .width(graphDiv.parentElement.clientWidth)
        .height(graphDiv.parentElement.clientHeight);

      // Create tooltip element
      nodeTooltip = document.createElement("div");
      nodeTooltip.className = "node-tooltip";
      nodeTooltip.style.opacity = 0;
      document.body.appendChild(nodeTooltip);

      // Set placeholder data
      graph.graphData({ nodes: [], links: [] });

      // Handle window resize
      window.addEventListener("resize", () => {
        if (graph) {
          graph
            .width(graphDiv.parentElement.clientWidth)
            .height(graphDiv.parentElement.clientHeight);
        }
      });
    }

    // Set up all event listeners
    function setupEventListeners() {
      // Load data button
      document
        .getElementById("loadJsonBtn")
        .addEventListener("click", loadDataFromInput);

      // Clear button
      document.getElementById("clearBtn").addEventListener("click", clearData);

      // Load sample button
      document
        .getElementById("loadSampleBtn")
        .addEventListener("click", loadSampleData);

      // Fullscreen button
      document
        .getElementById("fullscreenBtn")
        .addEventListener("click", toggleFullscreen);

      // Zoom to fit button
      document.getElementById("zoomToFitBtn").addEventListener("click", () => {
        graph.zoomToFit(800, 20);
        showNotification("Zoomed to fit all nodes");
      });

      // Focus mode button
      document
        .getElementById("focusModeBtn")
        .addEventListener("click", toggleFocusMode);

      // Highlight mode button
      document
        .getElementById("highlightModeBtn")
        .addEventListener("click", toggleHighlightMode);

      // Search button and input
      document
        .getElementById("searchBtn")
        .addEventListener("click", searchNodes);
      document
        .getElementById("searchInput")
        .addEventListener("keypress", (e) => {
          if (e.key === "Enter") searchNodes();
        });

      // Modal close buttons
      document
        .querySelector(".close-button")
        .addEventListener("click", closeModal);
      document
        .getElementById("closeModalBtn")
        .addEventListener("click", closeModal);

      // Focus on node button in modal
      document.getElementById("focusNodeBtn").addEventListener("click", () => {
        if (selectedNodeId) {
          focusOnNode(selectedNodeId);
          closeModal();
        }
      });

      // Node size control
      document.getElementById("nodeSize").addEventListener("input", (e) => {
        updateNodeSize(parseFloat(e.target.value));
      });

      // Node size by property
      document.getElementById("nodeSizeBy").addEventListener("change", (e) => {
        updateNodeSizing(e.target.value);
      });

      // Node type filters
      document
        .getElementById("showTrends")
        .addEventListener("change", updateFilters);
      document
        .getElementById("showTech")
        .addEventListener("change", updateFilters);
      document
        .getElementById("showKeywords")
        .addEventListener("change", updateFilters);

      // Label size control
      document.getElementById("labelSize").addEventListener("input", (e) => {
        updateLabelSize(parseFloat(e.target.value));
      });

      // Node cutoff control
      document.getElementById("nodeCutoff").addEventListener("input", (e) => {
        updateNodeCutoff(parseFloat(e.target.value));
      });

      // Max nodes control
      document.getElementById("maxNodes").addEventListener("change", (e) => {
        updateMaxNodes(parseInt(e.target.value));
      });

      // Link width control
      document.getElementById("linkWidth").addEventListener("input", (e) => {
        updateLinkWidth(parseFloat(e.target.value));
      });

      // Link opacity control
      document.getElementById("linkOpacity").addEventListener("input", (e) => {
        updateLinkOpacity(parseFloat(e.target.value));
      });

      // Link distance control
      document.getElementById("linkDistance").addEventListener("input", (e) => {
        updateLinkDistance(parseInt(e.target.value));
      });

      // Link label toggle
      document
        .getElementById("showLinkLabels")
        .addEventListener("change", (e) => {
          updateLinkLabels(e.target.checked);
        });

      // Link direction toggle
      document
        .getElementById("showLinkDirections")
        .addEventListener("change", (e) => {
          updateLinkDirections(e.target.checked);
        });

      // Link particles toggle
      document
        .getElementById("showParticles")
        .addEventListener("change", (e) => {
          updateLinkParticles(e.target.checked);
        });

      // Theme selection
      document.querySelectorAll(".theme-option").forEach((option) => {
        option.addEventListener("click", () => {
          const theme = option.getAttribute("data-theme");
          updateTheme(theme);

          // Update active state
          document.querySelectorAll(".theme-option").forEach((o) => {
            o.classList.remove("active");
          });
          option.classList.add("active");
        });
      });

      // Layout options
      document.querySelectorAll(".layout-option").forEach((option) => {
        option.addEventListener("click", () => {
          const layout = option.getAttribute("data-layout");
          updateLayout(layout);

          // Update active state
          document.querySelectorAll(".layout-option").forEach((o) => {
            o.classList.remove("active");
          });
          option.classList.add("active");
        });
      });

      // Charge strength control
      document
        .getElementById("chargeStrength")
        .addEventListener("input", (e) => {
          updateChargeStrength(parseInt(e.target.value));
        });

      // Collision radius control
      document
        .getElementById("collisionRadius")
        .addEventListener("input", (e) => {
          updateCollisionRadius(parseInt(e.target.value));
        });

      // Enable zoom toggle
      document.getElementById("enableZoom").addEventListener("change", (e) => {
        graph.enableZoom(e.target.checked);
        showNotification(`Zoom ${e.target.checked ? "enabled" : "disabled"}`);
      });

      // Enable drag toggle
      document.getElementById("enableDrag").addEventListener("change", (e) => {
        graph.enableNodeDrag(e.target.checked);
        showNotification(
          `Node dragging ${e.target.checked ? "enabled" : "disabled"}`
        );
      });

      // Legend toggle
      document.getElementById("showLegend").addEventListener("change", (e) => {
        updateLegend(e.target.checked);
      });

      // Tooltips toggle
      document
        .getElementById("showTooltips")
        .addEventListener("change", (e) => {
          const showTooltips = e.target.checked;
          if (!showTooltips && nodeTooltip) {
            nodeTooltip.style.opacity = 0;
          }
        });

      // Node labels toggle
      document
        .getElementById("showNodeLabels")
        .addEventListener("change", (e) => {
          updateNodeLabels(e.target.checked);
        });

      // Animation controls
      document.getElementById("pauseBtn").addEventListener("click", () => {
        pauseSimulation();
        document.getElementById("pauseBtn").style.display = "none";
        document.getElementById("resumeBtn").style.display = "block";
      });

      document.getElementById("resumeBtn").addEventListener("click", () => {
        resumeSimulation();
        document.getElementById("resumeBtn").style.display = "none";
        document.getElementById("pauseBtn").style.display = "block";
      });

      document.getElementById("resetBtn").addEventListener("click", () => {
        resetSimulation();
      });

      // Export options
      document
        .getElementById("downloadPNG")
        .addEventListener("click", exportAsPNG);
      document
        .getElementById("downloadSVG")
        .addEventListener("click", exportAsSVG);
      document
        .getElementById("downloadJSON")
        .addEventListener("click", exportAsJSON);
    }

    // Set up collapsible panels
    function setupCollapsibles() {
      document.querySelectorAll(".collapsible-header").forEach((header) => {
        header.addEventListener("click", () => {
          const content = header.nextElementSibling;
          const parent = header.parentElement;

          parent.classList.toggle("active");

          if (parent.classList.contains("active")) {
            content.style.maxHeight = `${content.scrollHeight}px`;
          } else {
            content.style.maxHeight = "0px";
          }
        });
      });
    }

    // Load data from JSON input
    function loadDataFromInput() {
      const jsonInput = document.getElementById("jsonInput").value.trim();

      if (!jsonInput) {
        showNotification("Please enter JSON data", "error");
        return;
      }

      try {
        // Show loading overlay
        loadingOverlay.style.display = "flex";

        // Parse JSON
        const data = JSON.parse(jsonInput);

        // Load data
        processGraphData(data);

        // Hide loading overlay
        loadingOverlay.style.display = "none";

        showNotification("Data loaded successfully!");
      } catch (error) {
        loadingOverlay.style.display = "none";
        showNotification(`Error loading data: ${error.message}`, "error");
        console.error("Error loading data:", error);
      }
    }

    // Process the graph data
    function processGraphData(data) {
      // Validate data structure
      if (
        !data.graph_data ||
        !data.graph_data.nodes ||
        !data.graph_data.links
      ) {
        if (data.nodes && data.links) {
          // Direct graph format
          graphData = data;
        } else {
          throw new Error(
            "Invalid data format. Expected graph_data with nodes and links."
          );
        }
      } else {
        graphData = data.graph_data;
      }

      // Store original data
      originalGraphData = JSON.parse(JSON.stringify(graphData));

      // Apply filters and update the graph
      applyFiltersAndUpdateGraph();

      // Update stats
      updateStats(graphData);
    }

    // Apply current filters and update the graph
    function applyFiltersAndUpdateGraph() {
      if (!originalGraphData) return;

      // Get filter values
      const cutoff = parseFloat(document.getElementById("nodeCutoff").value);
      const maxNodes = parseInt(document.getElementById("maxNodes").value);
      const showTrends = document.getElementById("showTrends").checked;
      const showTech = document.getElementById("showTech").checked;
      const showKeywords = document.getElementById("showKeywords").checked;

      // Filter nodes
      let filteredNodes = [...originalGraphData.nodes];

      // Filter by node type
      filteredNodes = filteredNodes.filter((node) => {
        if (node.type === "trend" && !showTrends) return false;
        if (node.type === "technology" && !showTech) return false;
        if (node.type === "keyword" && !showKeywords) return false;
        return true;
      });

      // Filter trends by similarity score
      filteredNodes = filteredNodes.filter((node) => {
        if (node.type === "trend" && node.similarity_score < cutoff)
          return false;
        return true;
      });

      // Sort by similarity score (for trends) and limit
      filteredNodes.sort((a, b) => {
        // Trends come first, sorted by similarity score
        if (a.type === "trend" && b.type === "trend") {
          return (b.similarity_score || 0) - (a.similarity_score || 0);
        }
        // Then technologies
        if (a.type === "technology" && b.type !== "trend") return -1;
        if (b.type === "technology" && a.type !== "trend") return 1;
        // Then keywords
        if (
          a.type === "keyword" &&
          b.type !== "trend" &&
          b.type !== "technology"
        )
          return -1;
        if (
          b.type === "keyword" &&
          a.type !== "trend" &&
          a.type !== "technology"
        )
          return 1;

        return 0;
      });

      // Limit to max nodes
      filteredNodes = filteredNodes.slice(0, maxNodes);

      // Create a set of node IDs for quick lookup
      const nodeIds = new Set(filteredNodes.map((node) => node.id));

      // Filter links to only include those between filtered nodes
      let filteredLinks = originalGraphData.links.filter(
        (link) =>
          (nodeIds.has(link.source) && nodeIds.has(link.target)) ||
          (nodeIds.has(link.source.id) && nodeIds.has(link.target.id))
      );

      // Update the graph data
      graphData = {
        nodes: filteredNodes,
        links: filteredLinks,
      };

      // Update the graph visualization
      updateGraphVisualization();

      // Update stats
      updateStats(graphData);
    }

    // Update the graph visualization
    function updateGraphVisualization() {
      // Apply current settings
      const nodeSizeValue = parseFloat(
        document.getElementById("nodeSize").value
      );
      const nodeSizeBy = document.getElementById("nodeSizeBy").value;
      const labelSize = parseFloat(document.getElementById("labelSize").value);
      const linkWidth = parseFloat(document.getElementById("linkWidth").value);
      const linkOpacity = parseFloat(
        document.getElementById("linkOpacity").value
      );
      const linkDistance = parseInt(
        document.getElementById("linkDistance").value
      );
      const showLinkLabels = document.getElementById("showLinkLabels").checked;
      const showLinkDirections =
        document.getElementById("showLinkDirections").checked;
      const showLinkParticles =
        document.getElementById("showParticles").checked;
      const showNodeLabels = document.getElementById("showNodeLabels").checked;

      // Update graph settings
      graph
        .linkWidth((link) => linkWidth * (link.weight || 1))
        .linkDirectionalArrowLength(showLinkDirections ? 6 : 0)
        .linkDirectionalParticles(showLinkParticles ? 3 : 0)
        .linkOpacity(linkOpacity)
        .d3Force(
          "link",
          d3
            .forceLink()
            .id((d) => d.id)
            .distance(linkDistance)
        )
        .nodeLabel(showNodeLabels ? (node) => node.title || node.id : null)
        .nodeVal((node) => {
          if (nodeSizeBy === "fixed") {
            return nodeSizeValue * 50;
          } else if (nodeSizeBy === "degree") {
            // Count links connected to this node
            const count = graphData.links.filter(
              (link) =>
                link.source === node.id ||
                link.target === node.id ||
                link.source.id === node.id ||
                link.target.id === node.id
            ).length;
            return (count + 1) * nodeSizeValue * 10;
          } else if (nodeSizeBy === "similarity") {
            if (node.type === "trend" && node.similarity_score != null) {
              return (node.similarity_score + 0.2) * nodeSizeValue * 100;
            } else {
              return nodeSizeValue * 30;
            }
          }
          return nodeSizeValue * 50;
        })
        .graphData(graphData);

      // Apply the current layout
      const layout = document
        .querySelector(".layout-option.active")
        .getAttribute("data-layout");
      if (layout !== "force") {
        applyCustomLayout(layout);
      }

      // Update charge strength
      const chargeStrength = parseInt(
        document.getElementById("chargeStrength").value
      );
      graph.d3Force("charge").strength(chargeStrength);

      // Update collision radius
      const collisionRadius = parseInt(
        document.getElementById("collisionRadius").value
      );
      graph.d3Force("collision", d3.forceCollide(collisionRadius));

      // Update link labels
      if (showLinkLabels) {
        graph.linkLabel((link) => link.type || "");
      } else {
        graph.linkLabel(null);
      }
    }

    // Update node size
    function updateNodeSize(size) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update node sizing strategy
    function updateNodeSizing(strategy) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update filters (node types, etc.)
    function updateFilters() {
      if (!originalGraphData) return;
      applyFiltersAndUpdateGraph();
    }

    // Update label size
    function updateLabelSize(size) {
      if (!graph) return;

      // Force Graph doesn't have a direct way to control label size
      // This is a simplified implementation
      updateGraphVisualization();
    }

    // Update node cutoff
    function updateNodeCutoff(cutoff) {
      if (!originalGraphData) return;
      applyFiltersAndUpdateGraph();
    }

    // Update max nodes
    function updateMaxNodes(maxNodes) {
      if (!originalGraphData) return;
      applyFiltersAndUpdateGraph();
    }

    // Update link width
    function updateLinkWidth(width) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update link opacity
    function updateLinkOpacity(opacity) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update link distance
    function updateLinkDistance(distance) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update link labels
    function updateLinkLabels(show) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update link directions
    function updateLinkDirections(show) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update link particles
    function updateLinkParticles(show) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update charge strength
    function updateChargeStrength(strength) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update collision radius
    function updateCollisionRadius(radius) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update theme
    function updateTheme(theme) {
      currentTheme = theme;

      // Update graph background
      graph.backgroundColor(themes[theme].background);

      // Update node colors
      graph.nodeColor((node) => getNodeColor(node));

      // Update link colors
      graph.linkColor(themes[theme].link);

      // Show notification
      showNotification(`Theme changed to ${theme}`);
    }

    // Update layout
    function updateLayout(layout) {
      if (!graph) return;

      if (layout === "force") {
        // Reset to default force layout
        resetSimulation();
      } else {
        // Apply custom layout
        applyCustomLayout(layout);
      }

      showNotification(`Layout changed to ${layout}`);
    }

    // Apply custom layout
    function applyCustomLayout(layout) {
      if (!graphData) return;

      pauseSimulation();

      const nodes = graphData.nodes;

      if (layout === "circular") {
        // Arrange nodes in a circle
        const radius = Math.min(graph.width(), graph.height()) * 0.4;
        const angleStep = (2 * Math.PI) / nodes.length;

        nodes.forEach((node, i) => {
          const angle = i * angleStep;
          node.x = graph.width() / 2 + radius * Math.cos(angle);
          node.y = graph.height() / 2 + radius * Math.sin(angle);
          node.fx = node.x;
          node.fy = node.y;
        });
      } else if (layout === "radial") {
        // Group nodes by type in concentric circles
        const centerX = graph.width() / 2;
        const centerY = graph.height() / 2;

        const nodesByType = {
          trend: nodes.filter((node) => node.type === "trend"),
          technology: nodes.filter((node) => node.type === "technology"),
          keyword: nodes.filter((node) => node.type === "keyword"),
          other: nodes.filter(
            (node) =>
              !node.type ||
              !["trend", "technology", "keyword"].includes(node.type)
          ),
        };

        const radius = {
          trend: Math.min(graph.width(), graph.height()) * 0.2,
          technology: Math.min(graph.width(), graph.height()) * 0.35,
          keyword: Math.min(graph.width(), graph.height()) * 0.45,
          other: Math.min(graph.width(), graph.height()) * 0.45,
        };

        // Position nodes in concentric circles based on type
        Object.entries(nodesByType).forEach(([type, typeNodes]) => {
          const angleStep = (2 * Math.PI) / typeNodes.length;

          typeNodes.forEach((node, i) => {
            const angle = i * angleStep;
            node.x = centerX + radius[type] * Math.cos(angle);
            node.y = centerY + radius[type] * Math.sin(angle);
            node.fx = node.x;
            node.fy = node.y;
          });
        });
      }

      // Update graph with the new node positions
      graph.graphData(graphData);
    }

    // Update node labels
    function updateNodeLabels(show) {
      if (!graph) return;
      updateGraphVisualization();
    }

    // Update legend
    function updateLegend(show) {
      if (!graph) return;

      // For now, we just show a notification
      // In a real implementation, we would add or remove a legend overlay
      showNotification(`Legend ${show ? "enabled" : "disabled"}`);
    }

    // Pause the simulation
    function pauseSimulation() {
      if (!graph) return;

      graph.pauseAnimation();
      isPaused = true;
      showNotification("Simulation paused");
    }
    // Reset the simulation
    function resetSimulation() {
      if (!graph || !graphData) return;

      // Clear fixed positions
      graphData.nodes.forEach((node) => {
        delete node.fx;
        delete node.fy;
      });

      // Update graph
      graph.graphData(graphData);

      // Resume if paused
      if (isPaused) {
        resumeSimulation();
        document.getElementById("resumeBtn").style.display = "none";
        document.getElementById("pauseBtn").style.display = "block";
      }

      // Re-warm the simulation
      graph.d3ReheatSimulation();

      showNotification("Simulation reset");
    }
  });
}
