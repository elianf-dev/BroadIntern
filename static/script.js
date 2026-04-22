// ---- DOM ELEMENTS ----
const tempEl         = document.getElementById('temperature');
const humEl          = document.getElementById('humidity');
const distEl         = document.getElementById('distance');
const smokeEl        = document.getElementById('smoke');
const joystickEl     = document.getElementById('joystick');
const buzzerStatusEl = document.getElementById('buzzer-status');
const ledStatusEl    = document.getElementById('led-status');
const systemStatusEl = document.getElementById('system-status');
const lastUpdatedEl  = document.getElementById('last-updated');
const alertsContainer= document.getElementById('alerts-container');
const chatbotBtn     = document.getElementById('chatbot-btn');
const chatPanel      = document.getElementById('chat-panel');
const chatMessages   = document.getElementById('chat-messages');
const userInput      = document.getElementById('user-input');
const sendBtn        = document.getElementById('send-btn');
const hazardBanner   = document.getElementById('hazard-banner');

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

    if (sender === 'bot') {
        const t = text.toLowerCase();
        if (t.includes('led_on') || t.includes('led command sent')) {
            ledStatusEl.textContent = "ON"; setColor(ledStatusEl, 'green');
        } else if (t.includes('led_off') || t.includes('led off command')) {
            ledStatusEl.textContent = "OFF"; setColor(ledStatusEl, 'yellow');
        }
        if (t.includes('buzz_on') || t.includes('buzzer command sent')) {
            buzzerStatusEl.textContent = "ON"; setColor(buzzerStatusEl, 'red');
        } else if (t.includes('buzz_off') || t.includes('buzzer off command')) {
            buzzerStatusEl.textContent = "OFF"; setColor(buzzerStatusEl, 'green');
        }
        if (t.includes('alert_on') || t.includes('alert command sent')) {
            ledStatusEl.textContent = "ALERT BLINK"; setColor(ledStatusEl, 'red');
            buzzerStatusEl.textContent = "ALERT ON";  setColor(buzzerStatusEl, 'red');
        } else if (t.includes('alert_off') || t.includes('alert off command')) {
            ledStatusEl.textContent = "OFF"; setColor(ledStatusEl, 'yellow');
            buzzerStatusEl.textContent = "OFF"; setColor(buzzerStatusEl, 'green');
        }
        if (t.includes('all off command')) {
            ledStatusEl.textContent = "OFF"; setColor(ledStatusEl, 'yellow');
            buzzerStatusEl.textContent = "OFF"; setColor(buzzerStatusEl, 'green');
        }
    }
}

// ---- ALERT FUNCTION ----
let lastAlertMsg  = "";
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

// ---- HAZARD BANNER ----
function setHazard(active) {
    if (hazardBanner) hazardBanner.style.display = active ? 'block' : 'none';
}

// ---- LOCAL COMMAND FALLBACK ----
function handleCommand(input) {
    input = input.toLowerCase();
    let responses = [];
    if (input.includes('temp') || input.includes('temperature'))
        responses.push(`Temperature: ${tempEl.textContent}`);
    if (input.includes('hum') || input.includes('humidity'))
        responses.push(`Humidity: ${humEl.textContent}`);
    if (input.includes('dist') || input.includes('distance'))
        responses.push(`Distance: ${distEl.textContent}`);
    if (input.includes('smoke') || input.includes('gas') || input.includes('mq'))
        responses.push(`Smoke/MQ-2: ${smokeEl.textContent}`);
    if (input.includes('buzz') || input.includes('buzzer'))
        responses.push(`Buzzer: ${buzzerStatusEl.textContent}`);
    if (input.includes('led') || input.includes('light'))
        responses.push(`LED: ${ledStatusEl.textContent}`);
    if (input.includes('status') || input.includes('system'))
        responses.push(`System: ${systemStatusEl.textContent}`);
    if (input.includes('alert')) {
        showAlert("Manual alert triggered!");
        responses.push("Alert triggered successfully");
    }
    if (responses.length === 0)
        return "I didn't understand. Try: temperature, humidity, distance, smoke, buzzer, led, or status.";
    return responses.join("\n");
}

// ---- SEND MESSAGE ----
sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    userInput.value = '';
    fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
    })
    .then(res => res.json())
    .then(data => addMessage(data.response, 'bot'))
    .catch(() => setTimeout(() => addMessage(handleCommand(text), 'bot'), 300));
});

userInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendBtn.click();
});

// ---- CHARTS ----
const chartCfg = (label, color) => ({
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label, data: [],
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.3,
            fill: true
        }]
    },
    options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: '#777', maxTicksLimit: 6 }, grid: { color: '#333' } },
            y: { ticks: { color: '#777' }, grid: { color: '#333' } }
        }
    }
});

const tempChart = new Chart(document.getElementById('tempChart'), chartCfg('Temp °C', '#f44336'));
const humChart  = new Chart(document.getElementById('humChart'),  chartCfg('Humidity %', '#4caf50'));
const distChart = new Chart(document.getElementById('distChart'), chartCfg('Distance cm', '#00bcd4'));

// ---- SINGLE updateData — sensor + charts + hazard ----
async function updateData() {
    // 1. Live sensor card updates
    try {
        const res  = await fetch('/sensor');
        const data = await res.json();

        if (!data.raw) {
            systemStatusEl.textContent = "Waiting for sensor data...";
            setColor(systemStatusEl, 'yellow');
        } else {
            const { temp, hum, dist, smoke, joy_x: joyX, joy_y: joyY } = data;

            // Temperature
            if (temp === -1) {
                tempEl.textContent = "DHT11 Error"; setColor(tempEl, 'red');
            } else {
                tempEl.textContent = `${temp.toFixed(1)} °C`;
                setColor(tempEl, temp > 35 ? 'red' : temp > 28 ? 'yellow' : 'green');
                const tBar = document.getElementById('temp-bar');
                if (tBar) tBar.style.width = Math.min((temp / 60) * 100, 100) + "%";
            }

            // Humidity
            if (hum === -1) {
                humEl.textContent = "DHT11 Error"; setColor(humEl, 'red');
            } else {
                humEl.textContent = `${hum.toFixed(1)} %`;
                const humColor = hum > 80 ? 'red' : hum > 60 ? 'yellow' : 'green';
                setColor(humEl, humColor);
                const hBar = document.getElementById('hum-bar');
                if (hBar) {
                    hBar.style.width = `${hum}%`;
                    hBar.style.backgroundColor = humColor === 'red' ? '#f44336' : humColor === 'yellow' ? '#ffc107' : '#4caf50';
                }
            }

            // Distance
            if (dist === -1) {
                distEl.textContent = "No object detected"; setColor(distEl, 'yellow');
                const dBar = document.getElementById('dist-bar');
                if (dBar) dBar.style.width = "0%";
            } else {
                distEl.textContent = `${dist.toFixed(1)} cm`;
                const distColor = dist < 10 ? 'red' : dist < 30 ? 'yellow' : 'green';
                setColor(distEl, distColor);
                const dBar = document.getElementById('dist-bar');
                if (dBar) {
                    dBar.style.width = Math.min(100 - (dist / 400) * 100, 100) + "%";
                    dBar.style.backgroundColor = distColor === 'red' ? '#f44336' : distColor === 'yellow' ? '#ffc107' : '#00bcd4';
                }
            }

            // Smoke
            smokeEl.textContent = `${smoke} ${smoke > 400 ? "ALERT" : "Clear"}`;
            setColor(smokeEl, smoke > 400 ? 'red' : smoke > 300 ? 'yellow' : 'green');
            if (smoke > 400) showAlert("Smoke detected! Level: " + smoke);
            const sLight = document.getElementById('smoke-status-light');
            if (sLight) {
                sLight.style.backgroundColor = smoke > 400 ? "#f44336" : "transparent";
                sLight.style.borderColor      = smoke > 400 ? "#f44336" : "#444";
            }

            // System
            systemStatusEl.textContent = "ONLINE";
            setColor(systemStatusEl, 'green');
            lastUpdatedEl.textContent  = "Last Updated: " + new Date().toLocaleTimeString();
        }
    } catch (err) {
        console.error("Sensor fetch error:", err);
        systemStatusEl.textContent = "Connection error";
        setColor(systemStatusEl, 'red');
    }

    // 2. Charts + hazard from /history
    try {
        const res  = await fetch('/history?limit=20');
        const rows = await res.json();
        if (!rows || rows.error) return;

        const sorted = rows.slice().reverse();

        tempChart.data.labels = []; tempChart.data.datasets[0].data = [];
        humChart.data.labels  = []; humChart.data.datasets[0].data  = [];
        distChart.data.labels = []; distChart.data.datasets[0].data = [];

        sorted.forEach(r => {
            const label = r.timestamp ? r.timestamp.slice(11, 19) : '';
            if (r.temp !== -1) { tempChart.data.labels.push(label); tempChart.data.datasets[0].data.push(r.temp); }
            if (r.hum  !== -1) { humChart.data.labels.push(label);  humChart.data.datasets[0].data.push(r.hum);  }
            if (r.dist !== -1) { distChart.data.labels.push(label); distChart.data.datasets[0].data.push(r.dist); }
        });

        tempChart.update();
        humChart.update();
        distChart.update();

        // Hazard banner
        if (rows.length > 0) {
            const latest = rows[0];
            setHazard(latest.joy_x <= 100 && latest.joy_y <= 100);
        }
    } catch(e) {
        console.error('History fetch error:', e);
    }
}

setInterval(updateData, 2000);
updateData();            ledStatusEl.textContent = "ON"; setColor(ledStatusEl, 'green');
        } else if (t.includes('led_off') || t.includes('led off command')) {
            ledStatusEl.textContent = "OFF"; setColor(ledStatusEl, 'yellow');
        }
        if (t.includes('buzz_on') || t.includes('buzzer command sent')) {
            buzzerStatusEl.textContent = "ON"; setColor(buzzerStatusEl, 'red');
        } else if (t.includes('buzz_off') || t.includes('buzzer off command')) {
            buzzerStatusEl.textContent = "OFF"; setColor(buzzerStatusEl, 'green');
        }
        if (t.includes('alert_on') || t.includes('alert command sent')) {
            ledStatusEl.textContent = "ALERT BLINK"; setColor(ledStatusEl, 'red');
            buzzerStatusEl.textContent = "ALERT ON";  setColor(buzzerStatusEl, 'red');
        } else if (t.includes('alert_off') || t.includes('alert off command')) {
            ledStatusEl.textContent = "OFF"; setColor(ledStatusEl, 'yellow');
            buzzerStatusEl.textContent = "OFF"; setColor(buzzerStatusEl, 'green');
        }
        if (t.includes('all off command')) {
            ledStatusEl.textContent = "OFF"; setColor(ledStatusEl, 'yellow');
            buzzerStatusEl.textContent = "OFF"; setColor(buzzerStatusEl, 'green');
        }
    }
}

// ---- ALERT FUNCTION ----
let lastAlertMsg  = "";
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

// ---- HAZARD BANNER ----
function setHazard(active) {
    if (hazardBanner) hazardBanner.style.display = active ? 'block' : 'none';
}

// ---- LOCAL COMMAND FALLBACK ----
function handleCommand(input) {
    input = input.toLowerCase();
    let responses = [];
    if (input.includes('temp') || input.includes('temperature'))
        responses.push(`Temperature: ${tempEl.textContent}`);
    if (input.includes('hum') || input.includes('humidity'))
        responses.push(`Humidity: ${humEl.textContent}`);
    if (input.includes('dist') || input.includes('distance'))
        responses.push(`Distance: ${distEl.textContent}`);
    if (input.includes('smoke') || input.includes('gas') || input.includes('mq'))
        responses.push(`Smoke/MQ-2: ${smokeEl.textContent}`);
    if (input.includes('buzz') || input.includes('buzzer'))
        responses.push(`Buzzer: ${buzzerStatusEl.textContent}`);
    if (input.includes('led') || input.includes('light'))
        responses.push(`LED: ${ledStatusEl.textContent}`);
    if (input.includes('status') || input.includes('system'))
        responses.push(`System: ${systemStatusEl.textContent}`);
    if (input.includes('alert')) {
        showAlert("Manual alert triggered!");
        responses.push("Alert triggered successfully");
    }
    if (responses.length === 0)
        return "I didn't understand. Try: temperature, humidity, distance, smoke, buzzer, led, or status.";
    return responses.join("\n");
}

// ---- SEND MESSAGE ----
sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    userInput.value = '';
    fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
    })
    .then(res => res.json())
    .then(data => addMessage(data.response, 'bot'))
    .catch(() => setTimeout(() => addMessage(handleCommand(text), 'bot'), 300));
});

userInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendBtn.click();
});

// ---- CHARTS ----
const chartCfg = (label, color) => ({
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label, data: [],
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.3,
            fill: true
        }]
    },
    options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: '#777', maxTicksLimit: 6 }, grid: { color: '#333' } },
            y: { ticks: { color: '#777' }, grid: { color: '#333' } }
        }
    }
});

const tempChart = new Chart(document.getElementById('tempChart'), chartCfg('Temp °C', '#f44336'));
const humChart  = new Chart(document.getElementById('humChart'),  chartCfg('Humidity %', '#4caf50'));
const distChart = new Chart(document.getElementById('distChart'), chartCfg('Distance cm', '#00bcd4'));

// ---- SINGLE updateData — sensor + charts + hazard ----
async function updateData() {
    // 1. Live sensor card updates
    try {
        const res  = await fetch('/sensor');
        const data = await res.json();

        if (!data.raw) {
            systemStatusEl.textContent = "Waiting for sensor data...";
            setColor(systemStatusEl, 'yellow');
        } else {
            const { temp, hum, dist, smoke, joy_x: joyX, joy_y: joyY } = data;

            // Temperature
            if (temp === -1) {
                tempEl.textContent = "DHT11 Error"; setColor(tempEl, 'red');
            } else {
                tempEl.textContent = `${temp.toFixed(1)} °C`;
                setColor(tempEl, temp > 35 ? 'red' : temp > 28 ? 'yellow' : 'green');
                const tBar = document.getElementById('temp-bar');
                if (tBar) tBar.style.width = Math.min((temp / 60) * 100, 100) + "%";
            }

            // Humidity
            if (hum === -1) {
                humEl.textContent = "DHT11 Error"; setColor(humEl, 'red');
            } else {
                humEl.textContent = `${hum.toFixed(1)} %`;
                const humColor = hum > 80 ? 'red' : hum > 60 ? 'yellow' : 'green';
                setColor(humEl, humColor);
                const hBar = document.getElementById('hum-bar');
                if (hBar) {
                    hBar.style.width = `${hum}%`;
                    hBar.style.backgroundColor = humColor === 'red' ? '#f44336' : humColor === 'yellow' ? '#ffc107' : '#4caf50';
                }
            }

            // Distance
            if (dist === -1) {
                distEl.textContent = "No object detected"; setColor(distEl, 'yellow');
                const dBar = document.getElementById('dist-bar');
                if (dBar) dBar.style.width = "0%";
            } else {
                distEl.textContent = `${dist.toFixed(1)} cm`;
                const distColor = dist < 10 ? 'red' : dist < 30 ? 'yellow' : 'green';
                setColor(distEl, distColor);
                const dBar = document.getElementById('dist-bar');
                if (dBar) {
                    dBar.style.width = Math.min(100 - (dist / 400) * 100, 100) + "%";
                    dBar.style.backgroundColor = distColor === 'red' ? '#f44336' : distColor === 'yellow' ? '#ffc107' : '#00bcd4';
                }
            }

            // Smoke
            smokeEl.textContent = `${smoke} ${smoke > 400 ? "ALERT" : "Clear"}`;
            setColor(smokeEl, smoke > 400 ? 'red' : smoke > 300 ? 'yellow' : 'green');
            if (smoke > 400) showAlert("Smoke detected! Level: " + smoke);
            const sLight = document.getElementById('smoke-status-light');
            if (sLight) {
                sLight.style.backgroundColor = smoke > 400 ? "#f44336" : "transparent";
                sLight.style.borderColor      = smoke > 400 ? "#f44336" : "#444";
            }

            // System
            systemStatusEl.textContent = "ONLINE";
            setColor(systemStatusEl, 'green');
            lastUpdatedEl.textContent  = "Last Updated: " + new Date().toLocaleTimeString();
        }
    } catch (err) {
        console.error("Sensor fetch error:", err);
        systemStatusEl.textContent = "Connection error";
        setColor(systemStatusEl, 'red');
    }

    // 2. Charts + hazard from /history
    try {
        const res  = await fetch('/history?limit=20');
        const rows = await res.json();
        if (!rows || rows.error) return;

        const sorted = rows.slice().reverse();

        tempChart.data.labels = []; tempChart.data.datasets[0].data = [];
        humChart.data.labels  = []; humChart.data.datasets[0].data  = [];
        distChart.data.labels = []; distChart.data.datasets[0].data = [];

        sorted.forEach(r => {
            const label = r.timestamp ? r.timestamp.slice(11, 19) : '';
            if (r.temp !== -1) { tempChart.data.labels.push(label); tempChart.data.datasets[0].data.push(r.temp); }
            if (r.hum  !== -1) { humChart.data.labels.push(label);  humChart.data.datasets[0].data.push(r.hum);  }
            if (r.dist !== -1) { distChart.data.labels.push(label); distChart.data.datasets[0].data.push(r.dist); }
        });

        tempChart.update();
        humChart.update();
        distChart.update();

        // Hazard banner
        if (rows.length > 0) {
            const latest = rows[0];
            setHazard(latest.joy_x <= 100 && latest.joy_y <= 100);
        }
    } catch(e) {
        console.error('History fetch error:', e);
    }
}

setInterval(updateData, 2000);
updateData();
