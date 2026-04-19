// ---- DOM ELEMENTS (FIRST!) ----
const tempEl        = document.getElementById('temperature');
const humEl         = document.getElementById('humidity');
const distEl        = document.getElementById('distance');
const smokeEl       = document.getElementById('smoke');
const joystickEl    = document.getElementById('joystick');
const buzzerStatusEl= document.getElementById('buzzer-status');
const ledStatusEl   = document.getElementById('led-status');
const systemStatusEl= document.getElementById('system-status');
const lastUpdatedEl = document.getElementById('last-updated');
const alertsContainer = document.getElementById('alerts-container');
const chatbotBtn    = document.getElementById('chatbot-btn');
const chatPanel     = document.getElementById('chat-panel');
const chatMessages  = document.getElementById('chat-messages');
const userInput     = document.getElementById('user-input');
const sendBtn       = document.getElementById('send-btn');

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
// Prevents spamming the same alert repeatedly
let lastAlertMsg = "";
let lastAlertTime = 0;

function showAlert(msg) {
    const now = Date.now();
    if (msg === lastAlertMsg && now - lastAlertTime < 5000) return;
    lastAlertMsg  = msg;
    lastAlertTime = now;

    const alertEl = document.createElement('div');
    alertEl.className = 'alert';
    alertEl.textContent = msg;
    alertsContainer.appendChild(alertEl);
    setTimeout(() => alertEl.remove(), 4000);
}

// ---- SET METRIC COLOR ----
function setColor(el, level) {
    el.classList.remove('green', 'yellow', 'red');
    el.classList.add(level);
}

// ---- SMART COMMAND HANDLER (local fallback) ----
function handleCommand(input) {
    input = input.toLowerCase();
    let responses = [];

    if (input.includes('temp') || input.includes('temperature')) {
        responses.push(`🌡️ Temperature: ${tempEl.textContent}`);
    }
    if (input.includes('hum') || input.includes('humidity')) {
        responses.push(`💧 Humidity: ${humEl.textContent}`);
    }
    if (input.includes('dist') || input.includes('distance')) {
        responses.push(`📡 Distance: ${distEl.textContent}`);
    }
    if (input.includes('smoke') || input.includes('gas') || input.includes('mq')) {
        responses.push(`🔥 Smoke/MQ-2: ${smokeEl.textContent}`);
    }
    if (input.includes('joy') || input.includes('joystick')) {
        responses.push(`🕹️ Joystick: ${joystickEl.textContent}`);
    }
    if (input.includes('buzz') || input.includes('buzzer')) {
        responses.push(`🔔 Buzzer: ${buzzerStatusEl.textContent}`);
    }
    if (input.includes('led') || input.includes('light')) {
        responses.push(`💡 LED: ${ledStatusEl.textContent}`);
    }
    if (input.includes('status') || input.includes('system')) {
        responses.push(`🖥️ System: ${systemStatusEl.textContent}`);
    }
    if (input.includes('alert')) {
        showAlert("⚠️ Manual alert triggered!");
        responses.push("⚠️ Alert triggered successfully");
    }

    if (responses.length === 0) {
        return "I didn't understand. Try: temperature, humidity, distance, smoke, joystick, buzzer, led, or status.";
    }
    return responses.join("\n");
}

// ---- SEND MESSAGE ----
sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    userInput.value = '';

    // Try the Flask AI backend first
    fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
    })
    .then(res => res.json())
    .then(data => {
        addMessage(data.response, 'bot');
    })
    .catch(() => {
        // Fallback to local handler if backend is unreachable
        setTimeout(() => {
            addMessage(handleCommand(text), 'bot');
        }, 300);
    });
});

userInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendBtn.click();
});

// ---- LIVE SENSOR DATA ----
async function updateData() {
    try {
        const res  = await fetch('/sensor');
        const data = await res.json();

        if (!data.raw) {
            systemStatusEl.textContent = "Waiting for sensor data...";
            setColor(systemStatusEl, 'yellow');
            return;
        }

        // Nano format: DATA:temp,hum,dist,smoke,joy_x,joy_y
        const temp  = data.temp;
        const hum   = data.hum;
        const dist  = data.dist;
        const smoke = data.smoke;
        const joyX  = data.joy_x;
        const joyY  = data.joy_y;

        // ── Temperature ──
        if (temp === -1) {
            tempEl.textContent = "DHT11 Error";
            setColor(tempEl, 'red');
        } else {
            tempEl.textContent = `${temp.toFixed(1)} °C`;
            setColor(tempEl, temp > 35 ? 'red' : temp > 28 ? 'yellow' : 'green');
        }

        // ── Humidity ──
        if (hum === -1) {
            humEl.textContent = "DHT11 Error";
            setColor(humEl, 'red');
        } else {
            humEl.textContent = `${hum.toFixed(1)} %`;
            setColor(humEl, hum > 80 ? 'red' : hum > 60 ? 'yellow' : 'green');
        }

        // ── Distance ──
        if (dist === -1) {
            distEl.textContent = "No object detected";
            setColor(distEl, 'yellow');
        } else {
            distEl.textContent = `${dist.toFixed(1)} cm`;
            setColor(distEl, dist < 10 ? 'red' : dist < 30 ? 'yellow' : 'green');
        }

        // ── Smoke / MQ-2 ──
        smokeEl.textContent = `${smoke} ${smoke > 400 ? "⚠️ ALERT" : "✅ Clear"}`;
        setColor(smokeEl, smoke > 400 ? 'red' : smoke > 300 ? 'yellow' : 'green');
        if (smoke > 400) {
            showAlert("⚠️ Smoke detected! Level: " + smoke);
        }

        // ── Joystick ──
        joystickEl.textContent = `X: ${joyX} / Y: ${joyY}`;
        setColor(joystickEl, 'green');

        // ── Buzzer & LED status (reflect last known state from page or commands) ──
        // These are outputs, not sensor readings — their state is managed by commands.
        // We leave them as-is unless a command updates them.

        // ── System ──
        systemStatusEl.textContent = "ONLINE";
        setColor(systemStatusEl, 'green');
        lastUpdatedEl.textContent  = "Last Updated: " + new Date().toLocaleTimeString();

    } catch (err) {
        console.error("Sensor fetch error:", err);
        systemStatusEl.textContent = "Connection error";
        setColor(systemStatusEl, 'red');
    }
}

// ---- UPDATE LED/BUZZER STATUS AFTER COMMANDS ----
// Intercept bot responses to reflect output state in the UI
const origAddMessage = addMessage;
function addMessage(text, sender) {
    origAddMessage(text, sender);
    if (sender === 'bot') {
        const t = text.toLowerCase();
        if (t.includes('led_on') || t.includes('led command sent')) {
            ledStatusEl.textContent = "ON";
            setColor(ledStatusEl, 'green');
        } else if (t.includes('led_off') || t.includes('led off command')) {
            ledStatusEl.textContent = "OFF";
            setColor(ledStatusEl, 'yellow');
        }
        if (t.includes('buzz_on') || t.includes('buzzer command sent')) {
            buzzerStatusEl.textContent = "ON";
            setColor(buzzerStatusEl, 'red');
        } else if (t.includes('buzz_off') || t.includes('buzzer off command')) {
            buzzerStatusEl.textContent = "OFF";
            setColor(buzzerStatusEl, 'green');
        }
        if (t.includes('alert_on') || t.includes('alert command sent')) {
            ledStatusEl.textContent    = "ALERT BLINK";
            buzzerStatusEl.textContent = "ALERT ON";
            setColor(ledStatusEl,    'red');
            setColor(buzzerStatusEl, 'red');
        } else if (t.includes('alert_off') || t.includes('alert off command')) {
            ledStatusEl.textContent    = "OFF";
            buzzerStatusEl.textContent = "OFF";
            setColor(ledStatusEl,    'yellow');
            setColor(buzzerStatusEl, 'green');
        }
        if (t.includes('all off command')) {
            ledStatusEl.textContent    = "OFF";
            buzzerStatusEl.textContent = "OFF";
            setColor(ledStatusEl,    'yellow');
            setColor(buzzerStatusEl, 'green');
        }
    }
}

setInterval(updateData, 2000);
updateData(); // Run immediately on page load
