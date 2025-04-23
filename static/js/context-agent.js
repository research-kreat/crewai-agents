// ==================================================
// CONTEXT AGENT FUNCTIONALITY
// ==================================================

// Store results for context analysis
let analystResults = [];
let lastAnalysisResult = null;

/**
 * Load Analyst results from localStorage on page load
 */
function loadAnalystResultsFromLocalStorage() {
  try {
    // Try to load analyst results first
    const storedAnalyst = localStorage.getItem("analystResultsIndex");
    if (storedAnalyst) {
      const indexData = JSON.parse(storedAnalyst);
      
      // Clear current results
      analystResults = [];
      
      // Load each result
      indexData.forEach((item) => {
        const storedData = localStorage.getItem(`analystResult_${item.id}`);
        if (storedData) {
          analystResults.push({
            id: item.id,
            timestamp: item.timestamp,
            date: item.date,
            prompt: item.prompt,
            data: JSON.parse(storedData),
          });
        }
      });
      
      logToConsole(
        `Loaded ${analystResults.length} analyst results from localStorage`,
        "system"
      );
    } else {
      // Fall back to scout results if no analyst results
      const storedScout = localStorage.getItem("scoutResultsIndex");
      if (!storedScout) return;
      
      const scoutIndexData = JSON.parse(storedScout);
      
      // We'll convert scout results to a format compatible with analyst
      scoutIndexData.forEach((item) => {
        const storedData = localStorage.getItem(`scoutResult_${item.id}`);
        if (storedData) {
          // Create a simple analyst result with the scout data embedded
          const scoutData = JSON.parse(storedData);
          const analystResult = {
            id: "analyst-" + item.id,
            timestamp: item.timestamp,
            date: item.date,
            prompt: item.prompt,
            data: {
              original_scout_data: scoutData,
              graph_data: { nodes: [], links: [] },
              graph_insights: {}
            }
          };
          
          analystResults.push(analystResult);
        }
      });
      
      logToConsole(
        `Converted ${analystResults.length} scout results to analyst format`,
        "system"
      );
    }
    
    // Update select dropdown
    updateAnalystSelect();
  } catch (e) {
    logToConsole(`Error loading from localStorage: ${e.message}`, "error");
  }
}

/**
 * Update Analyst results select dropdown
 */
function updateAnalystSelect() {
  const selectElement = document.getElementById("analyst-select");
  if (!selectElement) return;

  // Clear current options except the first one
  while (selectElement.options.length > 1) {
    selectElement.remove(1);
  }

  // Sort results by date (newest first)
  const sortedResults = [...analystResults].sort((a, b) => {
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

  logToConsole("Analyst select dropdown updated", "system");
}

/**
 * Load selected Analyst result
 */
function loadAnalystResult() {
  const selectElement = document.getElementById("analyst-select");
  const resultTextarea = document.getElementById("analyst-data");

  if (!selectElement || !resultTextarea) return;

  const selectedId = selectElement.value;

  if (!selectedId) {
    resultTextarea.value = "";
    return;
  }

  const result = analystResults.find((r) => r.id === selectedId);

  if (result) {
    resultTextarea.value = JSON.stringify(result.data, null, 2);
    logToConsole(
      `Loaded Analyst result: ${result.prompt.substring(0, 30)}...`,
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
  const companyProfileText = document.getElementById("company-profile").value;
  const competitorDataText = document.getElementById("competitor-data").value;
  const analystDataText = document.getElementById("analyst-data").value;

  // Validate inputs
  if (!companyProfileText) {
    showToast("Please enter company profile data");
    logToConsole("Missing company profile data", "warning");
    return;
  }

  if (!analystDataText) {
    showToast("Please select or enter Analyst result data");
    logToConsole("Missing analyst data", "warning");
    return;
  }

  // Parse JSON inputs
  let companyProfile, competitorData, analystData;

  try {
    companyProfile = JSON.parse(companyProfileText);
    logToConsole("Successfully parsed company profile", "info");
  } catch (e) {
    showToast("Invalid company profile JSON format");
    logToConsole("Invalid company profile JSON: " + e.message, "error");
    return;
  }

  if (competitorDataText) {
    try {
      competitorData = JSON.parse(competitorDataText);
      logToConsole("Successfully parsed competitor data", "info");
    } catch (e) {
      showToast("Invalid competitor data JSON format");
      logToConsole("Invalid competitor data JSON: " + e.message, "error");
      return;
    }
  }

  try {
    analystData = JSON.parse(analystDataText);
    logToConsole("Successfully parsed analyst data", "info");
  } catch (e) {
    showToast("Invalid Analyst data JSON format");
    logToConsole("Invalid Analyst data JSON: " + e.message, "error");
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
    company_profile: companyProfile,
    competitor_data: competitorData || null,
    analyst_data: analystData,
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
    overall.relevance_score ? overall.relevance_score.toFixed(2) : "0.00";
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
  if (document.getElementById("analyst-select")) {
    logToConsole("Context Agent initialized", "system");

    // Load analyst results
    loadAnalystResultsFromLocalStorage();

    // Connect to socket if available
    if (typeof io !== "undefined") {
      connectSocket();
    }
  }
});

/**
 * Load company profile template
 */
function loadCompanyTemplate() {
  const template = {
    "name": "Acme Tech Innovations",
    "founded": "2008",
    "founders": ["Jane Smith", "John Doe"],
    "headquarters": "San Francisco, CA",
    "type": "Public Company",
    "industry": ["Software", "Artificial Intelligence", "Cloud Computing"],
    "website": "https://www.acmetechinnovations.com",
    "numberOfEmployees": 1500,
    "products": [
      "AI-powered Analytics Platform",
      "Enterprise Cloud Solutions",
      "Predictive Maintenance Software",
      "Digital Transformation Services"
    ],
    "focusAreas": [
      "Machine Learning",
      "Enterprise Software",
      "Predictive Analytics",
      "Cloud Infrastructure"
    ],
    "initiatives": [
      "Sustainable Tech Initiative",
      "AI Ethics Research",
      "Industry 4.0 Partnership Program"
    ],
    "researchAndDevelopment": {
      "facilities": [
        "San Francisco Innovation Lab",
        "Boston Research Center",
        "Bangalore Development Hub"
      ],
      "recentInvestmentsUSD": 50000000,
      "annualInvestment": {
        "amountINR": 1200000000,
        "fiscalYear": "2023-2024",
        "percentageOfTurnover": 18
      }
    },
    "latestNews": [
      {
        "title": "Acme Tech Launches Next-Gen AI Platform",
        "url": "https://www.techpress.com/acme-launches-ai-platform"
      },
      {
        "title": "Acme Acquires DataSense Analytics for $200M",
        "url": "https://www.businesswire.com/acme-acquires-datasense"
      },
      {
        "title": "Acme Tech Named Top Cloud Provider of 2024",
        "url": "https://www.cloudawards.com/acme-top-provider"
      }
    ]
  };

  document.getElementById("company-profile").value = JSON.stringify(template, null, 2);
  logToConsole("Company profile template loaded", "info");
}

/**
 * Load competitor data template
 */
function loadCompetitorTemplate() {
  const template = [
    {
      "name": "TechNova Solutions",
      "founded": "2005",
      "founders": ["Michael Johnson", "Lisa Chen"],
      "headquarters": "Seattle, WA",
      "type": "Public Company",
      "industry": ["Software", "Cloud Computing", "Enterprise Solutions"],
      "website": "https://www.technovasolutions.com",
      "numberOfEmployees": 2200,
      "products": [
        "Enterprise Cloud Platform",
        "Business Intelligence Suite",
        "Machine Learning Framework",
        "Data Integration Tools"
      ],
      "focusAreas": [
        "Cloud Computing",
        "AI/ML",
        "Business Intelligence",
        "Enterprise Software"
      ],
      "initiatives": [
        "Open Source AI Framework",
        "Green Cloud Computing",
        "Digital Transformation Accelerator"
      ],
      "researchAndDevelopment": {
        "facilities": [
          "Seattle Innovation Center",
          "Austin Research Lab",
          "Dublin Technology Center"
        ],
        "recentInvestmentsUSD": 75000000,
        "annualInvestment": {
          "amountINR": 1800000000,
          "fiscalYear": "2023-2024",
          "percentageOfTurnover": 22
        }
      },
      "latestNews": [
        {
          "title": "TechNova Releases Industry-Leading ML Platform",
          "url": "https://www.technews.com/technova-ml-platform"
        },
        {
          "title": "TechNova Partners with Microsoft for Cloud Integration",
          "url": "https://www.cloudnews.com/technova-microsoft-partnership"
        }
      ]
    },
    {
      "name": "FutureTech Dynamics",
      "founded": "2012",
      "founders": ["Alex Zhang", "Sarah Miller"],
      "headquarters": "Boston, MA",
      "type": "Private Company",
      "industry": ["AI", "Machine Learning", "Data Analytics"],
      "website": "https://www.futuretechdynamics.com",
      "numberOfEmployees": 850,
      "products": [
        "Predictive Analytics Suite",
        "AI-Driven Decision Platform",
        "Neural Network Framework",
        "Data Visualization Tools"
      ],
      "focusAreas": [
        "Deep Learning",
        "Natural Language Processing",
        "Computer Vision",
        "Predictive Analytics"
      ],
      "initiatives": [
        "AI for Healthcare",
        "Responsible AI Development",
        "AI Research Fellowship"
      ],
      "researchAndDevelopment": {
        "facilities": [
          "Boston Research Headquarters",
          "Montreal AI Lab",
          "London Innovation Hub"
        ],
        "recentInvestmentsUSD": 40000000,
        "annualInvestment": {
          "amountINR": 950000000,
          "fiscalYear": "2023-2024",
          "percentageOfTurnover": 25
        }
      },
      "latestNews": [
        {
          "title": "FutureTech Secures $50M Series C Funding",
          "url": "https://www.venturenews.com/futuretech-funding"
        },
        {
          "title": "FutureTech's NLP System Achieves Industry Benchmark",
          "url": "https://www.ainews.com/futuretech-nlp-benchmark"
        }
      ]
    }
  ];

  document.getElementById("competitor-data").value = JSON.stringify(template, null, 2);
  logToConsole("Competitor data template loaded", "info");
}

/**
 * Load analyst data template
 */
function loadAnalystTemplate() {
  const template = {
    "graph_data": {
      "links": [
        {
          "source": "trend-1",
          "target": "tech-federated-learning",
          "type": "uses",
          "weight": 1.5
        },
        {
          "source": "trend-1",
          "target": "tech-edge-ai",
          "type": "uses",
          "weight": 1.2
        },
        {
          "source": "trend-2",
          "target": "tech-homomorphic-encryption",
          "type": "uses",
          "weight": 1.0
        },
        {
          "source": "trend-2",
          "target": "tech-federated-learning",
          "type": "uses",
          "weight": 1.0
        }
      ],
      "nodes": [
        {
          "color": "#4a6de5",
          "data": {
            "assignees": ["Research Institute of Technology"],
            "authors": ["Dr. Sarah Johnson", "Dr. Michael Lee"],
            "country": "United States",
            "cpcs": ["G06N 20/00", "G06F 16/35"],
            "data_quality_score": 0.85,
            "domain": "Artificial Intelligence",
            "id": "AI2023-12345",
            "inventors": ["Dr. Sarah Johnson", "Dr. Michael Lee"],
            "ipcs": ["G06N 20/00", "G06F 16/35"],
            "keywords": ["federated learning", "privacy-preserving AI", "distributed training", "edge computing", "healthcare AI"],
            "knowledge_type": "Research Paper",
            "publication_date": "2023-08-15",
            "publishers": ["Tech Science Journal"],
            "related_titles": [
              "Advances in Federated Learning for Healthcare Applications",
              "Privacy-Preserving Machine Learning: A Survey",
              "Edge Computing for Distributed AI Systems"
            ],
            "similarity_score": 0.92,
            "subdomains": ["Machine Learning", "Distributed Computing"],
            "technologies": ["Federated Learning", "Edge AI", "Privacy-Preserving Machine Learning", "Neural Networks"],
            "title": "Privacy-Preserving Federated Learning Framework for Healthcare Applications"
          },
          "domain": "Artificial Intelligence",
          "id": "trend-1",
          "knowledge_type": "Research Paper",
          "publication_date": "2023-08-15",
          "similarity_score": 0.92,
          "size": 10,
          "title": "Privacy-Preserving Federated Learning Framework for Healthcare Applications",
          "type": "trend"
        },
        {
          "color": "#28a745",
          "data": {},
          "domain": "Artificial Intelligence",
          "id": "tech-federated-learning",
          "size": 8,
          "title": "Federated Learning",
          "type": "technology"
        },
        {
          "color": "#28a745",
          "data": {},
          "domain": "Artificial Intelligence",
          "id": "tech-edge-ai",
          "size": 8,
          "title": "Edge AI",
          "type": "technology"
        },
        {
          "color": "#4a6de5",
          "data": {
            "assignees": ["Medical AI Solutions Inc."],
            "authors": ["Dr. Emily Roberts", "Dr. James Chen"],
            "country": "Canada",
            "cpcs": ["G16H 50/20", "G06N 20/00"],
            "data_quality_score": 0.78,
            "domain": "Healthcare",
            "id": "HEALTH2023-54321",
            "inventors": ["Dr. Emily Roberts", "Dr. James Chen", "Dr. Lisa Wong"],
            "ipcs": ["G16H 50/20", "G06N 20/00"],
            "keywords": ["medical imaging", "diagnostic AI", "healthcare privacy", "secure computation", "medical data"],
            "knowledge_type": "Patent",
            "publication_date": "2023-05-22",
            "publishers": ["World Patent Office"],
            "related_titles": [
              "Secure Medical Image Analysis System",
              "Privacy-Preserving AI for Electronic Health Records",
              "Distributed Medical Diagnostics Platform"
            ],
            "similarity_score": 0.85,
            "subdomains": ["Medical Imaging", "Diagnostics"],
            "technologies": ["Secure Multi-party Computation", "Differential Privacy", "Medical Imaging AI", "Federated Learning"],
            "title": "Secure and Privacy-Preserving Medical Image Analysis System"
          },
          "domain": "Healthcare",
          "id": "trend-2",
          "knowledge_type": "Patent",
          "publication_date": "2023-05-22",
          "similarity_score": 0.85,
          "size": 10,
          "title": "Secure and Privacy-Preserving Medical Image Analysis System",
          "type": "trend"
        },
        {
          "color": "#28a745",
          "data": {},
          "domain": "Security",
          "id": "tech-homomorphic-encryption",
          "size": 8,
          "title": "Homomorphic Encryption",
          "type": "technology"
        }
      ]
    },
    "graph_insights": {
      "central_technologies": {
        "analysis": "Federated Learning emerges as the most central technology in this knowledge graph, appearing in multiple high-relevance research papers and patents across both AI and healthcare domains. This technology is experiencing significant growth due to its unique ability to address the fundamental tension between leveraging collective data intelligence and preserving privacy. Edge AI appears as a complementary technology, enabling distributed computation at the network edge and reinforcing the privacy-preserving paradigm. Together, these technologies form a privacy-centric computational framework particularly valuable in regulated domains like healthcare.",
        "technologies": [
          {
            "analysis": "Federated Learning is the most connected technology in the knowledge graph, appearing in high-quality research from both AI specialists and healthcare researchers. Its centrality indicates its role as a bridge technology that connects privacy concerns with advanced AI applications.",
            "impact": "High impact across regulated industries and sensitive data domains",
            "title": "Federated Learning"
          },
          {
            "analysis": "Edge AI shows strong connectivity to Federated Learning, creating a complementary technical framework that enables distributed computation while minimizing centralized data exposure.",
            "impact": "Medium-high impact, particularly in IoT and mobile healthcare applications",
            "title": "Edge AI"
          },
          {
            "analysis": "Homomorphic Encryption appears as a specialized security technology that enables computation on encrypted data, further enhancing privacy preservation in medical applications.",
            "impact": "Medium impact, primarily in high-security healthcare applications",
            "title": "Homomorphic Encryption"
          }
        ]
      },
      "cross_domain_connections": {
        "analysis": "The knowledge graph reveals significant cross-domain connections between Artificial Intelligence and Healthcare, mediated primarily through privacy-preserving technologies. This intersection represents a high-value innovation space where AI capabilities are being adapted to the strict privacy and regulatory requirements of healthcare. The connections indicate a mature understanding of both domains, with technologies being specifically designed to address healthcare's unique constraints rather than simply applying generic AI solutions.",
        "opportunities": [
          {
            "connection": "AI and Healthcare via Federated Learning",
            "potential": "Development of privacy-preserving diagnostic systems that can learn from distributed medical data without compromising patient privacy or violating regulations like HIPAA and GDPR."
          },
          {
            "connection": "Security technologies adapted for Medical Imaging",
            "potential": "Creation of secure medical image analysis frameworks that maintain diagnostic accuracy while enabling multi-institution collaboration without data sharing."
          }
        ]
      },
      "innovation_pathways": {
        "analysis": "The knowledge graph indicates an emerging innovation pathway that begins with privacy-preserving AI research and progresses toward specialized healthcare applications. This pathway demonstrates how foundational AI technologies are being adapted to meet healthcare's specific needs through the integration of security technologies. The evolution shows increasing specialization and domain-specificity as technologies move from general AI research to healthcare implementation.",
        "implications": [
          {
            "implication": "Organizations investing in this space should combine AI expertise with healthcare domain knowledge and security/privacy specialization for maximum competitive advantage.",
            "path": "Research → Privacy Technology → Healthcare Application"
          },
          {
            "implication": "Regulatory expertise becomes increasingly important as innovations move closer to clinical implementation, suggesting the need for multi-disciplinary teams.",
            "path": "Privacy-Preserving Technology → Medical Imaging → Clinical Diagnostics"
          }
        ]
      }
    },
    "original_scout_data": {
      "data_from_source": [
        {
          "assignees": ["Research Institute of Technology"],
          "authors": ["Dr. Sarah Johnson", "Dr. Michael Lee"],
          "country": "United States",
          "cpcs": ["G06N 20/00", "G06F 16/35"],
          "data_quality_score": 0.85,
          "domain": "Artificial Intelligence",
          "id": "AI2023-12345",
          "inventors": ["Dr. Sarah Johnson", "Dr. Michael Lee"],
          "ipcs": ["G06N 20/00", "G06F 16/35"],
          "keywords": ["federated learning", "privacy-preserving AI", "distributed training", "edge computing", "healthcare AI"],
          "knowledge_type": "Research Paper",
          "publication_date": "2023-08-15",
          "publishers": ["Tech Science Journal"],
          "related_titles": [
            "Advances in Federated Learning for Healthcare Applications",
            "Privacy-Preserving Machine Learning: A Survey",
            "Edge Computing for Distributed AI Systems"
          ],
          "similarity_score": 0.92,
          "subdomains": ["Machine Learning", "Distributed Computing"],
          "technologies": ["Federated Learning", "Edge AI", "Privacy-Preserving Machine Learning", "Neural Networks"],
          "title": "Privacy-Preserving Federated Learning Framework for Healthcare Applications"
        },
        {
          "assignees": ["Medical AI Solutions Inc."],
          "authors": ["Dr. Emily Roberts", "Dr. James Chen"],
          "country": "Canada",
          "cpcs": ["G16H 50/20", "G06N 20/00"],
          "data_quality_score": 0.78,
          "domain": "Healthcare",
          "id": "HEALTH2023-54321",
          "inventors": ["Dr. Emily Roberts", "Dr. James Chen", "Dr. Lisa Wong"],
          "ipcs": ["G16H 50/20", "G06N 20/00"],
          "keywords": ["medical imaging", "diagnostic AI", "healthcare privacy", "secure computation", "medical data"],
          "knowledge_type": "Patent",
          "publication_date": "2023-05-22",
          "publishers": ["World Patent Office"],
          "related_titles": [
            "Secure Medical Image Analysis System",
            "Privacy-Preserving AI for Electronic Health Records",
            "Distributed Medical Diagnostics Platform"
          ],
          "similarity_score": 0.85,
          "subdomains": ["Medical Imaging", "Diagnostics"],
          "technologies": ["Secure Multi-party Computation", "Differential Privacy", "Medical Imaging AI", "Federated Learning"],
          "title": "Secure and Privacy-Preserving Medical Image Analysis System"
        }
      ],
      "insights": [
        "Federated learning is emerging as a leading approach for privacy-preserving AI, particularly in healthcare where data sensitivity is paramount",
        "The integration of edge computing with federated learning creates more efficient and scalable distributed AI systems",
        "Privacy-preserving techniques like differential privacy and secure multi-party computation are becoming essential components of AI systems in regulated industries",
        "Healthcare applications are driving significant innovation in privacy-preserving AI techniques",
        "Organizations are actively patenting methods that combine privacy protection with high-performance AI for sensitive data"
      ],
      "isData": true,
      "message": "Successfully generated insights.",
      "notes": "The convergence of federated learning and healthcare represents a significant opportunity area. The technologies enable AI to learn from distributed medical data without compromising patient privacy, addressing one of the key barriers to AI adoption in healthcare. Organizations investing in this space are positioning themselves at the intersection of two major trends: increased emphasis on data privacy and the growing application of AI in healthcare diagnostics and treatment planning.",
      "prompt": "federated learning healthcare applications",
      "recommendations": [
        "Consider investing in privacy-preserving AI techniques as they're becoming essential for working with sensitive data across industries",
        "Explore partnerships with healthcare institutions to develop federated learning applications that respect patient data privacy while enabling advanced AI diagnostics",
        "Monitor regulatory developments around AI and data privacy, as these will shape the adoption trajectory of federated learning technologies"
      ],
      "relevant_trends": [
        {
          "assignees": ["Research Institute of Technology"],
          "authors": ["Dr. Sarah Johnson", "Dr. Michael Lee"],
          "country": "United States",
          "cpcs": ["G06N 20/00", "G06F 16/35"],
          "data_quality_score": 0.85,
          "domain": "Artificial Intelligence",
          "id": "AI2023-12345",
          "inventors": ["Dr. Sarah Johnson", "Dr. Michael Lee"],
          "ipcs": ["G06N 20/00", "G06F 16/35"],
          "keywords": ["federated learning", "privacy-preserving AI", "distributed training", "edge computing", "healthcare AI"],
          "knowledge_type": "Research Paper",
          "publication_date": "2023-08-15",
          "publishers": ["Tech Science Journal"],
          "related_titles": [
            "Advances in Federated Learning for Healthcare Applications",
            "Privacy-Preserving Machine Learning: A Survey",
            "Edge Computing for Distributed AI Systems"
          ],
          "similarity_score": 0.92,
          "subdomains": ["Machine Learning", "Distributed Computing"],
          "technologies": ["Federated Learning", "Edge AI", "Privacy-Preserving Machine Learning", "Neural Networks"],
          "title": "Privacy-Preserving Federated Learning Framework for Healthcare Applications"
        },
        {
          "assignees": ["Medical AI Solutions Inc."],
          "authors": ["Dr. Emily Roberts", "Dr. James Chen"],
          "country": "Canada",
          "cpcs": ["G16H 50/20", "G06N 20/00"],
          "data_quality_score": 0.78,
          "domain": "Healthcare",
          "id": "HEALTH2023-54321",
          "inventors": ["Dr. Emily Roberts", "Dr. James Chen", "Dr. Lisa Wong"],
          "ipcs": ["G16H 50/20", "G06N 20/00"],
          "keywords": ["medical imaging", "diagnostic AI", "healthcare privacy", "secure computation", "medical data"],
          "knowledge_type": "Patent",
          "publication_date": "2023-05-22",
          "publishers": ["World Patent Office"],
          "related_titles": [
            "Secure Medical Image Analysis System",
            "Privacy-Preserving AI for Electronic Health Records",
            "Distributed Medical Diagnostics Platform"
          ],
          "similarity_score": 0.85,
          "subdomains": ["Medical Imaging", "Diagnostics"],
          "technologies": ["Secure Multi-party Computation", "Differential Privacy", "Medical Imaging AI", "Federated Learning"],
          "title": "Secure and Privacy-Preserving Medical Image Analysis System"
        },
        {
          "assignees": ["DataSecure Technologies"],
          "authors": ["Dr. Robert Chang", "Dr. Maria Garcia"],
          "country": "Germany",
          "cpcs": ["G06F 21/62", "G06N 20/00"],
          "data_quality_score": 0.82,
          "domain": "Data Security",
          "id": "SECURITY2023-78901",
          "inventors": ["Dr. Robert Chang", "Dr. Maria Garcia"],
          "ipcs": ["G06F 21/62", "G06N 20/00"],
          "keywords": ["privacy-enhancing technologies", "federated learning", "encrypted computation", "data anonymization", "GDPR compliance"],
          "knowledge_type": "Patent",
          "publication_date": "2023-02-10",
          "publishers": ["European Patent Office"],
          "related_titles": [
            "GDPR-Compliant AI Training Framework",
            "Anonymization Techniques for Machine Learning",
            "Secure Multi-party Computing Systems"
          ],
          "similarity_score": 0.79,
          "subdomains": ["Privacy Technology", "Regulatory Compliance"],
          "technologies": ["Homomorphic Encryption", "Federated Learning", "Data Anonymization", "Secure Enclaves"],
          "title": "Privacy-Enhancing System for GDPR-Compliant AI Model Training"
        }
      ],
      "response_to_user_prompt": "Federated learning is rapidly emerging as a critical technology for healthcare applications, addressing the fundamental tension between leveraging AI for medical advancements and protecting sensitive patient data. The search results reveal significant research and patenting activity in this space, with major innovations focused on privacy-preserving federated learning frameworks specifically designed for healthcare contexts. Key applications include medical imaging analysis, diagnostic support systems, and electronic health record analysis—all leveraging federated learning to enable AI training across distributed datasets without centralizing sensitive patient information. Organizations working in this field are developing sophisticated approaches that combine federated learning with complementary privacy technologies like differential privacy, secure multi-party computation, and homomorphic encryption to create comprehensive privacy-preserving AI systems. This trend is likely to accelerate as healthcare regulations around data privacy continue to tighten globally, while simultaneously the demand for advanced AI applications in medicine grows.",
      "source": "neo4j",
      "trend_summary": "The retrieved data highlights significant research and development activity in privacy-preserving federated learning for healthcare applications. Major contributions include frameworks for medical image analysis, secure model training systems, and GDPR-compliant approaches. Leading organizations in both academia and industry are actively developing these technologies, with a particular focus on combining federated learning with techniques like differential privacy, homomorphic encryption, and secure multi-party computation. There's a notable trend toward edge-based implementations that can operate within existing healthcare IT infrastructures."
    },
    "s_curve_data": {
      "domains": ["Artificial Intelligence", "Healthcare", "Data Security"],
      "max_year": 2023,
      "min_year": 2019,
      "technologies": [
        {
          "data": [
            {
              "count": 3,
              "cumulative": 3,
              "year": 2019
            },
            {
              "count": 5,
              "cumulative": 8,
              "year": 2020
            },
            {
              "count": 12,
              "cumulative": 20,
              "year": 2021
            },
            {
              "count": 23,
              "cumulative": 43,
              "year": 2022
            },
            {
              "count": 42,
              "cumulative": 85,
              "year": 2023
            }
          ],
          "domains": ["Artificial Intelligence", "Healthcare", "Data Security"],
          "growth_data": [
            {
              "growth": 1.67,
              "year": 2020
            },
            {
              "growth": 1.5,
              "year": 2021
            },
            {
              "growth": 1.15,
              "year": 2022
            },
            {
              "growth": 0.98,
              "year": 2023
            }
          ],
          "stage": "growth",
          "technology": "Federated Learning",
          "total_mentions": 85
        },
        {
          "data": [
            {
              "count": 1,
              "cumulative": 1,
              "year": 2019
            },
            {
              "count": 4,
              "cumulative": 5,
              "year": 2020
            },
            {
              "count": 7,
              "cumulative": 12,
              "year": 2021
            },
            {
              "count": 15,
              "cumulative": 27,
              "year": 2022
            },
            {
              "count": 28,
              "cumulative": 55,
              "year": 2023
            }
          ],
          "domains": ["Artificial Intelligence", "Healthcare"],
          "growth_data": [
            {
              "growth": 4.0,
              "year": 2020
            },
            {
              "growth": 1.4,
              "year": 2021
            },
            {
              "growth": 1.25,
              "year": 2022
            },
            {
              "growth": 1.04,
              "year": 2023
            }
          ],
          "stage": "growth",
          "technology": "Edge AI",
          "total_mentions": 55
        },
        {
          "data": [
            {
              "count": 2,
              "cumulative": 2,
              "year": 2019
            },
            {
              "count": 3,
              "cumulative": 5,
              "year": 2020
            },
            {
              "count": 6,
              "cumulative": 11,
              "year": 2021
            },
            {
              "count": 10,
              "cumulative": 21,
              "year": 2022
            },
            {
              "count": 18,
              "cumulative": 39,
              "year": 2023
            }
          ],
          "domains": ["Data Security", "Healthcare"],
          "growth_data": [
            {
              "growth": 1.5,
              "year": 2020
            },
            {
              "growth": 1.2,
              "year": 2021
            },
            {
              "growth": 0.91,
              "year": 2022
            },
            {
              "growth": 0.86,
              "year": 2023
            }
          ],
          "stage": "maturity",
          "technology": "Homomorphic Encryption",
          "total_mentions": 39
        }
      ],
      "years": [2019, 2020, 2021, 2022, 2023]
    },
    "timestamp": 1713819420
  };

  document.getElementById("analyst-data").value = JSON.stringify(template, null, 2);
  logToConsole("Analyst data template loaded", "info");
}

/**
 * Handle file upload for company profile
 */
function handleCompanyFileUpload(input) {
  if (!input.files || input.files.length === 0) return;
  
  const file = input.files[0];
  if (file.type !== "application/json") {
    showToast("Please upload a JSON file");
    logToConsole("Invalid file type. Expected JSON", "error");
    return;
  }
  
  const fileNameDisplay = document.getElementById("company-filename");
  fileNameDisplay.textContent = file.name;
  
  // Read the file
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Validate JSON
      const content = JSON.parse(e.target.result);
      
      // Update textarea
      document.getElementById("company-profile").value = JSON.stringify(content, null, 2);
      logToConsole("Company profile file loaded successfully", "info");
    } catch (e) {
      showToast("Invalid JSON file");
      logToConsole("Error parsing JSON file: " + e.message, "error");
    }
  };
  
  reader.readAsText(file);
}

/**
 * Handle file upload for competitor data
 */
function handleCompetitorFileUpload(input) {
  if (!input.files || input.files.length === 0) return;
  
  const file = input.files[0];
  if (file.type !== "application/json") {
    showToast("Please upload a JSON file");
    logToConsole("Invalid file type. Expected JSON", "error");
    return;
  }
  
  const fileNameDisplay = document.getElementById("competitor-filename");
  fileNameDisplay.textContent = file.name;
  
  // Read the file
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Validate JSON
      const content = JSON.parse(e.target.result);
      
      // Update textarea
      document.getElementById("competitor-data").value = JSON.stringify(content, null, 2);
      logToConsole("Competitor data file loaded successfully", "info");
    } catch (e) {
      showToast("Invalid JSON file");
      logToConsole("Error parsing JSON file: " + e.message, "error");
    }
  };
  
  reader.readAsText(file);
}

/**
 * Handle file upload for analyst data
 */
function handleAnalystFileUpload(input) {
  if (!input.files || input.files.length === 0) return;
  
  const file = input.files[0];
  if (file.type !== "application/json") {
    showToast("Please upload a JSON file");
    logToConsole("Invalid file type. Expected JSON", "error");
    return;
  }
  
  const fileNameDisplay = document.getElementById("analyst-filename");
  fileNameDisplay.textContent = file.name;
  
  // Read the file
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Validate JSON
      const content = JSON.parse(e.target.result);
      
      // Update textarea
      document.getElementById("analyst-data").value = JSON.stringify(content, null, 2);
      logToConsole("Analyst data file loaded successfully", "info");
    } catch (e) {
      showToast("Invalid JSON file");
      logToConsole("Error parsing JSON file: " + e.message, "error");
    }
  };
  
  reader.readAsText(file);
}