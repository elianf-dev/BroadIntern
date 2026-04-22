// ---- DOM ELEMENTS ----
const tempEl          = document.getElementById('temperature');
const humEl           = document.getElementById('humidity');
const distEl          = document.getElementById('distance');
const smokeEl         = document.getElementById('smoke');
const joystickEl      = document.getElementById('joystick');
const buzzerStatusEl  = document.getElementById('buzzer-status');
const ledStatusEl     = document.getElementById('led-status');
const systemStatusEl  = document.getElementById('system-status');
const lastUpdatedEl   = document.getElementById('last-updated');
const alertsContainer = document.getElementById('alerts-container');
const chatbotBtn      = document.getElementById('chatbot-btn');
const chatPanel       = document.getElementById('chat-panel');
const chatMessages    = document.getElementById('chat-messages');
const userInput       = document.getElementById('user-input');
const sendBtn         = document.getElementById('send-btn');
const hazardBanner    = document.getElementById('hazard-banner');

// ---- CHAT TOGGLE ----
if (chatbotBtn && chatPanel) {
    chatbotBtn.addEventListener('click', () => {
        chatPanel.style.display =
            chatPanel.style.display === 'flex' ? 'none' : 'flex';
    });
}

// ---- SET COLOR ----
function setColor(el, level) {
    if (!el) return;
    el.classList.remove('green', 'yellow', 'red');
    el.classList.add(level);
}

// ---- HAZARD ----
function setHazard(active) {
    if (hazardBanner) {
        hazardBanner.style.display = active ? 'block' : 'none';
    }
}

// ---- ALERT ----
let lastAlertMsg = '';
let lastAlertTime = 0;

function showAlert(msg) {
    if (!alertsContainer) return;

    const now = Date.now();
    if (msg === lastAlertMsg && now - lastAlertTime < 5000) return;

    lastAlertMsg = msg;
    lastAlertTime = now;

    const el = document.createElement('div');
    el.className = 'alert';
    el.textContent = msg;
    alertsContainer.appendChild(el);

    setTimeout(() => el.remove(), 4000);
}

// ---- ADD MESSAGE ----
function addMessage(text, sender) {
    if (!chatMessages) return;

    const msg = document.createElement('div');
    msg.classList.add('message', sender === 'user' ? 'user-msg' : 'bot-msg');
    msg.textContent = text;

    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (sender === 'bot') {
        const t = text.toLowerCase();

        if (t.includes('led_on')) {
            ledStatusEl.textContent = "ON";
            setColor(ledStatusEl, 'green');
        } else if (t.includes('led_off')) {
            ledStatusEl.textContent = "OFF";
            setColor(ledStatusEl, 'yellow');
        }

        if (t.includes('buzz_on')) {
            buzzerStatusEl.textContent = "ON";
            setColor(buzzerStatusEl, 'red');
        } else if (t.includes('buzz_off')) {
            buzzerStatusEl.textContent = "OFF";
            setColor(buzzerStatusEl, 'green');
        }

        if (t.includes('alert_on')) {
            ledStatusEl.textContent = "ALERT";
            buzzerStatusEl.textContent = "ALERT";
            setColor(ledStatusEl, 'red');
            setColor(buzzerStatusEl, 'red');
        }
    }
}

// ---- FALLBACK COMMAND ----
function handleCommand(input) {
    input = input.toLowerCase();

    if (input.includes('temp')) return tempEl.textContent;
    if (input.includes('humidity')) return humEl.textContent;
    if (input.includes('distance')) return distEl.textContent;

    return "Unknown command";
}

// ---- SEND ----
if (sendBtn && userInput) {
    sendBtn.addEventListener('click', async () => {
        const text = userInput.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        userInput.value = '';

        try {
            const res = await fetch('/ask', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({message:text})
            });

            const data = await res.json();
            addMessage(data.response, 'bot');
        } catch {
            addMessage(handleCommand(text), 'bot');
        }
    });

    userInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') sendBtn.click();
    });
}

// ---- UPDATE DATA ----
async function updateData() {
    try {
        const res = await fetch('/sensor');
        const data = await res.json();

        if (!data.raw) {
            systemStatusEl.textContent = "Waiting...";
            return;
        }

        const { temp, hum, dist, smoke, joy_x, joy_y } = data;

        tempEl.textContent = `${temp} °C`;
        humEl.textContent  = `${hum} %`;
        distEl.textContent = `${dist} cm`;
        smokeEl.textContent = `${smoke}`;

        if (smoke > 400) showAlert("SMOKE DETECTED");

        systemStatusEl.textContent = "ONLINE";
        lastUpdatedEl.textContent = new Date().toLocaleTimeString();

        setHazard(joy_x <= 100 && joy_y <= 100);

    } catch {
        systemStatusEl.textContent = "ERROR";
    }
}

// ---- LOOP ----
setInterval(updateData, 2000);
updateData();
