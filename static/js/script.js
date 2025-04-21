// ==================================================
// SHARED VARIABLES AND CONFIGURATION
// ==================================================
const apiUrl = "http://localhost:5000";
let socket = null;

// ==================================================
// CORE UTILITY FUNCTIONS (SHARED ACROSS ALL TEMPLATES)
// ==================================================

/**
 * Log a message to the console with timestamp
 */
function logToConsole(message, type = "info") {
  const consoleLog = document.getElementById("console-log");
  if (!consoleLog) return;

  const timestamp = new Date().toLocaleTimeString();
  const logDiv = document.createElement("div");
  logDiv.className = `log-message ${type}`;
  logDiv.innerHTML = `<span class="log-timestamp">${timestamp}</span> ${message}`;

  consoleLog.appendChild(logDiv);
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

/**
 * Clear console logs
 */
function clearLogs() {
  const consoleLog = document.getElementById("console-log");
  if (!consoleLog) return;

  consoleLog.innerHTML = "";
  logToConsole("Logs cleared", "system");
}

/**
 * Show a toast notification
 */
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

/**
 * Clear form inputs
 */
function clearForm() {
  // Try to clear inputs based on which page we're on
  // ChatBot
  if (document.getElementById("chat-query")) {
    document.getElementById("chat-query").value = "";
    document.getElementById("chat-summary").value = "";
  }

  // Scout Agent
  if (document.getElementById("scout-prompt")) {
    document.getElementById("scout-prompt").value = "";
    if (document.getElementById("scout-response")) {
      document.getElementById("scout-response").innerHTML = `
        <div class="placeholder-message">
          <i class="fas fa-search"></i>
          <p>Enter a prompt and click Run Query to see results</p>
        </div>
      `;
    }
    if (document.getElementById("response-box")) {
      document.getElementById("response-box").style.display = "none";
    }
  }

  // Analyst Agent
  if (document.getElementById("scout-data-input")) {
    document.getElementById("scout-data-input").value = "";
    if (document.getElementById("graph-container")) {
      document.getElementById("graph-container").innerHTML = `
        <div class="placeholder-message">
          <i class="fas fa-project-diagram"></i>
          <p>Analyze Scout data to generate Knowledge Graph</p>
        </div>
      `;
    }
    if (document.getElementById("insights-container")) {
      document.getElementById("insights-container").innerHTML = `
        <div class="placeholder-message">
          <i class="fas fa-lightbulb"></i>
          <p>Insights will appear after analysis</p>
        </div>
      `;
    }
    if (document.getElementById("data-cards-container")) {
      document.getElementById("data-cards-container").innerHTML = "";
    }
  }

  logToConsole("Form cleared", "info");
}

/**
 * Format JSON response with syntax highlighting
 */
function formatJsonResponse(data) {
  const jsonString = JSON.stringify(data, null, 2);
  return `<pre class="json-response">${syntaxHighlight(jsonString)}</pre>`;
}

/**
 * Add syntax highlighting to JSON string
 */
function syntaxHighlight(json) {
  json = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

/**
 * Copy text to clipboard
 */
function copyResponse() {
  // Determine the correct element to copy from based on page
  let element = null;

  if (document.getElementById("chat-response")) {
    element = document.getElementById("chat-response");
  } else if (document.getElementById("scout-response")) {
    element = document.getElementById("scout-response");
  }

  if (!element) return;

  const responseText = element.innerText;
  if (responseText && !responseText.includes("Enter a")) {
    navigator.clipboard
      .writeText(responseText)
      .then(() => {
        showToast("Response copied to clipboard");
        logToConsole("Response copied to clipboard", "info");
      })
      .catch((err) => {
        showToast("Failed to copy: " + err);
        logToConsole(`Failed to copy: ${err}`, "error");
      });
  }
}

/**
 * Navigation helper
 */
function navigateTo(page) {
  window.location.href = page;
}

/**
 * Connect to Socket.IO server
 */
function connectSocket() {
  socket = io.connect(apiUrl);

  socket.on("connect", () => {
    logToConsole("Connected to server", "system");
  });

  socket.on("disconnect", () => {
    logToConsole("Disconnected from server", "warning");
  });

  // Listen for different message types based on the page
  socket.on("scout_log", (data) => {
    logToConsole(
      data.message,
      data.message.includes("⚠️") ? "warning" : "info"
    );
  });

  socket.on("analyst_log", (data) => {
    logToConsole(
      data.message,
      data.message.includes("⚠️") ? "warning" : "info"
    );
  });

  socket.on("chat_log", (data) => {
    logToConsole(
      data.message,
      data.message.includes("⚠️") ? "warning" : "info"
    );
  });

  socket.on("status", (data) => {
    logToConsole(`Status: ${data.message}`, "system");
  });

  // Listen for scout results
  socket.on("scout_result", (data) => {
    if (typeof addScoutResult === "function") {
      addScoutResult(data);
    }
  });
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  connectSocket();
});

document.addEventListener("DOMContentLoaded", () => {
  // Determine current page
  const currentPage = getCurrentPage();

  // Load common.js first (contains shared functionality)
  loadScript("/static/js/script.js", () => {
    // After common.js is loaded, load the page-specific script if needed
    if (currentPage === "chatbot") {
      loadScript("/static/js/chatbot.js");
    } else if (currentPage === "scout") {
      loadScript("/static/js/scout-agent.js");
    } else if (currentPage === "analyst") {
      loadScript("/static/js/analyst-agent.js");
    }
  });
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

/**
 * Utility function to handle button state changes consistently across the application
 * @param {string} selector - CSS selector for targeting buttons
 * @param {boolean} isLoading - Whether to set buttons to loading state (true) or normal state (false)
 * @param {string} loadingText - Optional text to display during loading, defaults to "Processing..."
 */
function handleButtonState(selector, isLoading, loadingText = "Processing...") {
  const buttons = document.querySelectorAll(selector);

  buttons.forEach((btn) => {
    if (isLoading) {
      // Save original state for later restoration
      btn.dataset.originalHtml = btn.innerHTML;

      // Disable the button and update its appearance
      btn.disabled = true;

      // If button has an icon, replace it with a spinner
      const icon = btn.querySelector("i");
      if (icon) {
        // Store original icon class
        const originalIconClass = icon.className;
        btn.dataset.originalIcon = originalIconClass;

        // Replace with spinner
        icon.className = "fas fa-circle-notch fa-spin";

        // Update button text based on its current text
        const buttonText = btn.textContent.trim();
        if (buttonText.includes("Analyze")) {
          btn.innerHTML = btn.innerHTML.replace(
            /Analyze\s*\w*/g,
            "Analyzing..."
          );
        } else if (buttonText.includes("Run")) {
          btn.innerHTML = btn.innerHTML.replace(/Run\s*\w*/g, "Running...");
        } else if (buttonText.includes("Search")) {
          btn.innerHTML = btn.innerHTML.replace(
            /Search\s*\w*/g,
            "Searching..."
          );
        } else if (buttonText.includes("Process")) {
          btn.innerHTML = btn.innerHTML.replace(
            /Process\s*\w*/g,
            "Processing..."
          );
        } else if (buttonText.includes("Send")) {
          btn.innerHTML = btn.innerHTML.replace(/Send\s*\w*/g, "Sending...");
        } else {
          // If no specific text pattern found, use the generic loading text
          btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${loadingText}`;
        }
      } else {
        // Button doesn't have an icon, just update the text
        btn.textContent = loadingText;
      }

      // Add a subtle visual cue that the button is disabled
      btn.style.opacity = "0.7";
      btn.style.cursor = "not-allowed";
    } else {
      // Restore the button to its original state
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
      } else if (btn.dataset.originalIcon) {
        // If we only stored the icon, restore just that
        const icon = btn.querySelector("i");
        if (icon) {
          icon.className = btn.dataset.originalIcon;
        }
      }

      // Re-enable the button
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.cursor = "";

      // Clean up data attributes
      delete btn.dataset.originalHtml;
      delete btn.dataset.originalIcon;
    }
  });

  // Return true to allow for function chaining
  return true;
}
