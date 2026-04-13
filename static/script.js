const temperatureEl = document.getElementById("temperature");
const humidityEl = document.getElementById("humidity");
const pressureEl = document.getElementById("pressure");
const systemStatusEl = document.getElementById("system-status");
const lastUpdatedEl = document.getElementById("last-updated");
const alertsContainer = document.getElementById("alerts-container");

const chatbotBtn = document.getElementById("chatbot-btn");
const chatPanel = document.getElementById("chat-panel");
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

// Open / close chat
chatbotBtn.addEventListener("click", () => {
  chatPanel.style.display =
    chatPanel.style.display === "flex" ? "none" : "flex";
});

function addMessage(text, sender) {
  const msg = document.createElement("div");
  msg.classList.add("message");
  msg.classList.add(sender === "user" ? "user-msg" : "bot-msg");
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showAlert(msg) {
  const alert = document.createElement("div");
  alert.className = "alert";
  alert.textContent = msg;
  alertsContainer.appendChild(alert);
  setTimeout(() => alert.remove(), 4000);
}

// Send message to Flask backend
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  userInput.value = "";

  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: text })
    });

    const data = await response.json();
    addMessage(data.response, "bot");
  } catch (error) {
    addMessage("Server error: could not reach Flask backend.", "bot");
    console.error(error);
  }
}

sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Optional placeholder dashboard values
function setPlaceholderData() {
  temperatureEl.textContent = "-- °C";
  humidityEl.textContent = "-- %";
  pressureEl.textContent = "-- Pa";
  systemStatusEl.textContent = "Online";
  lastUpdatedEl.textContent =
    "Last Updated: " + new Date().toLocaleTimeString();
}

setPlaceholderData();