// ==================================================
// CONTEXT AGENT FUNCTIONALITY
// ==================================================

// Store scout results for context analysis
let scoutResults = [];
let lastAnalysisResult = null;

/**
 * Load Scout results from localStorage on page load
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
  const resultTextarea = document.getElementById("scout-result");

  if (!selectElement || !resultTextarea) return;

  const selectedId = selectElement.value;

  if (!selectedId) {
    resultTextarea.value = "";
    return;
  }

  const result = scoutResults.find((r) => r.id === selectedId);

  if (result) {
    resultTextarea.value = JSON.stringify(result.data, null, 2);
    logToConsole(
      `Loaded Scout result: ${result.prompt.substring(0, 30)}...`,
      "info"
    );
  } else {
    resultTextarea.value = "";
    logToConsole("Selected result not found", "warning");
  }
}

/**
 * Run context analysis
 */
function runContextAnalysis() {
  // Get input data
  const companyProfile = document.getElementById("company-profile").value;
  const competitorData = document.getElementById("competitor-data").value;
  const scoutResult = document.getElementById("scout-result").value;

  // Validate inputs
  if (!companyProfile) {
    showToast("Please enter company profile data");
    logToConsole("Missing company profile data", "warning");
    return;
  }

  if (!scoutResult) {
    showToast("Please select or enter Scout result data");
    logToConsole("Missing scout result data", "warning");
    return;
  }

  // Parse JSON inputs
  let companyProfileObj, competitorDataObj, scoutResultObj;

  try {
    companyProfileObj = JSON.parse(companyProfile);
  } catch (e) {
    showToast("Invalid company profile JSON format");
    logToConsole("Invalid company profile JSON: " + e.message, "error");
    return;
  }

  if (competitorData) {
    try {
      competitorDataObj = JSON.parse(competitorData);
    } catch (e) {
      showToast("Invalid competitor data JSON format");
      logToConsole("Invalid competitor data JSON: " + e.message, "error");
      return;
    }
  }

  try {
    scoutResultObj = JSON.parse(scoutResult);
  } catch (e) {
    showToast("Invalid Scout result JSON format");
    logToConsole("Invalid Scout result JSON: " + e.message, "error");
    return;
  }

  // Show loading state
  document.getElementById("loading").classList.remove("hidden");
  document.getElementById("no-results").classList.add("hidden");
  document.getElementById("results-container").classList.add("hidden");

  // Disable analyze button
  handleButtonState("#analyze-button", true, "Analyzing...");

  logToConsole("Starting context analysis...", "info");

  // Prepare request body
  const requestBody = {
    company_profile: companyProfileObj,
    competitor_data: competitorDataObj || null,
    scout_result: scoutResultObj,
  };

  // Send API request
  fetch(`${apiUrl}/agent/context/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      // Hide loading spinner
      document.getElementById("loading").classList.add("hidden");
      logToConsole("Context analysis complete", "info");

      // Store result
      lastAnalysisResult = data;

      // Update UI with results
      updateResultsUI(data);

      // Show results container
      document.getElementById("no-results").classList.add("hidden");
      document.getElementById("results-container").classList.remove("hidden");

      // Save to localStorage if needed
      saveAnalysisToLocalStorage(data);

      // Re-enable analyze button
      handleButtonState("#analyze-button", false);
    })
    .catch((error) => {
      // Hide loading spinner
      document.getElementById("loading").classList.add("hidden");
      logToConsole(`Analysis error: ${error}`, "error");

      // Show error message
      showToast(`Error: ${error.message}`);

      // Re-enable analyze button
      handleButtonState("#analyze-button", false);
    });
}

/**
 * Update the results UI with context analysis data
 */
function updateResultsUI(data) {
  if (!data || !data.context_analysis) {
    logToConsole("Invalid analysis data received", "error");
    return;
  }

  const context = data.context_analysis;
  const overall = data.overall_assessment;

  // Update overall assessment section
  document.getElementById("relevance-score").textContent =
    overall.relevance_score.toFixed(2);
  document.getElementById("strategic-score").textContent =
    context.strategic_alignment.score.toFixed(2);
  document.getElementById("capability-score").textContent =
    context.capability_assessment.score.toFixed(2);
  document.getElementById("competitive-score").textContent =
    context.competitive_landscape.score.toFixed(2);
  document.getElementById(
    "recommendation"
  ).textContent = `Recommendation: ${overall.pursuit_recommendation}`;
  document.getElementById(
    "approach"
  ).textContent = `Recommended Approach: ${overall.recommended_approach}`;

  // Update considerations
  const considerationsList = document.getElementById("considerations-list");
  considerationsList.innerHTML = overall.key_considerations
    .map((item) => `<li>${item}</li>`)
    .join("");

  // Update next steps
  const nextStepsList = document.getElementById("next-steps-list");
  nextStepsList.innerHTML = overall.next_steps
    .map((item) => `<li>${item}</li>`)
    .join("");

  // Update strategic alignment
  const strategicScore = document.getElementById("strategic-alignment-score");
  strategicScore.textContent = context.strategic_alignment.score.toFixed(2);
  updateScoreBadgeClass(strategicScore, context.strategic_alignment.score);

  const alignedPrioritiesList = document.getElementById("aligned-priorities");
  alignedPrioritiesList.innerHTML =
    context.strategic_alignment.aligned_priorities
      .map(
        (item) =>
          `<li>
      <div class="panel-item">
        <span class="panel-label">${item.priority}</span>
        <span class="panel-value">Relevance: ${item.relevance.toFixed(2)}</span>
      </div>
    </li>`
      )
      .join("");

  document.getElementById("strategic-rationale").textContent =
    context.strategic_alignment.rationale;

  // Update capability assessment
  const capabilityScore = document.getElementById(
    "capability-assessment-score"
  );
  capabilityScore.textContent = context.capability_assessment.score.toFixed(2);
  updateScoreBadgeClass(capabilityScore, context.capability_assessment.score);

  const existingCapabilitiesList = document.getElementById(
    "existing-capabilities"
  );
  existingCapabilitiesList.innerHTML =
    context.capability_assessment.existing_capabilities
      .map(
        (item) =>
          `<li>
      <div class="panel-item">
        <span class="panel-label">${item.capability}</span>
        <span class="panel-value">Potential: ${item.leverage_potential}</span>
      </div>
      <div>Relevance: ${item.relevance.toFixed(2)}</div>
    </li>`
      )
      .join("");

  const capabilityGapsList = document.getElementById("capability-gaps");
  capabilityGapsList.innerHTML = context.capability_assessment.capability_gaps
    .map(
      (item) =>
        `<li>
      <div class="panel-item">
        <span class="panel-label">${item.gap}</span>
        <span class="panel-value">Criticality: ${item.criticality}</span>
      </div>
      <div>Development Difficulty: ${item.development_difficulty}</div>
    </li>`
    )
    .join("");

  document.getElementById("capability-rationale").textContent =
    context.capability_assessment.rationale;

  // Update competitive landscape
  const competitiveScore = document.getElementById(
    "competitive-landscape-score"
  );
  competitiveScore.textContent = context.competitive_landscape.score.toFixed(2);
  updateScoreBadgeClass(competitiveScore, context.competitive_landscape.score);

  document.getElementById("competitive-position").textContent =
    context.competitive_landscape.position;

  const keyCompetitorsList = document.getElementById("key-competitors");
  keyCompetitorsList.innerHTML = context.competitive_landscape.key_competitors
    .map(
      (item) =>
        `<li>
      <div class="panel-item">
        <span class="panel-label">${item.name}</span>
        <span class="panel-value">Threat: ${item.threat_level}</span>
      </div>
      <div>Position: ${item.position}</div>
    </li>`
    )
    .join("");

  document.getElementById("market-opportunity").textContent =
    context.competitive_landscape.market_opportunity;
  document.getElementById("competitive-rationale").textContent =
    context.competitive_landscape.rationale;

  // Update integration opportunities
  const integrationScore = document.getElementById(
    "integration-opportunities-score"
  );
  integrationScore.textContent =
    context.integration_opportunities.score.toFixed(2);
  updateScoreBadgeClass(
    integrationScore,
    context.integration_opportunities.score
  );

  const projectSynergiesList = document.getElementById("project-synergies");
  projectSynergiesList.innerHTML =
    context.integration_opportunities.project_synergies
      .map(
        (item) =>
          `<li>
      <div class="panel-item">
        <span class="panel-label">${item.project}</span>
        <span class="panel-value">Synergy: ${item.synergy_level}</span>
      </div>
      <div>Integration Path: ${item.integration_path}</div>
    </li>`
      )
      .join("");

  document.getElementById("integration-rationale").textContent =
    context.integration_opportunities.rationale;

  // Update resource requirements
  const estimatedInvestmentList = document.getElementById(
    "estimated-investment"
  );
  const investment = context.resource_requirements.estimated_investment;
  estimatedInvestmentList.innerHTML = `
    <li>
      <div class="panel-item">
        <span class="panel-label">R&D</span>
        <span class="panel-value">$${investment.r_and_d.toLocaleString()}</span>
      </div>
    </li>
    <li>
      <div class="panel-item">
        <span class="panel-label">Talent Acquisition</span>
        <span class="panel-value">$${investment.talent_acquisition.toLocaleString()}</span>
      </div>
    </li>
    <li>
      <div class="panel-item">
        <span class="panel-label">Technology Licensing</span>
        <span class="panel-value">$${investment.technology_licensing.toLocaleString()}</span>
      </div>
    </li>
    <li>
      <div class="panel-item">
        <span class="panel-label">Total</span>
        <span class="panel-value">$${investment.total.toLocaleString()}</span>
      </div>
    </li>
  `;

  const talentNeedsList = document.getElementById("talent-needs");
  talentNeedsList.innerHTML = context.resource_requirements.talent_needs
    .map(
      (item) =>
        `<li>
      <div class="panel-item">
        <span class="panel-label">${item.role}</span>
        <span class="panel-value">Count: ${item.count}</span>
      </div>
      <div>Priority: ${item.priority}</div>
    </li>`
    )
    .join("");

  const timelineList = document.getElementById("timeline");
  const timeline = context.resource_requirements.timeline;
  timelineList.innerHTML = `
    <li>
      <div class="panel-item">
        <span class="panel-label">Research Phase</span>
        <span class="panel-value">${timeline.research_phase}</span>
      </div>
    </li>
    <li>
      <div class="panel-item">
        <span class="panel-label">Development Phase</span>
        <span class="panel-value">${timeline.development_phase}</span>
      </div>
    </li>
    <li>
      <div class="panel-item">
        <span class="panel-label">Market Entry</span>
        <span class="panel-value">${timeline.market_entry}</span>
      </div>
    </li>
  `;

  document.getElementById("feasibility").textContent =
    context.resource_requirements.feasibility;
  document.getElementById("resource-rationale").textContent =
    context.resource_requirements.rationale;

  logToConsole("Results UI updated with analysis data", "info");
}

/**
 * Update score badge class based on score value
 */
function updateScoreBadgeClass(element, score) {
  // Remove existing classes
  element.classList.remove("score-high", "score-medium", "score-low");

  // Add appropriate class based on score
  if (score >= 0.7) {
    element.classList.add("score-high");
  } else if (score >= 0.4) {
    element.classList.add("score-medium");
  } else {
    element.classList.add("score-low");
  }
}

/**
 * Save analysis result to localStorage
 */
function saveAnalysisToLocalStorage(data) {
  try {
    const analysisHistory = JSON.parse(
      localStorage.getItem("contextAnalysisHistory") || "[]"
    );

    // Add timestamp
    const analysisWithTimestamp = {
      ...data,
      timestamp: new Date().toISOString(),
      id: "analysis-" + Date.now(),
    };

    // Add to history
    analysisHistory.push(analysisWithTimestamp);

    // Keep only the last 10 analyses
    if (analysisHistory.length > 10) {
      analysisHistory.shift();
    }

    // Save back to localStorage
    localStorage.setItem(
      "contextAnalysisHistory",
      JSON.stringify(analysisHistory)
    );

    logToConsole("Analysis saved to localStorage", "system");
  } catch (e) {
    logToConsole(
      `Error saving analysis to localStorage: ${e.message}`,
      "error"
    );
  }
}

/**
 * Copy results to clipboard
 */
function copyResults() {
  if (!lastAnalysisResult) {
    showToast("No analysis results to copy");
    return;
  }

  try {
    const jsonString = JSON.stringify(lastAnalysisResult, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      showToast("Analysis copied to clipboard");
      logToConsole("Analysis copied to clipboard", "info");
    });
  } catch (e) {
    showToast("Failed to copy: " + e.message);
    logToConsole(`Failed to copy: ${e.message}`, "error");
  }
}

/**
 * Download results as JSON
 */
function downloadResults() {
  if (!lastAnalysisResult) {
    showToast("No analysis results to download");
    return;
  }

  try {
    const jsonString = JSON.stringify(lastAnalysisResult, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `context-analysis-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logToConsole("Analysis downloaded as JSON", "info");
  } catch (e) {
    showToast("Failed to download: " + e.message);
    logToConsole(`Failed to download: ${e.message}`, "error");
  }
}

// Initialize on page load if this is the context agent page
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("scout-select")) {
    logToConsole("Context Agent initialized", "system");

    // Load scout results
    loadScoutResultsFromLocalStorage();

    // Connect to socket if available
    if (typeof io !== "undefined") {
      connectSocket();
    }
  }
});
