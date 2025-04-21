// ==================================================
// CHATBOT AGENT FUNCTIONALITY
// ==================================================

// Store any chat-specific variables here
let chatHistory = [];

/**
 * Send a chat query to the chatbot
 */
function sendChatQuery() {
  const query = document.getElementById("chat-query").value;
  const summary = document.getElementById("chat-summary").value;

  if (!query) {
    showToast("Please enter a query");
    return;
  }

  // Show loading spinner
  document.getElementById("loading").classList.remove("hidden");
  document.getElementById("chat-response").innerHTML = "";

  // Disable send button
  handleButtonState("#send-button", true, "Sending...");

  logToConsole(
    `Sending chat query: "${query.substring(0, 50)}${
      query.length > 50 ? "..." : ""
    }"`,
    "info"
  );

  fetch(`${apiUrl}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, summary }),
  })
    .then((response) => response.json())
    .then((data) => {
      // Hide loading spinner
      document.getElementById("loading").classList.add("hidden");
      logToConsole("Response received from chatbot", "info");

      // Store in chat history
      chatHistory.push({
        query: query,
        summary: summary,
        response: data,
      });

      // Format the response
      document.getElementById("chat-response").innerHTML =
        formatJsonResponse(data);

      // Re-enable send button
      handleButtonState("#send-button", false);
    })
    .catch((error) => {
      // Hide loading spinner
      document.getElementById("loading").classList.add("hidden");
      logToConsole(`Error in chat request: ${error}`, "error");

      // Show error message
      document.getElementById("chat-response").innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error: ${error}</p>
      </div>
    `;

      // Re-enable send button
      handleButtonState("#send-button", false);
    });
}

// Initialize on page load if this is the chatbot page
document.addEventListener("DOMContentLoaded", () => {
  if (getCurrentPage() === "chatbot") {
    logToConsole("ChatBot Agent initialized", "system");

    // Set up event listeners
    const chatQuery = document.getElementById("chat-query");
    if (chatQuery) {
      chatQuery.addEventListener("keypress", function (event) {
        // Send query on Enter key (without Shift key for newlines)
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendChatQuery();
        }
      });
    }
  }
});
