// ---- DOM ELEMENTS (FIRST!) ----
const temperatureEl = document.getElementById('temperature');
const humidityEl = document.getElementById('humidity');
const pressureEl = document.getElementById('pressure');
const systemStatusEl = document.getElementById('system-status');
const lastUpdatedEl = document.getElementById('last-updated');
const alertsContainer = document.getElementById('alerts-container');

const chatbotBtn = document.getElementById('chatbot-btn');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
// const sttBtn = document.getElementById('stt-btn');

// ---- CHAT TOGGLE ----
chatbotBtn.addEventListener('click', () => {
  chatPanel.style.display =
    chatPanel.style.display === 'flex' ? 'none' : 'flex';
});

// ---- ADD MESSAGE ----
function addMessage(text, sender) {
  const msg = document.createElement('div');
  msg.classList.add('message');
  msg.classList.add(sender === 'user' ? 'user-msg' : 'bot-msg');
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---- ALERT FUNCTION ----
function showAlert(msg) {
  const alert = document.createElement('div');
  alert.className = 'alert';
  alert.textContent = msg;
  alertsContainer.appendChild(alert);
  setTimeout(() => alert.remove(), 4000);
}

// ---- SMART COMMAND HANDLER ----
function handleCommand(input) {
  input = input.toLowerCase();
  let responses = [];

  if (input.includes('temperature') || input.includes('temp')) {
    responses.push(`🌡️ Temperature is ${temperatureEl.textContent}`);
  }

  if (input.includes('humidity')) {
    responses.push(`💧 Humidity is ${humidityEl.textContent}`);
  }

  if (input.includes('pressure')) {
    responses.push(`🧭 Pressure is ${pressureEl.textContent}`);
  }

  if (input.includes('status') || input.includes('system')) {
    responses.push(`🖥️ System is ${systemStatusEl.textContent}`);
  }

  if (input.includes('alert')) {
    showAlert("⚠️ Manual alert triggered!");
    responses.push("⚠️ Alert triggered successfully");
  }

  if (responses.length === 0) {
    return "I didn’t understand. Try: temperature, status, or alert.";
  }

  return responses.join("\n");
}

// ---- SEND MESSAGE ----
sendBtn.addEventListener('click', () => {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  userInput.value = '';

  setTimeout(() => {
    addMessage(handleCommand(text), 'bot');
  }, 300);
});

userInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') sendBtn.click();
});

/*
// ---- SPEAK TO CHAT ----
sttBtn.addEventListener('click', async () => {
    const res = await fetch('/listen', { method: 'POST' });
    const data = await res.json();
    
    userInput.value = data.transcript;
});

*/

// ---- SIMULATED DATA ----
function random(min, max) {
  return Math.random() * (max - min) + min;
}

function updateData() {
  const temp = random(20, 100).toFixed(1);
  const hum = random(30, 80).toFixed(0);
  const pres = random(90000, 110000).toFixed(0);

  temperatureEl.textContent = `${temp} °C`;
  humidityEl.textContent = `${hum} %`;
  pressureEl.textContent = `${pres} Pa`;
  lastUpdatedEl.textContent =
    "Last Updated: " + new Date().toLocaleTimeString();

  temperatureEl.className =
    "metric " + (temp < 60 ? "green" : temp < 80 ? "yellow" : "red");

  // Random alert
  if (Math.random() < 0.05) {
    showAlert(`⚠️ High temperature: ${temp}°C`);
  }
}

setInterval(updateData, 2000);