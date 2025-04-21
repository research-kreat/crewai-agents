// ==================================================
// SCOUT AGENT FUNCTIONALITY
// ==================================================

// Scout results storage
let scoutResults = [];

/**
 * Send Scout query
 */
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

  // Disable run button using the utility function
  handleButtonState("#run-button", true, "Processing...");

  logToConsole(`Sending query: "${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}"`, "info");

  // Send API request
  fetch(`${apiUrl}/agent/scout/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  })
    .then((response) => response.json())
    .then((data) => {
      document.getElementById("loading").classList.add("hidden");
      logToConsole("Response received, processing results...", "info");

      // Display response
      document.getElementById("scout-response").innerHTML = formatJsonResponse(data);
      displayStructuredData(data);

      logToConsole("Results displayed successfully", "system");

      // Re-enable run button
      handleButtonState("#run-button", false);
    })
    .catch((error) => {
      document.getElementById("loading").classList.add("hidden");
      logToConsole(`Error in request: ${error}`, "error");

      document.getElementById("scout-response").innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error: ${error}</p>
      </div>
    `;

      // Re-enable run button
      handleButtonState("#run-button", false);
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
  const isValidValue = (value) =>
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
      el.innerHTML =
        "<ul>" +
        items
          .map((item) => `<li>${isValidValue(item) ? item : defaultText}</li>`)
          .join("") +
        "</ul>";
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
    trendsContainer.innerHTML =
      "<ul>" +
      data.relevant_trends
        .map(
          (trend) => `
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
    `
        )
        .join("") +
      "</ul>";
  } else {
    trendsContainer.innerHTML = "<ul><li>No relevant trends available</li></ul>";
  }
}

/**
 * Add a new scout result to storage and UI
 */
function addScoutResult(data) {
  if (!data || !data.prompt) return;

  // Create a unique ID and timestamp
  const timestamp = new Date().toLocaleTimeString();
  const resultId = "scout-" + Date.now();
  const date = new Date().toLocaleDateString();

  // Create result object
  const resultObject = {
    id: resultId,
    timestamp: timestamp,
    date: date,
    prompt: data.prompt,
    data: data,
  };

  // Add to storage array
  scoutResults.push(resultObject);

  // Save to localStorage
  saveScoutResultsToLocalStorage();

  logToConsole(`Added Scout result for "${data.prompt.substring(0, 20)}..."`, "info");
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

    logToConsole(`Loaded ${scoutResults.length} scout results from localStorage`, "system");
  } catch (e) {
    logToConsole(`Error loading from localStorage: ${e.message}`, "error");
  }
}

// Initialize on page load if this is the scout page
document.addEventListener("DOMContentLoaded", () => {
  if (getCurrentPage() === "scout") {
    logToConsole("Scout Agent initialized", "system");
    loadScoutResultsFromLocalStorage();
    
    // Set up event listeners
    const scoutPrompt = document.getElementById("scout-prompt");
    if (scoutPrompt) {
      scoutPrompt.addEventListener("keypress", function(event) {
        // Submit on Ctrl+Enter
        if (event.key === "Enter" && event.ctrlKey) {
          event.preventDefault();
          sendScoutQuery();
        }
      });
    }
  }
});

  /**
   * Determine which page we're currently on
   */
  function getCurrentPage() {
    // Check for page-specific elements
    if (document.getElementById("chat-query")) {
      return "chatbot";
    } else if (document.getElementById("scout-prompt")) {
      return "scout";
    } else if (document.getElementById("scout-data-input")) {
      return "analyst";
    }
  
    // Default to home page
    return "home";
  }
  
  /**
   * Dynamically load a script
   */
  function loadScript(url, callback) {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = url;
    
    // If callback is provided, execute it when script is loaded
    if (callback) {
      script.onload = callback;
    }
    
    document.head.appendChild(script);
  }