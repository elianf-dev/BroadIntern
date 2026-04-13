from flask import Flask, render_template, request, jsonify
import sqlite3
import spacy
import serial
import time

app = Flask(__name__)

# -----------------------------
# AI setup
# -----------------------------
try:
    nlp = spacy.load("en_core_web_sm")
    print("--- AI ENGINE: ONLINE ---")
except Exception:
    nlp = None
    print("--- AI ERROR: Run 'python3 -m spacy download en_core_web_sm' ---")

# -----------------------------
# Database setup
# -----------------------------
def init_db():
    conn = sqlite3.connect("chatbot.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_msg TEXT,
            bot_res TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    print("--- DATABASE INITIALIZED ---")

# -----------------------------
# Serial setup
# -----------------------------
SERIAL_PORT = "/dev/ttyUSB0"   
BAUD_RATE = 9600
nano = None

def connect_nano():
    global nano
    try:
        nano = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
        time.sleep(2)  # Nano resets when serial opens
        nano.reset_input_buffer()
        print(f"--- SERIAL CONNECTED: {SERIAL_PORT} @ {BAUD_RATE} ---")
        return True
    except Exception as e:
        nano = None
        print(f"--- SERIAL ERROR: {e} ---")
        return False

def send_serial_command(command):
    global nano

    if nano is None or not nano.is_open:
        if not connect_nano():
            return False, "Arduino not connected"

    try:
        nano.reset_input_buffer()
        nano.write(f"{command}\n".encode())
        time.sleep(0.2)

        # Read a few lines because DATA: streams continuously
        for _ in range(10):
            line = nano.readline().decode(errors="ignore").strip()
            if not line:
                continue

            # Ignore sensor stream lines
            if line.startswith("DATA:"):
                continue

            return True, line

        return True, "No ACK received"

    except Exception as e:
        print(f"--- SERIAL WRITE ERROR: {e} ---")
        return False, str(e)

# -----------------------------
# Routes
# -----------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/ask", methods=["POST"])
def ask():
    user_input = request.json.get("message", "").strip()

    if not user_input:
        return jsonify({"response": "No message received."})

    if nlp is None:
        return jsonify({"response": "AI engine is not available. Install the spaCy model first."})

    doc = nlp(user_input)
    tokens = [token.lemma_.lower() for token in doc]
    print(f"Tokens: {tokens}")

    response = ""

    # Greeting
    if "hello" in tokens or "hi" in tokens or "hey" in tokens:
        response = "Broadino System Online. Ready for commands."

    # Health check
    elif "ping" in tokens:
        ok, reply = send_serial_command("PING")
        response = f"Nano reply: {reply}" if ok else f"Serial error: {reply}"

    # Status
    elif "status" in tokens:
        ok, reply = send_serial_command("PING")
        if ok:
            response = f"Industrial Status: Nano online ({reply}). Database logging active."
        else:
            response = f"Industrial Status: Nano offline. {reply}"

    # LED ON
    elif ("led" in tokens or "light" in tokens) and ("on" in tokens or "activate" in tokens):
        ok, reply = send_serial_command("LED_ON")
        response = f"LED command sent. Nano says: {reply}" if ok else f"LED command failed: {reply}"

    # LED OFF
    elif ("led" in tokens or "light" in tokens) and "off" in tokens:
        ok, reply = send_serial_command("LED_OFF")
        response = f"LED off command sent. Nano says: {reply}" if ok else f"LED off failed: {reply}"

    # BUZZER ON
    elif ("buzzer" in tokens or "buzz" in tokens or "alarm" in tokens) and "on" in tokens:
        ok, reply = send_serial_command("BUZZ_ON")
        response = f"Buzzer command sent. Nano says: {reply}" if ok else f"Buzzer command failed: {reply}"

    # BUZZER OFF
    elif ("buzzer" in tokens or "buzz" in tokens or "alarm" in tokens) and ("off" in tokens or "stop" in tokens):
        ok, reply = send_serial_command("BUZZ_OFF")
        response = f"Buzzer off command sent. Nano says: {reply}" if ok else f"Buzzer off failed: {reply}"

    # ALERT ON / OFF
    elif "alert" in tokens or "emergency" in tokens:
        if "off" in tokens or "stop" in tokens or "cancel" in tokens:
            ok, reply = send_serial_command("ALERT_OFF")
            response = f"Alert off command sent. Nano says: {reply}" if ok else f"Alert off failed: {reply}"
        else:
            ok, reply = send_serial_command("ALERT_ON")
            response = f"Alert command sent. Nano says: {reply}" if ok else f"Alert command failed: {reply}"

    # ALL OFF
    elif "all" in tokens and "off" in tokens:
        ok, reply = send_serial_command("ALL_OFF")
        response = f"All off command sent. Nano says: {reply}" if ok else f"All off failed: {reply}"

    else:
        response = f"Analyzed: {user_input}. No hardware intent found."

    # Log to database
    try:
        conn = sqlite3.connect("chatbot.db")
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO history (user_msg, bot_res) VALUES (?, ?)",
            (user_input, response)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"DB Error: {e}")

    return jsonify({"response": response})

if __name__ == "__main__":
    init_db()
    connect_nano()
    app.run(host="0.0.0.0", port=5000, debug=True)
