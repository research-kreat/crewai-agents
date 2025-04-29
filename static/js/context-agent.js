function loadAnalystResultsFromLocalStorage() {
  try {
    const storedAnalyst = localStorage.getItem("analystResultsIndex");
    if (storedAnalyst) {
      const indexData = JSON.parse(storedAnalyst);
      analystResults = [];
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
      const storedScout = localStorage.getItem("scoutResultsIndex");
      if (!storedScout) return;
      const scoutIndexData = JSON.parse(storedScout);
      scoutIndexData.forEach((item) => {
        const storedData = localStorage.getItem(`scoutResult_${item.id}`);
        if (storedData) {
          const scoutData = JSON.parse(storedData);
          const analystResult = {
            id: "analyst-" + item.id,
            timestamp: item.timestamp,
            date: item.date,
            prompt: item.prompt,
            data: {
              original_scout_data: scoutData,
              graph_data: { nodes: [], links: [] },
              graph_insights: {},
            },
          };
          analystResults.push(analystResult);
        }
      });
      logToConsole(
        `Converted ${analystResults.length} scout results to analyst format`,
        "system"
      );
    }
    updateAnalystSelect();
  } catch (e) {
    logToConsole(`Error loading from localStorage: ${e.message}`, "error");
  }
}

function updateAnalystSelect() {
  const selectElement = document.getElementById("analyst-select");
  if (!selectElement) return;
  while (selectElement.options.length > 1) {
    selectElement.remove(1);
  }
  const sortedResults = [...analystResults].sort((a, b) => {
    return (
      new Date(b.date) - new Date(a.date) ||
      b.timestamp.localeCompare(a.timestamp)
    );
  });
  sortedResults.forEach((result) => {
    const option = document.createElement("option");
    option.value = result.id;
    const promptDisplay =
      result.prompt.length > 40
        ? result.prompt.substring(0, 40) + "..."
        : result.prompt;
    option.textContent = `${result.date} - ${promptDisplay}`;
    selectElement.appendChild(option);
  });
  logToConsole("Analyst select dropdown updated", "system");
}

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

function runContextAnalysis() {
  const companyProfileText = document.getElementById("company-profile").value;
  const competitorDataText = document.getElementById("competitor-data").value;
  const analystDataText = document.getElementById("analyst-data").value;
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
  document.getElementById("loading").classList.remove("hidden");
  document.getElementById("no-results").classList.add("hidden");
  document.getElementById("results-container").classList.add("hidden");
  handleButtonState("#analyze-button", !0, "Analyzing...");
  logToConsole("Starting context analysis...", "info");
  const requestBody = {
    company_profile: companyProfile,
    competitor_data: competitorData || null,
    analyst_data: analystData,
  };
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
      document.getElementById("loading").classList.add("hidden");
      logToConsole("Context analysis complete", "info");
      lastAnalysisResult = data;
      updateResultsUI(data);
      document.getElementById("no-results").classList.add("hidden");
      document.getElementById("results-container").classList.remove("hidden");
      saveAnalysisToLocalStorage(data);
      handleButtonState("#analyze-button", !1);
    })
    .catch((error) => {
      document.getElementById("loading").classList.add("hidden");
      logToConsole(`Analysis error: ${error}`, "error");
      showToast(`Error: ${error.message}`);
      handleButtonState("#analyze-button", !1);
    });
}

function updateResultsUI(data) {
  if (!data || !data.context_analysis) {
    logToConsole("Invalid analysis data received", "error");
    return;
  }
  const context = data.context_analysis;
  const overall = data.overall_assessment;
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
  const considerationsList = document.getElementById("considerations-list");
  considerationsList.innerHTML = overall.key_considerations
    .map((item) => `<li>${item}</li>`)
    .join("");
  const nextStepsList = document.getElementById("next-steps-list");
  nextStepsList.innerHTML = overall.next_steps
    .map((item) => `<li>${item}</li>`)
    .join("");
  const strategicScore = document.getElementById("strategic-alignment-score");
  strategicScore.textContent = context.strategic_alignment.score.toFixed(2);
  updateScoreBadgeClass(strategicScore, context.strategic_alignment.score);
  const alignedPrioritiesList = document.getElementById("aligned-priorities");
  alignedPrioritiesList.innerHTML =
    context.strategic_alignment.aligned_priorities
      .map(
        (item) => `<li>
      <div class="panel-item">
        <span class="panel-label">${item.priority}</span>
        <span class="panel-value">Relevance: ${item.relevance.toFixed(2)}</span>
      </div>
    </li>`
      )
      .join("");
  document.getElementById("strategic-rationale").textContent =
    context.strategic_alignment.rationale;
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
        (item) => `<li>
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
      (item) => `<li>
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
      (item) => `<li>
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
        (item) => `<li>
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
      (item) => `<li>
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

function updateScoreBadgeClass(element, score) {
  element.classList.remove("score-high", "score-medium", "score-low");
  if (score >= 0.7) {
    element.classList.add("score-high");
  } else if (score >= 0.4) {
    element.classList.add("score-medium");
  } else {
    element.classList.add("score-low");
  }
}

function saveAnalysisToLocalStorage(data) {
  try {
    const analysisHistory = JSON.parse(
      localStorage.getItem("contextAnalysisHistory") || "[]"
    );
    const analysisWithTimestamp = {
      ...data,
      timestamp: new Date().toISOString(),
      id: "analysis-" + Date.now(),
    };
    analysisHistory.push(analysisWithTimestamp);
    if (analysisHistory.length > 10) {
      analysisHistory.shift();
    }
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
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("analyst-select")) {
    logToConsole("Context Agent initialized", "system");
    loadAnalystResultsFromLocalStorage();
    if (typeof io !== "undefined") {
      connectSocket();
    }
  }
});
function loadCompanyTemplate() {
  const template = {
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
  document.getElementById("company-profile").value = JSON.stringify(
    template,
    null,
    2
  );
  logToConsole("Company profile template loaded", "info");
}

function loadCompetitorTemplate() {
  const template = [
    {
      name: "Tata Motors Ltd.",
      founded: "1945-09-01",
      founders: ["Jehangir Ratanji Dadabhoy Tata"],
      headquarters: "Mumbai, Maharashtra, India",
      type: "Public",
      industry: [
        "Automotive",
        "Commercial Vehicles",
        "Passenger Vehicles",
        "Electric Vehicles",
      ],
      domain: "Mobility",
      website: "https://www.tatamotors.com",
      numberOfEmployees: 75000,
      products: [
        "Passenger Cars",
        "SUVs",
        "Commercial Vehicles",
        "Electric Vehicles",
        "Defence Vehicles",
        "Trucks",
        "Buses",
      ],
      focusAreas: [
        "Electric Vehicle Technology",
        "Autonomous Driving",
        "Connected Vehicles",
        "Alternative Fuel Solutions",
        "Lightweight Materials",
        "Advanced Safety Systems",
      ],
      initiatives: [
        "EV Expansion Plan",
        "Jaguar Land Rover Electrification",
        "Commercial EV Fleet Solutions",
      ],
      researchAndDevelopment: {
        facilities: [
          "Tata Motors European Technical Centre (UK)",
          "Engineering Research Centre (Pune)",
          "Tata Motors Research Centre (Jamshedpur)",
        ],
        recentInvestmentsUSD: 2100000000,
        annualInvestment: {
          amountINR: 42000000000,
          fiscalYear: "2022-23",
          percentageOfTurnover: 5.8,
        },
      },
      latestNews: [
        {
          title: "Tata Motors achieves 50,000 EV sales milestone in India",
          url: "https://auto.economictimes.indiatimes.com/news/passenger-vehicle/cars/tata-motors-achieves-50000-ev-sales-milestone-in-india/98761234",
        },
        {
          title:
            "Tata Motors launches new range of electric commercial vehicles",
          url: "https://www.livemint.com/companies/news/tata-motors-launches-new-range-of-electric-commercial-vehicles-11678901234.html",
        },
        {
          title: "Tata Motors reports 18% growth in Q3 FY24 sales",
          url: "https://economictimes.indiatimes.com/industry/auto/auto-news/tata-motors-reports-18-growth-in-q3-fy24-sales/articleshow/106543210.cms",
        },
      ],
    },
    {
      name: "Ola Electric Mobility Pvt. Ltd.",
      founded: "2017-03-01",
      founders: ["Bhavish Aggarwal"],
      headquarters: "Bengaluru, Karnataka, India",
      type: "Private",
      industry: [
        "Electric Vehicles",
        "Battery Technology",
        "Charging Infrastructure",
        "Mobility Services",
      ],
      domain: "Mobility",
      website: "https://olaelectric.com",
      numberOfEmployees: 4000,
      products: [
        "Electric Scooters",
        "Electric Motorcycles",
        "Battery Packs",
        "Home Charging Solutions",
        "Hypercharger Network",
      ],
      focusAreas: [
        "Battery Technology",
        "Electric Vehicle Design",
        "Autonomous Capabilities",
        "Connected Mobility",
        "Charging Infrastructure",
        "Sustainable Manufacturing",
      ],
      initiatives: [
        "Futurefactory",
        "Hypercharger Network Expansion",
        "Battery Innovation Centre",
      ],
      researchAndDevelopment: {
        facilities: [
          "Ola Electric R&D Centre (Bengaluru)",
          "Ola Advanced Technology Centre (UK)",
          "Battery Innovation Centre (Tamil Nadu)",
        ],
        recentInvestmentsUSD: 920000000,
        annualInvestment: {
          amountINR: 18000000000,
          fiscalYear: "2022-23",
          percentageOfTurnover: 12.5,
        },
      },
      latestNews: [
        {
          title: "Ola Electric files for IPO, aims to raise $1 billion",
          url: "https://www.livemint.com/companies/news/ola-electric-files-for-ipo-aims-to-raise-1-billion-11687654321.html",
        },
        {
          title:
            "Ola Electric unveils India's first locally-made lithium-ion cell",
          url: "https://auto.economictimes.indiatimes.com/news/auto-components/ola-electric-unveils-indias-first-locally-made-lithium-ion-cell/99123456",
        },
        {
          title: "Ola Electric crosses 300,000 units sales milestone",
          url: "https://economictimes.indiatimes.com/industry/renewables/ola-electric-crosses-300000-units-sales-milestone/articleshow/106789012.cms",
        },
      ],
    },
  ];
  document.getElementById("competitor-data").value = JSON.stringify(
    template,
    null,
    2
  );
  logToConsole("Competitor data template loaded", "info");
}

function loadAnalystTemplate() {
  const template = {
    date: "2025-04-23",
    graph_data: {
      links: [
        {
          source: "journals_MB-JRN-006",
          target: "keyword_electric_vehicles",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-006",
          target: "keyword_vehicle-to-grid",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-006",
          target: "keyword_v2g",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-006",
          target: "keyword_fleet_management",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-006",
          target: "keyword_grid_services",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "patents_MB-PAT-009",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance", "shared_keywords"],
          source: "journals_MB-JRN-006",
          target: "journals_MB-JRN-001",
          type: "related",
          weight: 1.3,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "patents_MB-PAT-002",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "patents_MB-PAT-020",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "patents_MB-PAT-012",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "journals_MB-JRN-004",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "patents_MB-PAT-013",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-006",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "patents_MB-PAT-009",
          target: "tech_electric_vehicles",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-009",
          target: "tech_power_electronics",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-009",
          target: "tech_wireless_charging",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-009",
          target: "keyword_electric_vehicle",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-009",
          target: "keyword_dynamic_charging",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-009",
          target: "keyword_wireless_power_transfer",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-009",
          target: "keyword_charging_infrastructure",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-009",
          target: "journals_MB-JRN-001",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: [
            "same_domain",
            "similar_relevance",
            "shared_technologies",
            "shared_keywords",
          ],
          source: "patents_MB-PAT-009",
          target: "patents_MB-PAT-002",
          type: "related",
          weight: 2,
        },
        {
          reasons: ["same_domain", "similar_relevance", "shared_keywords"],
          source: "patents_MB-PAT-009",
          target: "patents_MB-PAT-020",
          type: "related",
          weight: 1.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-009",
          target: "patents_MB-PAT-012",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-009",
          target: "journals_MB-JRN-004",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance", "shared_keywords"],
          source: "patents_MB-PAT-009",
          target: "patents_MB-PAT-013",
          type: "related",
          weight: 1.3,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-009",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-009",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "journals_MB-JRN-001",
          target: "keyword_electric_vehicles",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-001",
          target: "keyword_battery_degradation",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-001",
          target: "keyword_lithium-ion",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-001",
          target: "keyword_battery_lifetime",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-001",
          target: "keyword_usage_patterns",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-001",
          target: "patents_MB-PAT-002",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-001",
          target: "patents_MB-PAT-020",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-001",
          target: "patents_MB-PAT-012",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-001",
          target: "journals_MB-JRN-004",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-001",
          target: "patents_MB-PAT-013",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-001",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-001",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "patents_MB-PAT-002",
          target: "tech_battery_technology",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-002",
          target: "tech_thermal_management",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-002",
          target: "tech_electric_vehicles",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-002",
          target: "keyword_battery_cooling",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-002",
          target: "keyword_thermal_management",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-002",
          target: "keyword_electric_vehicle",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-002",
          target: "keyword_battery_longevity",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance", "shared_keywords"],
          source: "patents_MB-PAT-002",
          target: "patents_MB-PAT-020",
          type: "related",
          weight: 1.3,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-002",
          target: "patents_MB-PAT-012",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-002",
          target: "journals_MB-JRN-004",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance", "shared_keywords"],
          source: "patents_MB-PAT-002",
          target: "patents_MB-PAT-013",
          type: "related",
          weight: 1.3,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-002",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-002",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "patents_MB-PAT-020",
          target: "tech_computer_vision",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-020",
          target: "tech_robotics",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-020",
          target: "tech_electric_vehicle_charging",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-020",
          target: "keyword_electric_vehicle",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-020",
          target: "keyword_charging_infrastructure",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-020",
          target: "keyword_robotic_charging",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-020",
          target: "keyword_autonomous_charging",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-020",
          target: "patents_MB-PAT-012",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-020",
          target: "journals_MB-JRN-004",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance", "shared_keywords"],
          source: "patents_MB-PAT-020",
          target: "patents_MB-PAT-013",
          type: "related",
          weight: 1.3,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-020",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-020",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "patents_MB-PAT-012",
          target: "tech_connected_infrastructure",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-012",
          target: "tech_v2i_communication",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-012",
          target: "tech_edge_computing",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-012",
          target: "keyword_connected_vehicles",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-012",
          target: "keyword_v2i",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-012",
          target: "keyword_smart_infrastructure",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-012",
          target: "keyword_cooperative_perception",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-012",
          target: "journals_MB-JRN-004",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-012",
          target: "patents_MB-PAT-013",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-012",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-012",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "journals_MB-JRN-004",
          target: "keyword_commercial_vehicles",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-004",
          target: "keyword_zero_emission",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-004",
          target: "keyword_hydrogen_fuel_cell",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-004",
          target: "keyword_heavy-duty_transportation",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-004",
          target: "keyword_sustainable_mobility",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-004",
          target: "patents_MB-PAT-013",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-004",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-004",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "patents_MB-PAT-013",
          target: "tech_composite_materials",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-013",
          target: "tech_lightweight_structures",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-013",
          target: "tech_manufacturing_processes",
          type: "uses_technology",
          weight: 1,
        },
        {
          source: "patents_MB-PAT-013",
          target: "keyword_electric_vehicle",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-013",
          target: "keyword_carbon_fiber",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-013",
          target: "keyword_lightweight_materials",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "patents_MB-PAT-013",
          target: "keyword_battery_protection",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-013",
          target: "journals_MB-JRN-008",
          type: "related",
          weight: 0.8,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "patents_MB-PAT-013",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "journals_MB-JRN-008",
          target: "keyword_last-mile_logistics",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-008",
          target: "keyword_electric_delivery_vehicles",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-008",
          target: "keyword_life_cycle_assessment",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-008",
          target: "keyword_urban_freight",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-008",
          target: "keyword_sustainability",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          reasons: ["same_domain", "similar_relevance"],
          source: "journals_MB-JRN-008",
          target: "journals_MB-JRN-002",
          type: "related",
          weight: 0.8,
        },
        {
          source: "journals_MB-JRN-002",
          target: "keyword_autonomous_vehicles",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-002",
          target: "keyword_safety_assessment",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-002",
          target: "keyword_validation",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-002",
          target: "keyword_simulation",
          type: "has_keyword",
          weight: 0.7,
        },
        {
          source: "journals_MB-JRN-002",
          target: "keyword_physical_testing",
          type: "has_keyword",
          weight: 0.7,
        },
      ],
      nodes: [
        {
          color: "#4a6de5",
          data: {
            assignees: [],
            authors: [
              "Chang, Hyun-Joon",
              "Oliveira, Paulo",
              "Kramer, Sophia",
              "Ahmed, Farid",
              "Reynolds, Karen",
            ],
            country: "United States",
            cpcs: [],
            data_quality_score: 0.89,
            domain: "Mobility",
            id: "journals_MB-JRN-006",
            inventors: [],
            ipcs: [],
            keywords: [
              "electric vehicles",
              "vehicle-to-grid",
              "V2G",
              "fleet management",
              "grid services",
            ],
            knowledge_type: "journal",
            publication_date: "2023-02-20",
            publishers: ["IEEE Transactions on Smart Grid"],
            related_titles: [
              "Electric Vehicle Battery Thermal Management System",
              "Solid-State Battery with Silicon-Carbon Composite Anode",
              "Dynamic Wireless Charging System for Electric Vehicles",
              "Robotic Autonomous Charging System for Electric Vehicles",
              "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
              "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            ],
            similarity_score: 0.7814,
            subdomains: ["Electrification", "Energy Systems"],
            summary_text: "No summary available",
            technologies: [],
            title:
              "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
          },
          domain: "Mobility",
          id: "journals_MB-JRN-006",
          knowledge_type: "journal",
          publication_date: "2023-02-20",
          similarity_score: 0.7814,
          size: 21.721,
          title:
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: ["ElectroRoad Systems"],
            authors: [],
            country: "United States",
            cpcs: ["B60L53/12", "B60L53/30", "H02J50/12"],
            data_quality_score: 0.9,
            domain: "Mobility",
            id: "patents_MB-PAT-009",
            inventors: [
              "Choi, Sung-Yul",
              "Bennett, Rebecca",
              "Lombardi, Francesco",
            ],
            ipcs: ["B60L53/12", "B60L53/30", "H02J50/12"],
            keywords: [
              "electric vehicle",
              "dynamic charging",
              "wireless power transfer",
              "charging infrastructure",
            ],
            knowledge_type: "patent",
            publication_date: "2021-05-20",
            publishers: [],
            related_titles: [
              "Robotic Autonomous Charging System for Electric Vehicles",
              "Electric Vehicle Battery Thermal Management System",
              "Solid-State Battery with Silicon-Carbon Composite Anode",
              "Lightweight Composite Materials for Electric Vehicle Structures",
              "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
              "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
              "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
              "Smart Infrastructure for Connected and Autonomous Vehicles",
              "Hyperloop Capsule Suspension and Propulsion System",
              "Urban Air Mobility: Infrastructure Requirements and Operational Challenges",
              "Hydrogen Fuel Cell System with Enhanced Power Density",
            ],
            similarity_score: 0.7524,
            subdomains: ["Electrification", "Infrastructure"],
            summary_text: "No summary available",
            technologies: [
              "electric vehicles",
              "power electronics",
              "wireless charging",
            ],
            title: "Dynamic Wireless Charging System for Electric Vehicles",
          },
          domain: "Mobility",
          id: "patents_MB-PAT-009",
          knowledge_type: "patent",
          publication_date: "2021-05-20",
          similarity_score: 0.7524,
          size: 21.286,
          title: "Dynamic Wireless Charging System for Electric Vehicles",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: [],
            authors: [
              "Peterson, Sarah B.",
              "Zhang, Tianqi",
              "Garcia, Miguel",
              "Johnson, Amanda",
              "Kumar, Pradeep",
            ],
            country: "Netherlands",
            cpcs: [],
            data_quality_score: 0.93,
            domain: "Mobility",
            id: "journals_MB-JRN-001",
            inventors: [],
            ipcs: [],
            keywords: [
              "electric vehicles",
              "battery degradation",
              "lithium-ion",
              "battery lifetime",
              "usage patterns",
            ],
            knowledge_type: "journal",
            publication_date: "2022-06-10",
            publishers: ["Journal of Power Sources"],
            related_titles: [
              "Electric Vehicle Battery Thermal Management System",
              "Solid-State Battery with Silicon-Carbon Composite Anode",
              "Dynamic Wireless Charging System for Electric Vehicles",
              "Robotic Autonomous Charging System for Electric Vehicles",
              "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
              "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            ],
            similarity_score: 0.7515,
            subdomains: ["Electrification", "Battery Technology"],
            summary_text: "No summary available",
            technologies: [],
            title:
              "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
          },
          domain: "Mobility",
          id: "journals_MB-JRN-001",
          knowledge_type: "journal",
          publication_date: "2022-06-10",
          similarity_score: 0.7515,
          size: 21.2725,
          title:
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: ["EnergyTech Solutions"],
            authors: [],
            country: "United States",
            cpcs: ["H01M10/60", "B60L58/26", "H01M10/6556"],
            data_quality_score: 0.94,
            domain: "Mobility",
            id: "patents_MB-PAT-002",
            inventors: ["Chen, Jian", "Patel, Nisha", "Schmidt, Erik"],
            ipcs: ["H01M10/60", "B60L58/26", "H01M10/6556"],
            keywords: [
              "battery cooling",
              "thermal management",
              "electric vehicle",
              "battery longevity",
            ],
            knowledge_type: "patent",
            publication_date: "2021-08-12",
            publishers: [],
            related_titles: [
              "Dynamic Wireless Charging System for Electric Vehicles",
              "Solid-State Battery with Silicon-Carbon Composite Anode",
              "Lightweight Composite Materials for Electric Vehicle Structures",
              "Robotic Autonomous Charging System for Electric Vehicles",
              "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
              "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
              "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
              "Advanced LiDAR System for Autonomous Vehicle Navigation",
              "Machine Learning System for Predictive Vehicle Maintenance",
              "Adaptive Vehicle Crash Avoidance System",
            ],
            similarity_score: 0.7413,
            subdomains: ["Automotive Technology", "Electrification"],
            summary_text: "No summary available",
            technologies: [
              "battery technology",
              "thermal management",
              "electric vehicles",
            ],
            title: "Electric Vehicle Battery Thermal Management System",
          },
          domain: "Mobility",
          id: "patents_MB-PAT-002",
          knowledge_type: "patent",
          publication_date: "2021-08-12",
          similarity_score: 0.7413,
          size: 21.1195,
          title: "Electric Vehicle Battery Thermal Management System",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: ["AutoCharge Robotics"],
            authors: [],
            country: "United States",
            cpcs: ["B60L53/30", "B25J9/1633", "G06V10/253"],
            data_quality_score: 0.88,
            domain: "Mobility",
            id: "patents_MB-PAT-020",
            inventors: ["Lindholm, Erik", "Gupta, Anjali", "Torres, Miguel"],
            ipcs: ["B60L53/30", "B25J9/16", "G06V10/25"],
            keywords: [
              "electric vehicle",
              "charging infrastructure",
              "robotic charging",
              "autonomous charging",
            ],
            knowledge_type: "patent",
            publication_date: "2023-04-06",
            publishers: [],
            related_titles: [
              "Dynamic Wireless Charging System for Electric Vehicles",
              "Electric Vehicle Battery Thermal Management System",
              "Solid-State Battery with Silicon-Carbon Composite Anode",
              "Lightweight Composite Materials for Electric Vehicle Structures",
              "Modular Autonomous Delivery Robot System",
              "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
              "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
              "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
              "Autonomous Navigation in Unstructured Dynamic Environments: Challenges and Recent Advances",
            ],
            similarity_score: 0.7373,
            subdomains: ["Electrification", "Robotics"],
            summary_text: "No summary available",
            technologies: [
              "computer vision",
              "robotics",
              "electric vehicle charging",
            ],
            title: "Robotic Autonomous Charging System for Electric Vehicles",
          },
          domain: "Mobility",
          id: "patents_MB-PAT-020",
          knowledge_type: "patent",
          publication_date: "2023-04-06",
          similarity_score: 0.7373,
          size: 21.0595,
          title: "Robotic Autonomous Charging System for Electric Vehicles",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: ["SmartRoad Technologies"],
            authors: [],
            country: "United States",
            cpcs: ["G08G1/0104", "H04W4/44", "G08G1/166"],
            data_quality_score: 0.89,
            domain: "Mobility",
            id: "patents_MB-PAT-012",
            inventors: ["Zhang, Wei", "Thompson, Sarah", "Ochieng, Washington"],
            ipcs: ["G08G1/01", "H04W4/44", "G08G1/16"],
            keywords: [
              "connected vehicles",
              "V2I",
              "smart infrastructure",
              "cooperative perception",
            ],
            knowledge_type: "patent",
            publication_date: "2022-07-28",
            publishers: [],
            related_titles: [
              "V2X Communication System with Enhanced Security Protocol",
              "Adaptive Vehicle Crash Avoidance System",
              "Dynamic Wireless Charging System for Electric Vehicles",
              "Hyperloop Capsule Suspension and Propulsion System",
              "Urban Air Mobility: Infrastructure Requirements and Operational Challenges",
            ],
            similarity_score: 0.7172,
            subdomains: ["Connected Vehicles", "Infrastructure"],
            summary_text: "No summary available",
            technologies: [
              "connected infrastructure",
              "V2I communication",
              "edge computing",
            ],
            title: "Smart Infrastructure for Connected and Autonomous Vehicles",
          },
          domain: "Mobility",
          id: "patents_MB-PAT-012",
          knowledge_type: "patent",
          publication_date: "2022-07-28",
          similarity_score: 0.7172,
          size: 20.758,
          title: "Smart Infrastructure for Connected and Autonomous Vehicles",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: [],
            authors: [
              "Wang, Jianlong",
              "Singh, Rajveer",
              "Müller, Kristina",
              "Ibrahim, Omar",
              "Davis, Peter",
            ],
            country: "United Kingdom",
            cpcs: [],
            data_quality_score: 0.92,
            domain: "Mobility",
            id: "journals_MB-JRN-004",
            inventors: [],
            ipcs: [],
            keywords: [
              "commercial vehicles",
              "zero emission",
              "hydrogen fuel cell",
              "heavy-duty transportation",
              "sustainable mobility",
            ],
            knowledge_type: "journal",
            publication_date: "2021-06-15",
            publishers: ["Progress in Energy and Combustion Science"],
            related_titles: [
              "Hydrogen Fuel Cell System with Enhanced Power Density",
              "Adaptive Aerodynamic System for Commercial Vehicles",
            ],
            similarity_score: 0.7156,
            subdomains: ["Alternative Powertrains", "Commercial Vehicles"],
            summary_text: "No summary available",
            technologies: [],
            title:
              "A Comprehensive Review of Hydrogen Fuel Cell Technologies for Heavy-Duty Transportation",
          },
          domain: "Mobility",
          id: "journals_MB-JRN-004",
          knowledge_type: "journal",
          publication_date: "2021-06-15",
          similarity_score: 0.7156,
          size: 20.734,
          title:
            "A Comprehensive Review of Hydrogen Fuel Cell Technologies for Heavy-Duty Transportation",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: ["LightweightEV Materials"],
            authors: [],
            country: "United States",
            cpcs: ["B29C70/086", "B60K1/04", "B60R16/04"],
            data_quality_score: 0.9,
            domain: "Mobility",
            id: "patents_MB-PAT-013",
            inventors: ["Wu, Hong", "Johannson, Lars", "Matthews, Catherine"],
            ipcs: ["B29C70/08", "B60K1/04", "B60R16/04"],
            keywords: [
              "electric vehicle",
              "carbon fiber",
              "lightweight materials",
              "battery protection",
            ],
            knowledge_type: "patent",
            publication_date: "2021-12-09",
            publishers: [],
            related_titles: [
              "Electric Vehicle Battery Thermal Management System",
              "Solid-State Battery with Silicon-Carbon Composite Anode",
              "Dynamic Wireless Charging System for Electric Vehicles",
              "Robotic Autonomous Charging System for Electric Vehicles",
            ],
            similarity_score: 0.7146,
            subdomains: ["Materials Technology", "Vehicle Structures"],
            summary_text: "No summary available",
            technologies: [
              "composite materials",
              "lightweight structures",
              "manufacturing processes",
            ],
            title:
              "Lightweight Composite Materials for Electric Vehicle Structures",
          },
          domain: "Mobility",
          id: "patents_MB-PAT-013",
          knowledge_type: "patent",
          publication_date: "2021-12-09",
          similarity_score: 0.7146,
          size: 20.719,
          title:
            "Lightweight Composite Materials for Electric Vehicle Structures",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: [],
            authors: [
              "Kaplan, Eleanor",
              "Figliozzi, Miguel",
              "Holguín-Veras, José",
              "Zhang, Renshu",
              "Baumgartner, Michael",
            ],
            country: "Netherlands",
            cpcs: [],
            data_quality_score: 0.91,
            domain: "Mobility",
            id: "journals_MB-JRN-008",
            inventors: [],
            ipcs: [],
            keywords: [
              "last-mile logistics",
              "electric delivery vehicles",
              "life cycle assessment",
              "urban freight",
              "sustainability",
            ],
            knowledge_type: "journal",
            publication_date: "2022-12-08",
            publishers: ["Journal of Cleaner Production"],
            related_titles: [
              "Electric Vehicle Battery Thermal Management System",
              "Solid-State Battery with Silicon-Carbon Composite Anode",
              "Dynamic Wireless Charging System for Electric Vehicles",
              "Robotic Autonomous Charging System for Electric Vehicles",
              "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
              "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
              "Modular Autonomous Delivery Robot System",
            ],
            similarity_score: 0.7045,
            subdomains: ["Electrification", "Last-Mile Delivery"],
            summary_text: "No summary available",
            technologies: [],
            title:
              "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
          },
          domain: "Mobility",
          id: "journals_MB-JRN-008",
          knowledge_type: "journal",
          publication_date: "2022-12-08",
          similarity_score: 0.7045,
          size: 20.567500000000003,
          title:
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
          type: "trend",
        },
        {
          color: "#4a6de5",
          data: {
            assignees: [],
            authors: [
              "Kim, Jiyong",
              "Martínez, Carlos",
              "Frazzoli, Emilio",
              "Seshia, Sanjit A.",
              "Tomizuka, Masayoshi",
            ],
            country: "United States",
            cpcs: [],
            data_quality_score: 0.94,
            domain: "Mobility",
            id: "journals_MB-JRN-002",
            inventors: [],
            ipcs: [],
            keywords: [
              "autonomous vehicles",
              "safety assessment",
              "validation",
              "simulation",
              "physical testing",
            ],
            knowledge_type: "journal",
            publication_date: "2021-10-22",
            publishers: [
              "IEEE Transactions on Intelligent Transportation Systems",
            ],
            related_titles: [
              "Adaptive Vehicle Crash Avoidance System",
              "Advanced LiDAR System for Autonomous Vehicle Navigation",
              "Modular Autonomous Delivery Robot System",
              "Autonomous Navigation in Unstructured Dynamic Environments: Challenges and Recent Advances",
            ],
            similarity_score: 0.6963,
            subdomains: ["Autonomous Systems", "Vehicle Safety"],
            summary_text: "No summary available",
            technologies: [],
            title:
              "Safety Assessment Framework for Autonomous Vehicles: Combining Virtual and Physical Testing",
          },
          domain: "Mobility",
          id: "journals_MB-JRN-002",
          knowledge_type: "journal",
          publication_date: "2021-10-22",
          similarity_score: 0.6963,
          size: 20.444499999999998,
          title:
            "Safety Assessment Framework for Autonomous Vehicles: Combining Virtual and Physical Testing",
          type: "trend",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_electric_vehicles",
          size: 6,
          title: "electric vehicles",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_vehicle-to-grid",
          size: 6,
          title: "vehicle-to-grid",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_v2g",
          size: 6,
          title: "V2G",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_fleet_management",
          size: 6,
          title: "fleet management",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_grid_services",
          size: 6,
          title: "grid services",
          type: "keyword",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_electric_vehicles",
          size: 8,
          title: "electric vehicles",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_power_electronics",
          size: 8,
          title: "power electronics",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_wireless_charging",
          size: 8,
          title: "wireless charging",
          type: "technology",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_electric_vehicle",
          size: 6,
          title: "electric vehicle",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_dynamic_charging",
          size: 6,
          title: "dynamic charging",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_wireless_power_transfer",
          size: 6,
          title: "wireless power transfer",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_charging_infrastructure",
          size: 6,
          title: "charging infrastructure",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_battery_degradation",
          size: 6,
          title: "battery degradation",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_lithium-ion",
          size: 6,
          title: "lithium-ion",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_battery_lifetime",
          size: 6,
          title: "battery lifetime",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_usage_patterns",
          size: 6,
          title: "usage patterns",
          type: "keyword",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_battery_technology",
          size: 8,
          title: "battery technology",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_thermal_management",
          size: 8,
          title: "thermal management",
          type: "technology",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_battery_cooling",
          size: 6,
          title: "battery cooling",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_thermal_management",
          size: 6,
          title: "thermal management",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_battery_longevity",
          size: 6,
          title: "battery longevity",
          type: "keyword",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_computer_vision",
          size: 8,
          title: "computer vision",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_robotics",
          size: 8,
          title: "robotics",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_electric_vehicle_charging",
          size: 8,
          title: "electric vehicle charging",
          type: "technology",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_robotic_charging",
          size: 6,
          title: "robotic charging",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_autonomous_charging",
          size: 6,
          title: "autonomous charging",
          type: "keyword",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_connected_infrastructure",
          size: 8,
          title: "connected infrastructure",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_v2i_communication",
          size: 8,
          title: "V2I communication",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_edge_computing",
          size: 8,
          title: "edge computing",
          type: "technology",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_connected_vehicles",
          size: 6,
          title: "connected vehicles",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_v2i",
          size: 6,
          title: "V2I",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_smart_infrastructure",
          size: 6,
          title: "smart infrastructure",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_cooperative_perception",
          size: 6,
          title: "cooperative perception",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_commercial_vehicles",
          size: 6,
          title: "commercial vehicles",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_zero_emission",
          size: 6,
          title: "zero emission",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_hydrogen_fuel_cell",
          size: 6,
          title: "hydrogen fuel cell",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_heavy-duty_transportation",
          size: 6,
          title: "heavy-duty transportation",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_sustainable_mobility",
          size: 6,
          title: "sustainable mobility",
          type: "keyword",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_composite_materials",
          size: 8,
          title: "composite materials",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_lightweight_structures",
          size: 8,
          title: "lightweight structures",
          type: "technology",
        },
        {
          color: "#28a745",
          domain: "Mobility",
          id: "tech_manufacturing_processes",
          size: 8,
          title: "manufacturing processes",
          type: "technology",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_carbon_fiber",
          size: 6,
          title: "carbon fiber",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_lightweight_materials",
          size: 6,
          title: "lightweight materials",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_battery_protection",
          size: 6,
          title: "battery protection",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_last-mile_logistics",
          size: 6,
          title: "last-mile logistics",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_electric_delivery_vehicles",
          size: 6,
          title: "electric delivery vehicles",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_life_cycle_assessment",
          size: 6,
          title: "life cycle assessment",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_urban_freight",
          size: 6,
          title: "urban freight",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_sustainability",
          size: 6,
          title: "sustainability",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_autonomous_vehicles",
          size: 6,
          title: "autonomous vehicles",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_safety_assessment",
          size: 6,
          title: "safety assessment",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_validation",
          size: 6,
          title: "validation",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_simulation",
          size: 6,
          title: "simulation",
          type: "keyword",
        },
        {
          color: "#fd7e14",
          domain: "Mobility",
          id: "keyword_physical_testing",
          size: 6,
          title: "physical testing",
          type: "keyword",
        },
      ],
    },
    graph_insights: {
      central_technologies: {
        analysis:
          "The central technologies identified in this knowledge graph are primarily focused on the mobility sector, specifically electric vehicles. Their centrality (0.1016) and degree (16) show that these technologies are highly interconnected and influential in the trending developments within this domain. They share common goals of enhancing electric vehicle efficiency and user experience through innovations in charging systems and materials. The presence of multiple patents demonstrates active research and significant investment in these technologies, indicating they are pivotal in shaping the future of mobility.",
        technologies: [
          {
            analysis:
              "This technology is crucial as it allows for conductive charging while in motion, significantly reducing downtime for electric vehicles. It can foster widespread EV adoption by eliminating range anxiety and improving user convenience.",
            impact:
              "Potential impact includes transforming the landscape of charging infrastructure and vehicle design, leading to more efficient EV operations.",
            title: "Dynamic Wireless Charging System for Electric Vehicles",
          },
          {
            analysis:
              "Effective thermal management is essential for battery performance, lifespan, and safety. This technology enhances the overall operational stability of electric vehicles, making them safer and more reliable.",
            impact:
              "Could increase consumer confidence in EVs and reduce battery-related hazards.",
            title: "Electric Vehicle Battery Thermal Management System",
          },
          {
            analysis:
              "This technology streamlines the charging process, especially in urban environments where parking space is limited. Its autonomous nature can significantly enhance user convenience.",
            impact:
              "May lead to the development of smart cities where electric vehicles interact seamlessly with charging infrastructure.",
            title: "Robotic Autonomous Charging System for Electric Vehicles",
          },
          {
            analysis:
              "Integrating smart infrastructure is essential for the operation of connected and autonomous vehicles, facilitating better communication between vehicles and infrastructure.",
            impact:
              "This technology can reshape urban planning and traffic management, potentially reducing congestion and improving safety.",
            title: "Smart Infrastructure for Connected and Autonomous Vehicles",
          },
          {
            analysis:
              "Utilizing lightweight materials is critical for increasing efficiency and range in electric vehicles. These materials contribute to improved performance while maintaining structural integrity.",
            impact:
              "Could revolutionize vehicle design, leading to lighter and more energy-efficient vehicles.",
            title:
              "Lightweight Composite Materials for Electric Vehicle Structures",
          },
        ],
      },
      cross_domain_connections: {
        analysis:
          "Currently, there are no identified cross-domain connections within the knowledge graph. However, the absence of these connections suggests an untapped potential for innovation at the intersection of mobility and other sectors such as energy, infrastructure, and consumer technology.",
        opportunities: [
          {
            connection:
              "Integration of Mobility Technologies with Renewable Energy Sources",
            potential:
              "Innovations could emerge from combining electric vehicle technologies with solar or wind energy solutions, providing sustainable charging options.",
          },
          {
            connection: "Collaboration with Smart City Initiatives",
            potential:
              "Enhancing urban infrastructure to support EVs could lead to improved urban mobility and environmental sustainability.",
          },
          {
            connection: "Development of AI-Driven Traffic Optimization Systems",
            potential:
              "Leveraging EV data to optimize traffic flow and reduce emissions could significantly enhance the performance of urban transport systems.",
          },
        ],
      },
      innovation_pathways: {
        analysis:
          "The identified innovation pathways showcase how emerging technologies in electric vehicles are evolving through systemic interrelations. They represent a roadmap for integrated technological developments that could inform future research and applications.",
        implications: [
          {
            implication:
              "Understanding battery performance variability across different usage patterns can lead to tailored solutions that maximize battery lifespan and efficiency.",
            path: "Dynamic Wireless Charging System for Electric Vehicles → Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
          },
          {
            implication:
              "This pathway signifies the importance of combining charging innovations with effective battery cooling solutions to enhance overall vehicle functionality.",
            path: "Dynamic Wireless Charging System for Electric Vehicles → Electric Vehicle Battery Thermal Management System",
          },
          {
            implication:
              "Integration of these technologies could pave the way for fully autonomous efficient charging ecosystems, significantly changing the EV user experience.",
            path: "Dynamic Wireless Charging System for Electric Vehicles → Robotic Autonomous Charging System for Electric Vehicles",
          },
          {
            implication:
              "This connection highlights the need for advanced infrastructure capable of supporting dynamic charging needs, which is critical for the future of transport systems.",
            path: "Dynamic Wireless Charging System for Electric Vehicles → Smart Infrastructure for Connected and Autonomous Vehicles",
          },
          {
            implication:
              "Exploring alternative energy solutions in conjunction with electric mobility technologies could enhance the versatility and environmental footprint of transportation options.",
            path: "Dynamic Wireless Charging System for Electric Vehicles → A Comprehensive Review of Hydrogen Fuel Cell Technologies for Heavy-Duty Transportation",
          },
        ],
      },
    },
    original_scout_data: {
      data_from_source: [
        {
          assignees: [],
          authors: [
            "Chang, Hyun-Joon",
            "Oliveira, Paulo",
            "Kramer, Sophia",
            "Ahmed, Farid",
            "Reynolds, Karen",
          ],
          country: "United States",
          cpcs: [],
          data_quality_score: 0.89,
          domain: "Mobility",
          id: "journals_MB-JRN-006",
          inventors: [],
          ipcs: [],
          keywords: [
            "electric vehicles",
            "vehicle-to-grid",
            "V2G",
            "fleet management",
            "grid services",
          ],
          knowledge_type: "journal",
          publication_date: "2023-02-20",
          publishers: ["IEEE Transactions on Smart Grid"],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
          ],
          similarity_score: 0.7814297676086426,
          subdomains: ["Electrification", "Energy Systems"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
        },
        {
          assignees: ["ElectroRoad Systems"],
          authors: [],
          country: "United States",
          cpcs: ["B60L53/12", "B60L53/30", "H02J50/12"],
          data_quality_score: 0.9,
          domain: "Mobility",
          id: "patents_MB-PAT-009",
          inventors: [
            "Choi, Sung-Yul",
            "Bennett, Rebecca",
            "Lombardi, Francesco",
          ],
          ipcs: ["B60L53/12", "B60L53/30", "H02J50/12"],
          keywords: [
            "electric vehicle",
            "dynamic charging",
            "wireless power transfer",
            "charging infrastructure",
          ],
          knowledge_type: "patent",
          publication_date: "2021-05-20",
          publishers: [],
          related_titles: [
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Lightweight Composite Materials for Electric Vehicle Structures",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            "Smart Infrastructure for Connected and Autonomous Vehicles",
            "Hyperloop Capsule Suspension and Propulsion System",
            "Urban Air Mobility: Infrastructure Requirements and Operational Challenges",
            "Hydrogen Fuel Cell System with Enhanced Power Density",
          ],
          similarity_score: 0.7524106502532959,
          subdomains: ["Electrification", "Infrastructure"],
          summary_text: "No summary available",
          technologies: [
            "electric vehicles",
            "power electronics",
            "wireless charging",
          ],
          title: "Dynamic Wireless Charging System for Electric Vehicles",
        },
        {
          assignees: [],
          authors: [
            "Peterson, Sarah B.",
            "Zhang, Tianqi",
            "Garcia, Miguel",
            "Johnson, Amanda",
            "Kumar, Pradeep",
          ],
          country: "Netherlands",
          cpcs: [],
          data_quality_score: 0.93,
          domain: "Mobility",
          id: "journals_MB-JRN-001",
          inventors: [],
          ipcs: [],
          keywords: [
            "electric vehicles",
            "battery degradation",
            "lithium-ion",
            "battery lifetime",
            "usage patterns",
          ],
          knowledge_type: "journal",
          publication_date: "2022-06-10",
          publishers: ["Journal of Power Sources"],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
          ],
          similarity_score: 0.7515311241149902,
          subdomains: ["Electrification", "Battery Technology"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
        },
        {
          assignees: ["EnergyTech Solutions"],
          authors: [],
          country: "United States",
          cpcs: ["H01M10/60", "B60L58/26", "H01M10/6556"],
          data_quality_score: 0.94,
          domain: "Mobility",
          id: "patents_MB-PAT-002",
          inventors: ["Chen, Jian", "Patel, Nisha", "Schmidt, Erik"],
          ipcs: ["H01M10/60", "B60L58/26", "H01M10/6556"],
          keywords: [
            "battery cooling",
            "thermal management",
            "electric vehicle",
            "battery longevity",
          ],
          knowledge_type: "patent",
          publication_date: "2021-08-12",
          publishers: [],
          related_titles: [
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Lightweight Composite Materials for Electric Vehicle Structures",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            "Advanced LiDAR System for Autonomous Vehicle Navigation",
            "Machine Learning System for Predictive Vehicle Maintenance",
            "Adaptive Vehicle Crash Avoidance System",
          ],
          similarity_score: 0.7412984371185303,
          subdomains: ["Automotive Technology", "Electrification"],
          summary_text: "No summary available",
          technologies: [
            "battery technology",
            "thermal management",
            "electric vehicles",
          ],
          title: "Electric Vehicle Battery Thermal Management System",
        },
        {
          assignees: ["AutoCharge Robotics"],
          authors: [],
          country: "United States",
          cpcs: ["B60L53/30", "B25J9/1633", "G06V10/253"],
          data_quality_score: 0.88,
          domain: "Mobility",
          id: "patents_MB-PAT-020",
          inventors: ["Lindholm, Erik", "Gupta, Anjali", "Torres, Miguel"],
          ipcs: ["B60L53/30", "B25J9/16", "G06V10/25"],
          keywords: [
            "electric vehicle",
            "charging infrastructure",
            "robotic charging",
            "autonomous charging",
          ],
          knowledge_type: "patent",
          publication_date: "2023-04-06",
          publishers: [],
          related_titles: [
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Lightweight Composite Materials for Electric Vehicle Structures",
            "Modular Autonomous Delivery Robot System",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            "Autonomous Navigation in Unstructured Dynamic Environments: Challenges and Recent Advances",
          ],
          similarity_score: 0.737293004989624,
          subdomains: ["Electrification", "Robotics"],
          summary_text: "No summary available",
          technologies: [
            "computer vision",
            "robotics",
            "electric vehicle charging",
          ],
          title: "Robotic Autonomous Charging System for Electric Vehicles",
        },
        {
          assignees: ["SmartRoad Technologies"],
          authors: [],
          country: "United States",
          cpcs: ["G08G1/0104", "H04W4/44", "G08G1/166"],
          data_quality_score: 0.89,
          domain: "Mobility",
          id: "patents_MB-PAT-012",
          inventors: ["Zhang, Wei", "Thompson, Sarah", "Ochieng, Washington"],
          ipcs: ["G08G1/01", "H04W4/44", "G08G1/16"],
          keywords: [
            "connected vehicles",
            "V2I",
            "smart infrastructure",
            "cooperative perception",
          ],
          knowledge_type: "patent",
          publication_date: "2022-07-28",
          publishers: [],
          related_titles: [
            "V2X Communication System with Enhanced Security Protocol",
            "Adaptive Vehicle Crash Avoidance System",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Hyperloop Capsule Suspension and Propulsion System",
            "Urban Air Mobility: Infrastructure Requirements and Operational Challenges",
          ],
          similarity_score: 0.7172195911407471,
          subdomains: ["Connected Vehicles", "Infrastructure"],
          summary_text: "No summary available",
          technologies: [
            "connected infrastructure",
            "V2I communication",
            "edge computing",
          ],
          title: "Smart Infrastructure for Connected and Autonomous Vehicles",
        },
        {
          assignees: [],
          authors: [
            "Wang, Jianlong",
            "Singh, Rajveer",
            "Müller, Kristina",
            "Ibrahim, Omar",
            "Davis, Peter",
          ],
          country: "United Kingdom",
          cpcs: [],
          data_quality_score: 0.92,
          domain: "Mobility",
          id: "journals_MB-JRN-004",
          inventors: [],
          ipcs: [],
          keywords: [
            "commercial vehicles",
            "zero emission",
            "hydrogen fuel cell",
            "heavy-duty transportation",
            "sustainable mobility",
          ],
          knowledge_type: "journal",
          publication_date: "2021-06-15",
          publishers: ["Progress in Energy and Combustion Science"],
          related_titles: [
            "Hydrogen Fuel Cell System with Enhanced Power Density",
            "Adaptive Aerodynamic System for Commercial Vehicles",
          ],
          similarity_score: 0.7156195640563965,
          subdomains: ["Alternative Powertrains", "Commercial Vehicles"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "A Comprehensive Review of Hydrogen Fuel Cell Technologies for Heavy-Duty Transportation",
        },
        {
          assignees: ["LightweightEV Materials"],
          authors: [],
          country: "United States",
          cpcs: ["B29C70/086", "B60K1/04", "B60R16/04"],
          data_quality_score: 0.9,
          domain: "Mobility",
          id: "patents_MB-PAT-013",
          inventors: ["Wu, Hong", "Johannson, Lars", "Matthews, Catherine"],
          ipcs: ["B29C70/08", "B60K1/04", "B60R16/04"],
          keywords: [
            "electric vehicle",
            "carbon fiber",
            "lightweight materials",
            "battery protection",
          ],
          knowledge_type: "patent",
          publication_date: "2021-12-09",
          publishers: [],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
          ],
          similarity_score: 0.7146034240722656,
          subdomains: ["Materials Technology", "Vehicle Structures"],
          summary_text: "No summary available",
          technologies: [
            "composite materials",
            "lightweight structures",
            "manufacturing processes",
          ],
          title:
            "Lightweight Composite Materials for Electric Vehicle Structures",
        },
        {
          assignees: [],
          authors: [
            "Kaplan, Eleanor",
            "Figliozzi, Miguel",
            "Holguín-Veras, José",
            "Zhang, Renshu",
            "Baumgartner, Michael",
          ],
          country: "Netherlands",
          cpcs: [],
          data_quality_score: 0.91,
          domain: "Mobility",
          id: "journals_MB-JRN-008",
          inventors: [],
          ipcs: [],
          keywords: [
            "last-mile logistics",
            "electric delivery vehicles",
            "life cycle assessment",
            "urban freight",
            "sustainability",
          ],
          knowledge_type: "journal",
          publication_date: "2022-12-08",
          publishers: ["Journal of Cleaner Production"],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Modular Autonomous Delivery Robot System",
          ],
          similarity_score: 0.7045173645019531,
          subdomains: ["Electrification", "Last-Mile Delivery"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
        },
        {
          assignees: [],
          authors: [
            "Kim, Jiyong",
            "Martínez, Carlos",
            "Frazzoli, Emilio",
            "Seshia, Sanjit A.",
            "Tomizuka, Masayoshi",
          ],
          country: "United States",
          cpcs: [],
          data_quality_score: 0.94,
          domain: "Mobility",
          id: "journals_MB-JRN-002",
          inventors: [],
          ipcs: [],
          keywords: [
            "autonomous vehicles",
            "safety assessment",
            "validation",
            "simulation",
            "physical testing",
          ],
          knowledge_type: "journal",
          publication_date: "2021-10-22",
          publishers: [
            "IEEE Transactions on Intelligent Transportation Systems",
          ],
          related_titles: [
            "Adaptive Vehicle Crash Avoidance System",
            "Advanced LiDAR System for Autonomous Vehicle Navigation",
            "Modular Autonomous Delivery Robot System",
            "Autonomous Navigation in Unstructured Dynamic Environments: Challenges and Recent Advances",
          ],
          similarity_score: 0.6963181495666504,
          subdomains: ["Autonomous Systems", "Vehicle Safety"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Safety Assessment Framework for Autonomous Vehicles: Combining Virtual and Physical Testing",
        },
      ],
      insights: [
        "Current trends show a significant focus on electric vehicle (EV) integration with energy systems, specifically through vehicle-to-grid (V2G) technologies, which enhance energy efficiency and fleet management capabilities.",
        "The development of dynamic wireless charging systems and autonomous robotic charging mechanisms indicates a shift toward more flexible and efficient charging infrastructure, making electric vehicles more accessible and user-friendly.",
        "Research indicates that battery technology is critical for the longevity and performance of electric vehicles, with innovations in thermal management systems playing a crucial role in extending battery life.",
        "The rise of connected vehicles necessitates smart infrastructure solutions that enable vehicle-to-infrastructure (V2I) communication, which enhances safety and operational efficiency for autonomous vehicles.",
        "There's a growing interest in sustainable transportation options beyond electric vehicles, such as hydrogen fuel cells, highlighting the importance of cross-domain innovation in the mobility sector.",
      ],
      isData: !0,
      message: "Successfully generated insights.",
      notes:
        "The mobility sector is undergoing a transformative phase with electric vehicles at the forefront. Current trends highlight innovations in integrating EVs with energy systems like vehicle-to-grid technology, enhancing both the efficiency of energy usage and fleet management. Furthermore, advancements in wireless and robotic charging systems signal a move towards a more user-friendly charging infrastructure. Critical research into battery technology, particularly concerning thermal management systems, has emerged as essential for extending battery life and performance. The cross-saving implications of connected vehicles necessitate the need for smart infrastructure that enables effective V2I communication, particularly as autonomous vehicle technologies continue to evolve. Additionally, exploring alternative power sources such as hydrogen fuel cells reflects an encouraging trend towards sustainability in transportation. In light of these insights, strategies must focus on fostering partnerships for renewable energy integration, investing in smart infrastructure, and advancing material technology for electric vehicles to create a sustainable and efficient mobility ecosystem.",
      prompt: "electric vehicle and its cross domains",
      recommendations: [
        "Invest in research and partnerships focused on integrating electric vehicles with renewable energy sources through advanced V2G systems to enhance grid stability and sustainability.",
        "Promote the development of smart infrastructure that accommodates both electric and autonomous vehicles, ensuring that transportation systems can adapt to future technological advancements.",
        "Encourage collaboration between automotive companies and material science industries to innovate lightweight materials that enhance vehicle efficiency without compromising safety.",
      ],
      relevant_trends: [
        {
          assignees: [],
          authors: [
            "Chang, Hyun-Joon",
            "Oliveira, Paulo",
            "Kramer, Sophia",
            "Ahmed, Farid",
            "Reynolds, Karen",
          ],
          country: "United States",
          cpcs: [],
          data_quality_score: 0.89,
          domain: "Mobility",
          id: "journals_MB-JRN-006",
          inventors: [],
          ipcs: [],
          keywords: [
            "electric vehicles",
            "vehicle-to-grid",
            "V2G",
            "fleet management",
            "grid services",
          ],
          knowledge_type: "journal",
          publication_date: "2023-02-20",
          publishers: ["IEEE Transactions on Smart Grid"],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
          ],
          similarity_score: 0.7814,
          subdomains: ["Electrification", "Energy Systems"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
        },
        {
          assignees: ["ElectroRoad Systems"],
          authors: [],
          country: "United States",
          cpcs: ["B60L53/12", "B60L53/30", "H02J50/12"],
          data_quality_score: 0.9,
          domain: "Mobility",
          id: "patents_MB-PAT-009",
          inventors: [
            "Choi, Sung-Yul",
            "Bennett, Rebecca",
            "Lombardi, Francesco",
          ],
          ipcs: ["B60L53/12", "B60L53/30", "H02J50/12"],
          keywords: [
            "electric vehicle",
            "dynamic charging",
            "wireless power transfer",
            "charging infrastructure",
          ],
          knowledge_type: "patent",
          publication_date: "2021-05-20",
          publishers: [],
          related_titles: [
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Lightweight Composite Materials for Electric Vehicle Structures",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            "Smart Infrastructure for Connected and Autonomous Vehicles",
            "Hyperloop Capsule Suspension and Propulsion System",
            "Urban Air Mobility: Infrastructure Requirements and Operational Challenges",
            "Hydrogen Fuel Cell System with Enhanced Power Density",
          ],
          similarity_score: 0.7524,
          subdomains: ["Electrification", "Infrastructure"],
          summary_text: "No summary available",
          technologies: [
            "electric vehicles",
            "power electronics",
            "wireless charging",
          ],
          title: "Dynamic Wireless Charging System for Electric Vehicles",
        },
        {
          assignees: [],
          authors: [
            "Peterson, Sarah B.",
            "Zhang, Tianqi",
            "Garcia, Miguel",
            "Johnson, Amanda",
            "Kumar, Pradeep",
          ],
          country: "Netherlands",
          cpcs: [],
          data_quality_score: 0.93,
          domain: "Mobility",
          id: "journals_MB-JRN-001",
          inventors: [],
          ipcs: [],
          keywords: [
            "electric vehicles",
            "battery degradation",
            "lithium-ion",
            "battery lifetime",
            "usage patterns",
          ],
          knowledge_type: "journal",
          publication_date: "2022-06-10",
          publishers: ["Journal of Power Sources"],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
          ],
          similarity_score: 0.7515,
          subdomains: ["Electrification", "Battery Technology"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
        },
        {
          assignees: ["EnergyTech Solutions"],
          authors: [],
          country: "United States",
          cpcs: ["H01M10/60", "B60L58/26", "H01M10/6556"],
          data_quality_score: 0.94,
          domain: "Mobility",
          id: "patents_MB-PAT-002",
          inventors: ["Chen, Jian", "Patel, Nisha", "Schmidt, Erik"],
          ipcs: ["H01M10/60", "B60L58/26", "H01M10/6556"],
          keywords: [
            "battery cooling",
            "thermal management",
            "electric vehicle",
            "battery longevity",
          ],
          knowledge_type: "patent",
          publication_date: "2021-08-12",
          publishers: [],
          related_titles: [
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Lightweight Composite Materials for Electric Vehicle Structures",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            "Advanced LiDAR System for Autonomous Vehicle Navigation",
            "Machine Learning System for Predictive Vehicle Maintenance",
            "Adaptive Vehicle Crash Avoidance System",
          ],
          similarity_score: 0.7413,
          subdomains: ["Automotive Technology", "Electrification"],
          summary_text: "No summary available",
          technologies: [
            "battery technology",
            "thermal management",
            "electric vehicles",
          ],
          title: "Electric Vehicle Battery Thermal Management System",
        },
        {
          assignees: ["AutoCharge Robotics"],
          authors: [],
          country: "United States",
          cpcs: ["B60L53/30", "B25J9/1633", "G06V10/253"],
          data_quality_score: 0.88,
          domain: "Mobility",
          id: "patents_MB-PAT-020",
          inventors: ["Lindholm, Erik", "Gupta, Anjali", "Torres, Miguel"],
          ipcs: ["B60L53/30", "B25J9/16", "G06V10/25"],
          keywords: [
            "electric vehicle",
            "charging infrastructure",
            "robotic charging",
            "autonomous charging",
          ],
          knowledge_type: "patent",
          publication_date: "2023-04-06",
          publishers: [],
          related_titles: [
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Lightweight Composite Materials for Electric Vehicle Structures",
            "Modular Autonomous Delivery Robot System",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
            "Autonomous Navigation in Unstructured Dynamic Environments: Challenges and Recent Advances",
          ],
          similarity_score: 0.7373,
          subdomains: ["Electrification", "Robotics"],
          summary_text: "No summary available",
          technologies: [
            "computer vision",
            "robotics",
            "electric vehicle charging",
          ],
          title: "Robotic Autonomous Charging System for Electric Vehicles",
        },
        {
          assignees: ["SmartRoad Technologies"],
          authors: [],
          country: "United States",
          cpcs: ["G08G1/0104", "H04W4/44", "G08G1/166"],
          data_quality_score: 0.89,
          domain: "Mobility",
          id: "patents_MB-PAT-012",
          inventors: ["Zhang, Wei", "Thompson, Sarah", "Ochieng, Washington"],
          ipcs: ["G08G1/01", "H04W4/44", "G08G1/16"],
          keywords: [
            "connected vehicles",
            "V2I",
            "smart infrastructure",
            "cooperative perception",
          ],
          knowledge_type: "patent",
          publication_date: "2022-07-28",
          publishers: [],
          related_titles: [
            "V2X Communication System with Enhanced Security Protocol",
            "Adaptive Vehicle Crash Avoidance System",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Hyperloop Capsule Suspension and Propulsion System",
            "Urban Air Mobility: Infrastructure Requirements and Operational Challenges",
          ],
          similarity_score: 0.7172,
          subdomains: ["Connected Vehicles", "Infrastructure"],
          summary_text: "No summary available",
          technologies: [
            "connected infrastructure",
            "V2I communication",
            "edge computing",
          ],
          title: "Smart Infrastructure for Connected and Autonomous Vehicles",
        },
        {
          assignees: [],
          authors: [
            "Wang, Jianlong",
            "Singh, Rajveer",
            "Müller, Kristina",
            "Ibrahim, Omar",
            "Davis, Peter",
          ],
          country: "United Kingdom",
          cpcs: [],
          data_quality_score: 0.92,
          domain: "Mobility",
          id: "journals_MB-JRN-004",
          inventors: [],
          ipcs: [],
          keywords: [
            "commercial vehicles",
            "zero emission",
            "hydrogen fuel cell",
            "heavy-duty transportation",
            "sustainable mobility",
          ],
          knowledge_type: "journal",
          publication_date: "2021-06-15",
          publishers: ["Progress in Energy and Combustion Science"],
          related_titles: [
            "Hydrogen Fuel Cell System with Enhanced Power Density",
            "Adaptive Aerodynamic System for Commercial Vehicles",
          ],
          similarity_score: 0.7156,
          subdomains: ["Alternative Powertrains", "Commercial Vehicles"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "A Comprehensive Review of Hydrogen Fuel Cell Technologies for Heavy-Duty Transportation",
        },
        {
          assignees: ["LightweightEV Materials"],
          authors: [],
          country: "United States",
          cpcs: ["B29C70/086", "B60K1/04", "B60R16/04"],
          data_quality_score: 0.9,
          domain: "Mobility",
          id: "patents_MB-PAT-013",
          inventors: ["Wu, Hong", "Johannson, Lars", "Matthews, Catherine"],
          ipcs: ["B29C70/08", "B60K1/04", "B60R16/04"],
          keywords: [
            "electric vehicle",
            "carbon fiber",
            "lightweight materials",
            "battery protection",
          ],
          knowledge_type: "patent",
          publication_date: "2021-12-09",
          publishers: [],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
          ],
          similarity_score: 0.7146,
          subdomains: ["Materials Technology", "Vehicle Structures"],
          summary_text: "No summary available",
          technologies: [
            "composite materials",
            "lightweight structures",
            "manufacturing processes",
          ],
          title:
            "Lightweight Composite Materials for Electric Vehicle Structures",
        },
        {
          assignees: [],
          authors: [
            "Kaplan, Eleanor",
            "Figliozzi, Miguel",
            "Holguín-Veras, José",
            "Zhang, Renshu",
            "Baumgartner, Michael",
          ],
          country: "Netherlands",
          cpcs: [],
          data_quality_score: 0.91,
          domain: "Mobility",
          id: "journals_MB-JRN-008",
          inventors: [],
          ipcs: [],
          keywords: [
            "last-mile logistics",
            "electric delivery vehicles",
            "life cycle assessment",
            "urban freight",
            "sustainability",
          ],
          knowledge_type: "journal",
          publication_date: "2022-12-08",
          publishers: ["Journal of Cleaner Production"],
          related_titles: [
            "Electric Vehicle Battery Thermal Management System",
            "Solid-State Battery with Silicon-Carbon Composite Anode",
            "Dynamic Wireless Charging System for Electric Vehicles",
            "Robotic Autonomous Charging System for Electric Vehicles",
            "Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns",
            "Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets",
            "Modular Autonomous Delivery Robot System",
          ],
          similarity_score: 0.7045,
          subdomains: ["Electrification", "Last-Mile Delivery"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Quantifying Environmental Benefits of Electric Last-Mile Delivery: A Life Cycle Assessment",
        },
        {
          assignees: [],
          authors: [
            "Kim, Jiyong",
            "Martínez, Carlos",
            "Frazzoli, Emilio",
            "Seshia, Sanjit A.",
            "Tomizuka, Masayoshi",
          ],
          country: "United States",
          cpcs: [],
          data_quality_score: 0.94,
          domain: "Mobility",
          id: "journals_MB-JRN-002",
          inventors: [],
          ipcs: [],
          keywords: [
            "autonomous vehicles",
            "safety assessment",
            "validation",
            "simulation",
            "physical testing",
          ],
          knowledge_type: "journal",
          publication_date: "2021-10-22",
          publishers: [
            "IEEE Transactions on Intelligent Transportation Systems",
          ],
          related_titles: [
            "Adaptive Vehicle Crash Avoidance System",
            "Advanced LiDAR System for Autonomous Vehicle Navigation",
            "Modular Autonomous Delivery Robot System",
            "Autonomous Navigation in Unstructured Dynamic Environments: Challenges and Recent Advances",
          ],
          similarity_score: 0.6963,
          subdomains: ["Autonomous Systems", "Vehicle Safety"],
          summary_text: "No summary available",
          technologies: [],
          title:
            "Safety Assessment Framework for Autonomous Vehicles: Combining Virtual and Physical Testing",
        },
      ],
      response_to_user_prompt:
        "The current trend highlights significant advancements in electric vehicle integration with energy systems via vehicle-to-grid technologies, innovative charging infrastructures, and the importance of battery longevity. Strategies should focus on improving V2G systems, developing smart infrastructures for autonomous vehicles, and advancing lightweight materials to enhance efficiency.",
      source: "neo4j",
      timestamp: 1745227760,
      trend_summary:
        "- ID: journals_MB-JRN-006 | Title: Secure and Efficient Vehicle-to-Grid Integration for Electric Vehicle Fleets | Domain: Mobility | Knowledge Type: journal | Publication Date: 2023-02-20 | Quality Score: 0.89 | Country: United States | Score: 0.7814\n  Subdomains: Electrification, Energy Systems\n  Keywords: electric vehicles, vehicle-to-grid, V2G, fleet management, grid services\n- ID: patents_MB-PAT-009 | Title: Dynamic Wireless Charging System for Electric Vehicles | Domain: Mobility | Knowledge Type: patent | Publication Date: 2021-05-20 | Quality Score: 0.9 | Country: United States | Score: 0.7524\n  Assignees: ElectroRoad Systems\n  Inventors: Choi, Sung-Yul, Bennett, Rebecca, Lombardi, Francesco\n  Technologies: electric vehicles, power electronics, wireless charging\n  Subdomains: Electrification, Infrastructure\n  Keywords: electric vehicle, dynamic charging, wireless power transfer, charging infrastructure\n- ID: journals_MB-JRN-001 | Title: Comprehensive Analysis of Electric Vehicle Battery Degradation Across Multiple Vehicle Models and Usage Patterns | Domain: Mobility | Knowledge Type: journal | Publication Date: 2022-06-10 | Quality Score: 0.93 | Country: Netherlands | Score: 0.7515\n  Subdomains: Electrification, Battery Technology\n  Keywords: electric vehicles, battery degradation, lithium-ion, battery lifetime, usage patterns\n- ID: patents_MB-PAT-002 | Title: Electric Vehicle Battery Thermal Management System | Domain: Mobility | Knowledge Type: patent | Publication Date: 2021-08-12 | Quality Score: 0.94 | Country: United States | Score: 0.7413\n  Assignees: EnergyTech Solutions\n  Inventors: Chen, Jian, Patel, Nisha, Schmidt, Erik\n  Technologies: battery technology, thermal management, electric vehicles\n  Subdomains: Automotive Technology, Electrification\n  Keywords: battery cooling, thermal management, electric vehicle, battery longevity\n- ID: patents_MB-PAT-020 | Title: Robotic Autonomous Charging System for Electric Vehicles | Domain: Mobility | Knowledge Type: patent | Publication Date: 2023-04-06 | Quality Score: 0.88 | Country: United States | Score: 0.7373\n  Assignees: AutoCharge Robotics\n  Inventors: Lindholm, Erik, Gupta, Anjali, Torres, Miguel\n  Technologies: computer vision, robotics, electric vehicle charging\n  Subdomains: Electrification, Robotics\n  Keywords: electric vehicle, charging infrastructure, robotic charging, autonomous charging\n",
    },
    prompt: "electric vehicle and its cross domains",
    s_curve_data: {
      domains: ["Mobility"],
      max_year: 2023,
      min_year: 2021,
      technologies: [
        {
          data: [
            { count: 2, cumulative: 2, year: 2021 },
            { count: 0, cumulative: 2, year: 2022 },
            { count: 0, cumulative: 2, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "electric vehicles",
          total_mentions: 2,
        },
        {
          data: [
            { count: 1, cumulative: 1, year: 2021 },
            { count: 0, cumulative: 1, year: 2022 },
            { count: 0, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "power electronics",
          total_mentions: 1,
        },
        {
          data: [
            { count: 1, cumulative: 1, year: 2021 },
            { count: 0, cumulative: 1, year: 2022 },
            { count: 0, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "wireless charging",
          total_mentions: 1,
        },
        {
          data: [
            { count: 1, cumulative: 1, year: 2021 },
            { count: 0, cumulative: 1, year: 2022 },
            { count: 0, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "battery technology",
          total_mentions: 1,
        },
        {
          data: [
            { count: 1, cumulative: 1, year: 2021 },
            { count: 0, cumulative: 1, year: 2022 },
            { count: 0, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "thermal management",
          total_mentions: 1,
        },
        {
          data: [
            { count: 0, cumulative: 0, year: 2021 },
            { count: 0, cumulative: 0, year: 2022 },
            { count: 1, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "computer vision",
          total_mentions: 1,
        },
        {
          data: [
            { count: 0, cumulative: 0, year: 2021 },
            { count: 0, cumulative: 0, year: 2022 },
            { count: 1, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "robotics",
          total_mentions: 1,
        },
        {
          data: [
            { count: 0, cumulative: 0, year: 2021 },
            { count: 0, cumulative: 0, year: 2022 },
            { count: 1, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "electric vehicle charging",
          total_mentions: 1,
        },
        {
          data: [
            { count: 0, cumulative: 0, year: 2021 },
            { count: 1, cumulative: 1, year: 2022 },
            { count: 0, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "connected infrastructure",
          total_mentions: 1,
        },
        {
          data: [
            { count: 0, cumulative: 0, year: 2021 },
            { count: 1, cumulative: 1, year: 2022 },
            { count: 0, cumulative: 1, year: 2023 },
          ],
          domains: ["Mobility"],
          growth_data: [
            { growth: 0, year: 2022 },
            { growth: 0, year: 2023 },
          ],
          stage: "saturation",
          technology: "V2I communication",
          total_mentions: 1,
        },
      ],
      years: [2021, 2022, 2023],
    },
    timestamp: 1745401297,
  };
  document.getElementById("analyst-data").value = JSON.stringify(
    template,
    null,
    2
  );
  logToConsole("Analyst data template loaded", "info");
}

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
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const content = JSON.parse(e.target.result);
      document.getElementById("company-profile").value = JSON.stringify(
        content,
        null,
        2
      );
      logToConsole("Company profile file loaded successfully", "info");
    } catch (e) {
      showToast("Invalid JSON file");
      logToConsole("Error parsing JSON file: " + e.message, "error");
    }
  };
  reader.readAsText(file);
}

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
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const content = JSON.parse(e.target.result);
      document.getElementById("competitor-data").value = JSON.stringify(
        content,
        null,
        2
      );
      logToConsole("Competitor data file loaded successfully", "info");
    } catch (e) {
      showToast("Invalid JSON file");
      logToConsole("Error parsing JSON file: " + e.message, "error");
    }
  };
  reader.readAsText(file);
}

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
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const content = JSON.parse(e.target.result);
      document.getElementById("analyst-data").value = JSON.stringify(
        content,
        null,
        2
      );
      logToConsole("Analyst data file loaded successfully", "info");
    } catch (e) {
      showToast("Invalid JSON file");
      logToConsole("Error parsing JSON file: " + e.message, "error");
    }
  };
  reader.readAsText(file);
}

function loadAnalystResultsFromLocalStorage() {
  try {
    const storedAnalyst = localStorage.getItem("analystResultsIndex");
    if (storedAnalyst) {
      const indexData = JSON.parse(storedAnalyst);
      analystResults = [];
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
      logToConsole("No analyst results found in localStorage", "info");
      analystResults = [];
    }
    updateAnalystSelect();
  } catch (e) {
    logToConsole(`Error loading from localStorage: ${e.message}`, "error");
  }
}
