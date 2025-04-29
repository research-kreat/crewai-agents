// ==================================================
// ORCHESTRATOR AGENT FUNCTIONALITY
// ==================================================

/**
 * Load Scout results from localStorage
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

    // Update select dropdown
    updateScoutSelect();
  } catch (e) {
    logToConsole(`Error loading from localStorage: ${e.message}`, "error");
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
    return (
      new Date(b.date) - new Date(a.date) ||
      b.timestamp.localeCompare(a.timestamp)
    );
  });

  // Add options
  sortedResults.forEach((result) => {
    const option = document.createElement("option");
    option.value = result.id;
    // Truncate prompt if too long
    const promptDisplay =
      result.prompt.length > 40
        ? result.prompt.substring(0, 40) + "..."
        : result.prompt;
    option.textContent = `${result.date} - ${promptDisplay}`;
    selectElement.appendChild(option);
  });

  logToConsole("Scout select dropdown updated", "system");
}

/**
 * Load selected Scout result
 */
function loadScoutResult() {
  const selectElement = document.getElementById("scout-select");
  const trendQueryInput = document.getElementById("trend-query");

  if (!selectElement || !trendQueryInput) return;

  const selectedId = selectElement.value;

  if (!selectedId) {
    return;
  }

  const result = scoutResults.find((r) => r.id === selectedId);

  if (result) {
    // Set the trend query input to the prompt from the selected result
    trendQueryInput.value = result.prompt;
    logToConsole(
      `Loaded Scout result prompt: ${result.prompt.substring(0, 30)}...`,
      "info"
    );
  }
}

/**
 * Update workflow options based on selected type
 */
function updateWorkflowOptions() {
  const workflowType = document.getElementById("workflow-type").value;
  const workflowConfigTextarea = document.getElementById("workflow-config");
  const workflowOptionsContainer = document.getElementById("workflow-options");

  if (!workflowType) {
    workflowOptionsContainer.classList.add("hidden");
    return;
  }

  // Show config container
  workflowOptionsContainer.classList.remove("hidden");

  // Create default configuration based on workflow type
  let config = {};

  switch (workflowType) {
    case "trend-context":
      config = {
        name: "Trend Context Analysis Workflow",
        description: "Analyze technology trends in your business context",
        steps: [
          {
            name: "Scout Agent",
            description: "Retrieve relevant trends and technology data",
            agent: "scout",
            required: true,
          },
          {
            name: "Context Agent",
            description: "Analyze trends in business context",
            agent: "context",
            required: true,
          },
          {
            name: "Visualization Agent",
            description: "Generate data visualizations and insights",
            agent: "visualization",
            required: false,
          },
          {
            name: "Orchestrator",
            description: "Generate final integrated report",
            agent: "orchestrator",
            required: true,
          },
        ],
        output_format: "report",
      };
      break;

    case "competitive-landscape":
      config = {
        name: "Competitive Landscape Analysis",
        description: "Analyze trends in relation to competitors",
        steps: [
          {
            name: "Scout Agent",
            description: "Retrieve relevant trends and technology data",
            agent: "scout",
            required: true,
          },
          {
            name: "Context Agent",
            description: "Analyze competitive positioning",
            agent: "context",
            required: true,
            focus: "competitive",
          },
          {
            name: "Visualization Agent",
            description: "Generate competitive positioning visualizations",
            agent: "visualization",
            visualization_type: "network",
            required: true,
          },
          {
            name: "Orchestrator",
            description: "Generate final competitive analysis report",
            agent: "orchestrator",
            required: true,
          },
        ],
        output_format: "competitive_report",
      };
      break;

    case "technology-roadmap":
      config = {
        name: "Technology Roadmap Workflow",
        description: "Create a technology adoption roadmap",
        steps: [
          {
            name: "Scout Agent",
            description: "Retrieve technology trend data",
            agent: "scout",
            required: true,
          },
          {
            name: "Context Agent",
            description: "Analyze technology fit and implementation",
            agent: "context",
            required: true,
            focus: "implementation",
          },
          {
            name: "Visualization Agent",
            description: "Generate timeline visualization",
            agent: "visualization",
            visualization_type: "timeline",
            required: true,
          },
          {
            name: "Orchestrator",
            description: "Generate technology roadmap",
            agent: "orchestrator",
            required: true,
          },
        ],
        output_format: "roadmap",
      };
      break;

    case "custom":
      config = {
        name: "Custom Workflow",
        description: "Create your custom workflow",
        steps: [
          {
            name: "Scout Agent",
            description: "Retrieve relevant data",
            agent: "scout",
            required: true,
          },
          {
            name: "Orchestrator",
            description: "Generate final report",
            agent: "orchestrator",
            required: true,
          },
        ],
        output_format: "custom",
      };
      break;
  }

  // Update config textarea
  workflowConfigTextarea.value = JSON.stringify(config, null, 2);

  // Store for later use
  workflowConfig = config;

  logToConsole(
    `Updated workflow configuration for type: ${workflowType}`,
    "info"
  );
}

/**
 * Run workflow
 */
function runWorkflow() {
  // Get input data
  const workflowType = document.getElementById("workflow-type").value;
  const companyProfile = document.getElementById("company-profile").value;
  const trendQuery = document.getElementById("trend-query").value;
  const scoutSelect = document.getElementById("scout-select").value;

  // Validate inputs
  if (!workflowType) {
    showToast("Please select a workflow type");
    logToConsole("No workflow type selected", "warning");
    return;
  }

  if (!companyProfile) {
    showToast("Please enter company profile data");
    logToConsole("Missing company profile data", "warning");
    return;
  }

  if (!trendQuery && !scoutSelect) {
    showToast("Please enter a trend query or select a Scout result");
    logToConsole("Missing trend query or Scout result", "warning");
    return;
  }

  // Update workflow configuration if custom
  if (workflowType === "custom") {
    try {
      const configTextarea = document.getElementById("workflow-config");
      workflowConfig = JSON.parse(configTextarea.value);
    } catch (e) {
      showToast("Invalid workflow configuration JSON");
      logToConsole("Invalid workflow configuration: " + e.message, "error");
      return;
    }
  }

  // Parse company profile
  let companyProfileObj;
  try {
    companyProfileObj = JSON.parse(companyProfile);
  } catch (e) {
    showToast("Invalid company profile JSON");
    logToConsole("Invalid company profile JSON: " + e.message, "error");
    return;
  }

  // Prepare request data
  const requestData = {
    workflow_type: workflowType,
    workflow_config: workflowConfig,
    company_profile: companyProfileObj,
    trend_query: trendQuery,
    scout_result_id: scoutSelect || null,
  };

  // Update UI for workflow start
  resetWorkflow();
  updateWorkflowStatus("running");

  // Disable run button
  handleButtonState("#run-workflow-button", true, "Running Workflow...");

  // Start workflow timer
  workflowStartTime = Date.now();
  startWorkflowTimer();

  // Start the workflow process
  logToConsole(`Starting workflow: ${workflowConfig.name}`, "info");

  // Step 1: Run Scout Agent
  runScoutStep(requestData)
    .then((scoutResult) => {
      workflowResults.scout = scoutResult;
      updateStepStatus("scout", "complete");
      updateTabContent("scout", scoutResult);

      // Step 2: Run Context Agent
      return runContextStep(scoutResult, companyProfileObj);
    })
    .then((contextResult) => {
      workflowResults.context = contextResult;
      updateStepStatus("context", "complete");
      updateTabContent("context", contextResult);

      // Step 3: Run Visualization Agent if required
      const vizStep = workflowConfig.steps.find(
        (step) => step.agent === "visualization"
      );
      if (vizStep && vizStep.required) {
        return runVisualizationStep(
          workflowResults.scout,
          workflowResults.context
        );
      } else {
        updateStepStatus("viz", "complete", "Skipped (optional)");
        return null;
      }
    })
    .then((vizResult) => {
      if (vizResult) {
        workflowResults.visualization = vizResult;
        updateStepStatus("viz", "complete");
        updateTabContent("visualization", vizResult);
      }

      // Step 4: Generate final report
      return runOrchestratorStep(workflowResults);
    })
    .then((reportResult) => {
      workflowResults.report = reportResult;
      updateStepStatus("orchestrator", "complete");
      updateTabContent("report", reportResult);

      // Complete workflow
      updateWorkflowStatus("complete");
      stopWorkflowTimer();

      // Enable download button
      document.getElementById("download-report-btn").disabled = false;
      document.getElementById("share-results-btn").disabled = false;

      // Update overview tab
      updateOverviewTab();

      // Re-enable run button
      handleButtonState("#run-workflow-button", false);

      logToConsole("Workflow completed successfully", "info");
    })
    .catch((error) => {
      updateWorkflowStatus("error");
      stopWorkflowTimer();

      logToConsole(`Workflow error: ${error.message}`, "error");

      // Re-enable run button
      handleButtonState("#run-workflow-button", false);
    });
}

/**
 * Run Scout Agent step
 */
async function runScoutStep(requestData) {
  updateStepStatus("scout", "running");
  logToConsole("Running Scout Agent step...", "info");

  try {
    // If a scout result ID is provided, retrieve it from storage
    if (requestData.scout_result_id) {
      const result = scoutResults.find(
        (r) => r.id === requestData.scout_result_id
      );
      if (result) {
        logToConsole("Using existing Scout result", "info");
        updateStepDetails(
          "scout",
          `Used existing Scout result for: ${result.prompt.substring(0, 50)}...`
        );
        return result.data;
      }
    }

    // Otherwise run a new query
    logToConsole(`Running new Scout query: ${requestData.trend_query}`, "info");
    updateStepDetails("scout", `Processing query: ${requestData.trend_query}`);

    const response = await fetch(`${apiUrl}/agent/scout/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: requestData.trend_query }),
    });

    if (!response.ok) {
      throw new Error(`Scout Agent error: ${response.status}`);
    }

    const scoutResult = await response.json();
    updateStepDetails(
      "scout",
      `Found ${scoutResult.relevant_trends?.length || 0} relevant trends`
    );

    return scoutResult;
  } catch (error) {
    updateStepStatus("scout", "error");
    updateStepDetails("scout", `Error: ${error.message}`);
    throw error;
  }
}

/**
 * Run Context Agent step
 */
async function runContextStep(scoutResult, companyProfile) {
  updateStepStatus("context", "running");
  logToConsole("Running Context Agent step...", "info");

  try {
    // Prepare request
    const contextRequest = {
      company_profile: companyProfile,
      competitor_data: null, // Could be added as an input option
      scout_result: scoutResult,
    };

    updateStepDetails("context", "Analyzing trends in business context");

    const response = await fetch(`${apiUrl}/agent/context/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contextRequest),
    });

    if (!response.ok) {
      throw new Error(`Context Agent error: ${response.status}`);
    }

    const contextResult = await response.json();

    // Get overall recommendation for details
    const recommendation =
      contextResult.overall_assessment?.pursuit_recommendation || "Unknown";
    updateStepDetails(
      "context",
      `Analysis complete. Recommendation: ${recommendation}`
    );

    return contextResult;
  } catch (error) {
    updateStepStatus("context", "error");
    updateStepDetails("context", `Error: ${error.message}`);
    throw error;
  }
}

/**
 * Run Visualization Agent step
 */
async function runVisualizationStep(scoutResult, contextResult) {
  updateStepStatus("viz", "running");
  logToConsole("Running Visualization Agent step...", "info");

  try {
    // Determine visualization type from config
    const vizStep = workflowConfig.steps.find(
      (step) => step.agent === "visualization"
    );
    const vizType = vizStep?.visualization_type || "treemap";

    updateStepDetails("viz", `Generating ${vizType} visualization`);

    // Prepare request
    const vizRequest = {
      data_source: {
        type: "scout",
        data: scoutResult,
      },
      context_data: contextResult,
      visualization_type: vizType,
      options: {
        groupBy: "domain",
        colorBy: "similarity_score",
        sizeBy: "data_quality_score",
      },
    };

    const response = await fetch(`${apiUrl}/agent/visualization/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vizRequest),
    });

    if (!response.ok) {
      throw new Error(`Visualization Agent error: ${response.status}`);
    }

    const vizResult = await response.json();
    updateStepDetails(
      "viz",
      `Generated ${vizType} visualization with insights`
    );

    return vizResult;
  } catch (error) {
    updateStepStatus("viz", "error");
    updateStepDetails("viz", `Error: ${error.message}`);
    throw error;
  }
}

/**
 * Run Orchestrator step (final report generation)
 */
async function runOrchestratorStep(results) {
  updateStepStatus("orchestrator", "running");
  logToConsole("Running final report generation step...", "info");

  try {
    updateStepDetails("orchestrator", "Generating integrated report");

    // Prepare request
    const reportRequest = {
      workflow_type: document.getElementById("workflow-type").value,
      workflow_config: workflowConfig,
      scout_result: results.scout,
      context_result: results.context,
      visualization_result: results.visualization,
    };

    const response = await fetch(`${apiUrl}/agent/orchestrator/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportRequest),
    });

    if (!response.ok) {
      throw new Error(`Report generation error: ${response.status}`);
    }

    const reportResult = await response.json();
    updateStepDetails("orchestrator", "Final report generated successfully");

    return reportResult;
  } catch (error) {
    updateStepStatus("orchestrator", "error");
    updateStepDetails("orchestrator", `Error: ${error.message}`);
    throw error;
  }
}

/**
 * Reset workflow UI
 */
function resetWorkflow() {
  // Reset results
  workflowResults = {
    scout: null,
    context: null,
    visualization: null,
    report: null,
  };

  // Reset status
  workflowStatus = "pending";

  // Update UI
  document.getElementById("workflow-status-badge").className =
    "status-badge status-pending";
  document.getElementById("workflow-status-badge").textContent = "Pending";
  document.getElementById("workflow-time").textContent = "00:00";

  // Reset step status
  updateStepStatus("scout", "pending");
  updateStepStatus("context", "pending");
  updateStepStatus("viz", "pending");
  updateStepStatus("orchestrator", "pending");

  // Hide all step details
  document.getElementById("scout-details").classList.add("hidden");
  document.getElementById("context-details").classList.add("hidden");
  document.getElementById("viz-details").classList.add("hidden");
  document.getElementById("orchestrator-details").classList.add("hidden");

  // Reset tab content
  document.getElementById("tab-overview").innerHTML = `
    <div class="placeholder-message">
      <i class="fas fa-brain"></i>
      <p>Run a workflow to see results overview</p>
    </div>
  `;

  document.getElementById("tab-scout").innerHTML = `
    <div class="placeholder-message">
      <i class="fas fa-search"></i>
      <p>Scout Agent data will appear here</p>
    </div>
  `;

  document.getElementById("tab-context").innerHTML = `
    <div class="placeholder-message">
      <i class="fas fa-sitemap"></i>
      <p>Context Analysis will appear here</p>
    </div>
  `;

  document.getElementById("tab-visualization").innerHTML = `
    <div class="placeholder-message">
      <i class="fas fa-chart-pie"></i>
      <p>Visualizations will appear here</p>
    </div>
  `;

  document.getElementById("tab-report").innerHTML = `
    <div class="placeholder-message">
      <i class="fas fa-file-alt"></i>
      <p>Final integrated report will appear here</p>
    </div>
  `;

  // Disable buttons
  document.getElementById("download-report-btn").disabled = true;
  document.getElementById("share-results-btn").disabled = true;

  // Switch to overview tab
  switchTab("overview");

  logToConsole("Workflow reset", "system");
}

/**
 * Update workflow status
 */
function updateWorkflowStatus(status) {
  workflowStatus = status;

  const statusBadge = document.getElementById("workflow-status-badge");
  statusBadge.className = `status-badge status-${status}`;

  switch (status) {
    case "running":
      statusBadge.textContent = "Running";
      break;
    case "complete":
      statusBadge.textContent = "Complete";
      break;
    case "error":
      statusBadge.textContent = "Error";
      break;
    default:
      statusBadge.textContent = "Pending";
  }

  logToConsole(`Workflow status updated to: ${status}`, "info");
}

/**
 * Update step status
 */
function updateStepStatus(stepId, status, message = null) {
  // Get step icon element
  let iconElement;
  switch (stepId) {
    case "scout":
      iconElement = document.querySelector(
        ".workflow-step:nth-child(1) .step-icon"
      );
      break;
    case "context":
      iconElement = document.querySelector(
        ".workflow-step:nth-child(2) .step-icon"
      );
      break;
    case "viz":
      iconElement = document.querySelector(
        ".workflow-step:nth-child(3) .step-icon"
      );
      break;
    case "orchestrator":
      iconElement = document.querySelector(
        ".workflow-step:nth-child(4) .step-icon"
      );
      break;
  }

  if (!iconElement) return;

  // Update icon class
  iconElement.className = `step-icon ${status}`;

  // Update time display
  const timeElement = document.getElementById(`${stepId}-time`);
  if (timeElement) {
    if (status === "complete") {
      const now = new Date();
      timeElement.textContent = now.toLocaleTimeString();
    } else if (status === "running") {
      timeElement.textContent = "Running...";
    } else if (status === "error") {
      timeElement.textContent = "Error";
    } else if (message) {
      timeElement.textContent = message;
    } else {
      timeElement.textContent = "Pending";
    }
  }

  logToConsole(
    `${
      stepId.charAt(0).toUpperCase() + stepId.slice(1)
    } step status updated to: ${status}`,
    "info"
  );
}

/**
 * Update step details
 */
function updateStepDetails(stepId, details) {
  const detailsElement = document.getElementById(`${stepId}-details`);
  if (!detailsElement) return;

  detailsElement.textContent = details;
  detailsElement.classList.remove("hidden");

  logToConsole(
    `${stepId.charAt(0).toUpperCase() + stepId.slice(1)} step details updated`,
    "info"
  );
}

/**
 * Start workflow timer
 */
function startWorkflowTimer() {
  if (workflowTimer) {
    clearInterval(workflowTimer);
  }

  workflowTimer = setInterval(() => {
    const elapsed = Date.now() - workflowStartTime;
    const minutes = Math.floor(elapsed / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

    const timeStr = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
    document.getElementById("workflow-time").textContent = timeStr;
  }, 1000);
}

/**
 * Stop workflow timer
 */
function stopWorkflowTimer() {
  if (workflowTimer) {
    clearInterval(workflowTimer);
    workflowTimer = null;
  }
}

/**
 * Update tab content
 */
function updateTabContent(tabId, data) {
  const tabElement = document.getElementById(`tab-${tabId}`);
  if (!tabElement || !data) return;

  // Format content based on tab type
  switch (tabId) {
    case "scout":
      // Update Scout tab
      tabElement.innerHTML = `
        <div class="tab-section">
          <h3>Trend Query</h3>
          <p><strong>${data.query || data.prompt || "Unknown"}</strong></p>
          
          <h3>Scout Response</h3>
          <p>${
            data.response_to_user_prompt || "No direct response available"
          }</p>
          
          <h3>Relevant Trends</h3>
          <div class="trends-list">
            ${
              data.relevant_trends
                ? formatTrendsList(data.relevant_trends)
                : "No trends found"
            }
          </div>
        </div>
      `;
      break;

    case "context":
      // Update Context tab
      tabElement.innerHTML = `
        <div class="tab-section">
          <h3>Trend Analysis</h3>
          <h4>${data.trend_name || "Technology Trend"}</h4>
          
          <div class="context-summary">
            <h4>Overall Assessment</h4>
            <p><strong>Recommendation:</strong> ${
              data.overall_assessment?.pursuit_recommendation || "Not available"
            }</p>
            <p><strong>Approach:</strong> ${
              data.overall_assessment?.recommended_approach || "Not available"
            }</p>
            <p><strong>Priority:</strong> ${
              data.overall_assessment?.priority_level || "Not available"
            }</p>
            <p><strong>Relevance Score:</strong> ${
              data.overall_assessment?.relevance_score?.toFixed(2) ||
              "Not available"
            }</p>
          </div>
          
          <div class="context-details">
            <h4>Analysis Details</h4>
            <div class="context-section">
              <h5>Strategic Alignment</h5>
              <p><strong>Score:</strong> ${
                data.context_analysis?.strategic_alignment?.score?.toFixed(2) ||
                "Not available"
              }</p>
              <p>${
                data.context_analysis?.strategic_alignment?.rationale ||
                "No rationale available"
              }</p>
            </div>
            
            <div class="context-section">
              <h5>Capability Assessment</h5>
              <p><strong>Score:</strong> ${
                data.context_analysis?.capability_assessment?.score?.toFixed(
                  2
                ) || "Not available"
              }</p>
              <p>${
                data.context_analysis?.capability_assessment?.rationale ||
                "No rationale available"
              }</p>
            </div>
            
            <div class="context-section">
              <h5>Competitive Landscape</h5>
              <p><strong>Position:</strong> ${
                data.context_analysis?.competitive_landscape?.position ||
                "Not available"
              }</p>
              <p><strong>Market Opportunity:</strong> ${
                data.context_analysis?.competitive_landscape
                  ?.market_opportunity || "Not available"
              }</p>
              <p>${
                data.context_analysis?.competitive_landscape?.rationale ||
                "No rationale available"
              }</p>
            </div>
          </div>
        </div>
      `;
      break;

    case "visualization":
      // Update Visualization tab
      tabElement.innerHTML = `
        <div class="tab-section">
          <h3>Visualizations</h3>
          <p>Visualization type: ${data.visualization_type || "Unknown"}</p>
          
          <div class="viz-placeholder">
            <i class="fas fa-chart-pie"></i>
            <p>Visualization image would be displayed here</p>
          </div>
          
          <h3>Insights</h3>
          <div class="viz-insights">
            ${formatInsightsList(data.insights || [])}
          </div>
        </div>
      `;
      break;

    case "report":
      // Update Report tab
      tabElement.innerHTML = `
        <div class="tab-section">
          <h1>${data.title || "Analysis Report"}</h1>
          <p class="report-meta">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          
          <div class="report-summary">
            <h2>Executive Summary</h2>
            <p>${data.executive_summary || "No summary available"}</p>
          </div>
          
          <div class="report-content">
            ${data.content || "No report content available"}
          </div>
        </div>
      `;
      break;
  }

  logToConsole(`Updated ${tabId} tab content`, "info");
}

/**
 * Update overview tab with summary information
 */
function updateOverviewTab() {
  const overviewTab = document.getElementById("tab-overview");
  if (!overviewTab) return;

  // Get workflow duration
  const elapsed = Date.now() - workflowStartTime;
  const minutes = Math.floor(elapsed / (1000 * 60));
  const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);
  const durationStr = `${minutes}m ${seconds}s`;

  // Get overview details from report if available
  const reportData = workflowResults.report || {};
  const contextData = workflowResults.context || {};
  const scoutData = workflowResults.scout || {};

  // Create overview content
  overviewTab.innerHTML = `
    <div class="overview-section">
      <h2>${reportData.title || workflowConfig.name || "Workflow Results"}</h2>
      
      <div class="overview-meta">
        <div class="meta-item">
          <span class="meta-label">Duration:</span>
          <span class="meta-value">${durationStr}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Status:</span>
          <span class="meta-value">${
            workflowStatus.charAt(0).toUpperCase() + workflowStatus.slice(1)
          }</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Trend Query:</span>
          <span class="meta-value">${
            scoutData.query || scoutData.prompt || "Unknown"
          }</span>
        </div>
      </div>
      
      <div class="overview-summary">
        <h3>Executive Summary</h3>
        <p>${
          reportData.executive_summary ||
          contextData.overall_assessment?.pursuit_recommendation ||
          "No summary available"
        }</p>
      </div>
      
      <div class="overview-highlights">
        <h3>Key Highlights</h3>
        <ul>
          <li><strong>Trends Analyzed:</strong> ${
            scoutData.relevant_trends?.length || 0
          }</li>
          <li><strong>Recommendation:</strong> ${
            contextData.overall_assessment?.pursuit_recommendation ||
            "Not available"
          }</li>
          <li><strong>Priority:</strong> ${
            contextData.overall_assessment?.priority_level || "Not available"
          }</li>
          <li><strong>Approach:</strong> ${
            contextData.overall_assessment?.recommended_approach ||
            "Not available"
          }</li>
        </ul>
      </div>
      
      <div class="overview-next-steps">
        <h3>Next Steps</h3>
        ${formatNextStepsList(contextData.overall_assessment?.next_steps || [])}
      </div>
    </div>
  `;

  logToConsole("Updated overview tab", "info");
}

/**
 * Format trends list for display
 */
function formatTrendsList(trends) {
  if (!trends || trends.length === 0) {
    return "<p>No trends available</p>";
  }

  return `
    <ul class="trends-list">
      ${trends
        .map(
          (trend) => `
        <li class="trend-item">
          <div class="trend-header">
            <h4>${trend.title || "Unnamed Trend"}</h4>
            <span class="trend-score">Score: ${
              trend.similarity_score?.toFixed(2) || "N/A"
            }</span>
          </div>
          <div class="trend-details">
            <p><strong>Domain:</strong> ${trend.domain || "Unknown"}</p>
            <p><strong>Type:</strong> ${trend.knowledge_type || "Unknown"}</p>
            <p><strong>Date:</strong> ${trend.publication_date || "Unknown"}</p>
          </div>
        </li>
      `
        )
        .join("")}
    </ul>
  `;
}

/**
 * Format insights list for display
 */
function formatInsightsList(insights) {
  if (!insights || insights.length === 0) {
    return "<p>No insights available</p>";
  }

  return `
    <ul class="insights-list">
      ${insights.map((insight) => `<li>${insight}</li>`).join("")}
    </ul>
  `;
}

/**
 * Format next steps list for display
 */
function formatNextStepsList(steps) {
  if (!steps || steps.length === 0) {
    return "<p>No next steps defined</p>";
  }

  return `
    <ol class="next-steps-list">
      ${steps.map((step) => `<li>${step}</li>`).join("")}
    </ol>
  `;
}

/**
 * Switch between tabs
 */
function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll(".agent-tab").forEach((tab) => {
    tab.classList.remove("active");
  });
  document
    .querySelector(`.agent-tab[onclick="switchTab('${tabId}')"]`)
    .classList.add("active");

  // Update tab content
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });
  document.getElementById(`tab-${tabId}`).classList.add("active");

  logToConsole(`Switched to ${tabId} tab`, "info");
}

/**
 * Download final report
 */
function downloadReport() {
  if (!workflowResults.report) {
    showToast("No report available for download");
    return;
  }

  try {
    // Create report JSON
    const reportData = {
      title: workflowResults.report.title || "Analysis Report",
      generated_at: new Date().toISOString(),
      workflow_type: document.getElementById("workflow-type").value,
      results: workflowResults,
    };

    // Convert to blob
    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    // Create download link
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportData.title.replace(/\s+/g, "-").toLowerCase()}-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    logToConsole("Report downloaded successfully", "info");
  } catch (error) {
    showToast(`Download error: ${error.message}`);
    logToConsole(`Error downloading report: ${error.message}`, "error");
  }
}

/**
 * Share workflow results
 */
/**
 * Share workflow results via different mechanisms
 */
function shareResults() {
  if (!workflowResults || !workflowResults.report) {
    showToast("No results available to share");
    return;
  }
  
  // Create a sharing modal if it doesn't exist
  let shareModal = document.getElementById("share-modal");
  
  if (!shareModal) {
    shareModal = document.createElement("div");
    shareModal.id = "share-modal";
    shareModal.className = "modal";
    
    const modalContent = document.createElement("div");
    modalContent.className = "modal-content";
    
    // Add modal header
    const modalHeader = document.createElement("div");
    modalHeader.className = "modal-header";
    modalHeader.innerHTML = `
      <h3>Share Results</h3>
      <span class="close-modal">&times;</span>
    `;
    
    // Add sharing options
    const sharingOptions = document.createElement("div");
    sharingOptions.className = "sharing-options";
    sharingOptions.innerHTML = `
      <div class="share-section">
        <h4>Share Link</h4>
        <div class="link-input-group">
          <input type="text" id="share-link" readonly value="${generateShareLink()}" />
          <button class="copy-link-btn" onclick="copyShareLink()">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
      </div>
      
      <div class="share-section">
        <h4>Export Options</h4>
        <div class="export-buttons">
          <button class="export-btn" onclick="exportAsJSON()">
            <i class="fas fa-file-code"></i> JSON
          </button>
          <button class="export-btn" onclick="exportAsPDF()">
            <i class="fas fa-file-pdf"></i> PDF
          </button>
          <button class="export-btn" onclick="exportAsCSV()">
            <i class="fas fa-file-csv"></i> CSV
          </button>
        </div>
      </div>
      
      <div class="share-section">
        <h4>Email Report</h4>
        <div class="email-form">
          <input type="email" id="email-recipient" placeholder="recipient@example.com" />
          <button class="send-email-btn" onclick="sendReportByEmail()">
            <i class="fas fa-paper-plane"></i> Send
          </button>
        </div>
      </div>
    `;
    
    // Add modal buttons
    const modalActions = document.createElement("div");
    modalActions.className = "modal-actions";
    modalActions.innerHTML = `
      <button class="secondary-button close-button">
        <i class="fas fa-times"></i> Close
      </button>
    `;
    
    // Assemble modal
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(sharingOptions);
    modalContent.appendChild(modalActions);
    shareModal.appendChild(modalContent);
    
    // Add modal to document
    document.body.appendChild(shareModal);
    
    // Set up close button events
    const closeButtons = shareModal.querySelectorAll(".close-modal, .close-button");
    closeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        shareModal.style.display = "none";
      });
    });
  }
  
  // Display the modal
  shareModal.style.display = "block";
  
  // When users click outside the modal, close it
  window.onclick = function(event) {
    if (event.target === shareModal) {
      shareModal.style.display = "none";
    }
  };
  
  logToConsole("Share dialog opened", "info");
}

/**
 * Generate a shareable link for the results
 */
function generateShareLink() {
  // In a real implementation, you would:
  // 1. Store the report in a database
  // 2. Generate a unique ID for it
  // 3. Create a URL with that ID
  
  // For this example, we'll simulate it:
  const reportId = `report-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;
  
  // Store this ID with the report data (in localStorage for this demo)
  try {
    const sharedReports = JSON.parse(localStorage.getItem("sharedReports") || "{}");
    sharedReports[reportId] = {
      data: workflowResults,
      created: new Date().toISOString()
    };
    localStorage.setItem("sharedReports", JSON.stringify(sharedReports));
  } catch (error) {
    console.error("Error storing shared report:", error);
  }
  
  // Generate URL for current origin
  return `${window.location.origin}/shared-report/${reportId}`;
}

/**
 * Copy share link to clipboard
 */
function copyShareLink() {
  const linkInput = document.getElementById("share-link");
  if (!linkInput) return;
  
  // Select and copy
  linkInput.select();
  linkInput.setSelectionRange(0, 99999); // For mobile devices
  
  navigator.clipboard.writeText(linkInput.value)
    .then(() => {
      showToast("Link copied to clipboard");
      logToConsole("Share link copied to clipboard", "info");
    })
    .catch(err => {
      showToast("Failed to copy: " + err);
      logToConsole(`Failed to copy link: ${err}`, "error");
    });
}

/**
 * Export report as JSON file
 */
function exportAsJSON() {
  if (!workflowResults || !workflowResults.report) {
    showToast("No report data available to export");
    return;
  }
  
  try {
    // Create exportable version of the data
    const exportData = {
      title: workflowResults.report.title || "Analysis Report",
      generated_at: new Date().toISOString(),
      report_content: workflowResults.report,
      workflow_type: document.getElementById("workflow-type").value,
      timestamp: Date.now()
    };
    
    // Convert to JSON blob
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportData.title.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("Report exported as JSON");
    logToConsole("Report exported as JSON", "info");
  } catch (error) {
    showToast(`Export error: ${error.message}`);
    logToConsole(`Error exporting as JSON: ${error.message}`, "error");
  }
}

/**
 * Export report as PDF (simplified implementation)
 */
function exportAsPDF() {
  showToast("PDF export in progress...");
  
  setTimeout(() => {
    showToast("PDF export completed");
    logToConsole("Report exported as PDF (simulation)", "info");
  }, 1500);
  
  // In a real implementation, you would:
  // 1. Format the report data appropriately for PDF
  // 2. Use a library like jsPDF to generate the PDF
  // 3. Save the file or open it in a new window
}

/**
 * Export report as CSV (simplified implementation)
 */
function exportAsCSV() {
  showToast("CSV export in progress...");
  
  setTimeout(() => {
    showToast("CSV export completed");
    logToConsole("Report exported as CSV (simulation)", "info");
  }, 1500);
  
  // In a real implementation, you would:
  // 1. Convert the relevant parts of the report to CSV format
  // 2. Create a blob and download link
  // 3. Trigger the download
}

/**
 * Send report by email (simplified implementation)
 */
function sendReportByEmail() {
  const emailInput = document.getElementById("email-recipient");
  if (!emailInput || !emailInput.value) {
    showToast("Please enter a valid email address");
    return;
  }
  
  const email = emailInput.value;
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    showToast("Please enter a valid email address");
    return;
  }
  
  showToast(`Sending report to ${email}...`);
  
  // Simulate sending
  setTimeout(() => {
    showToast(`Report sent to ${email}`);
    logToConsole(`Report sent to ${email} (simulation)`, "info");
    
    // Clear the email input
    emailInput.value = "";
    
    // Close the modal
    document.getElementById("share-modal").style.display = "none";
  }, 2000);
  
  // In a real implementation, you would:
  // 1. Make an API call to a backend service
  // 2. The backend would generate and send the email
  // 3. Handle success/error responses
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("workflow-type")) {
    logToConsole("Orchestrator Agent initialized", "system");

    // Load scout results
    loadScoutResultsFromLocalStorage();

    // Add event listener for tab switching
    document.querySelectorAll(".agent-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabId = tab.innerText.toLowerCase();
        switchTab(tabId);
      });
    });

    // Load example company profile
    const companyProfile = document.getElementById("company-profile");
    if (companyProfile && !companyProfile.value) {
      const exampleCompany = {
        name: "Mahindra & Mahindra Ltd.",
        founded: "1945-10-02",
        founders: [
          "Jagdish Chandra Mahindra",
          "Kailash Chandra Mahindra",
          "Malik Ghulam Muhammad",
        ],
        headquarters: "Mumbai, Maharashtra, India",
        type: "Public",
        industry: [
          "Automotive",
          "Farm Equipment",
          "Information Technology",
          "Financial Services",
          "Renewable Energy",
          "Logistics",
          "Hospitality",
          "Real Estate",
        ],
        website: "https://auto.mahindra.com",
        numberOfEmployees: 260000,
        products: [
          "Passenger Vehicles",
          "Commercial Vehicles",
          "Tractors",
          "Motorcycles",
          "Electric Vehicles",
          "Agricultural Implements",
          "Automotive Components",
        ],
        focusAreas: [
          "Electric Vehicle Development",
          "Sustainable Farming Solutions",
          "Digital Farming Technologies",
          "Precision Agriculture",
          "Autonomous Driving",
          "Connected Vehicles",
          "Sustainability",
        ],
        initiatives: [
          "Electric SUV Launch",
          "EV Expansion Plan",
          "Precision Agriculture Partnerships",
        ],
        researchAndDevelopment: {
          facilities: [
            "Mahindra Research Valley (India)",
            "Mahindra North American Technical Centre (USA)",
            "Mahindra Advanced Design Europe (UK)",
            "Pininfarina (Italy)",
          ],
          recentInvestmentsUSD: 1440000000,
          annualInvestment: {
            amountINR: 29700000000,
            fiscalYear: "2019-20",
            percentageOfTurnover: 6.3,
          },
        },
        latestNews: [
          {
            title: "Mahindra unveils global electric SUV lineup",
            url: "https://www.autocarindia.com/car-news/mahindra-unveils-global-electric-suv-lineup-427958",
          },
          {
            title: "Mahindra to invest ₹12,000 crore in EVs by 2027",
            url: "https://www.business-standard.com/article/companies/mahindra-to-invest-rs-12-000-cr-in-evs-by-2027-says-anish-shah-124032300968_1.html",
          },
          {
            title: "Mahindra reports record tractor sales in Q4 FY24",
            url: "https://economictimes.indiatimes.com/industry/auto/auto-news/mahindra-reports-record-tractor-sales-in-q4-fy24/articleshow/108412014.cms",
          },
        ],
      };
      companyProfile.value = JSON.stringify([exampleCompany], null, 2);
    }

    // Connect to socket if available
    if (typeof io !== "undefined") {
      connectSocket();
    }
  }
});
