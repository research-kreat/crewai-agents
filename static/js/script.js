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
  loadScript("/static/js/common.js", () => {
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
