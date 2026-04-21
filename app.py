from flask import Flask, render_template, request, jsonify
import sqlite3
import spacy
import serial
import time
import threading

app = Flask(__name__)

# -----------------------------
# Speak to chat (uncomment below + install libs to enable voice input)
# -----------------------------
# import json
# import pyaudio
# from vosk import Model, KaldiRecognizer
# vosk_model = Model(# path to the model here )
# rec = KaldiRecognizer(vosk_model, 16000)
# mic = pyaudio.PyAudio()


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
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sensor_data (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            temp      REAL,
            hum       REAL,
            dist      REAL,
            smoke     INTEGER,
            joy_x     INTEGER,
            joy_y     INTEGER,
            raw       TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    print("--- DATABASE INITIALIZED ---")

# -----------------------------
# Serial setup
# -----------------------------
SERIAL_PORT    = "/dev/ttyUSB0"
BAUD_RATE      = 9600
nano           = None
serial_lock    = threading.Lock()
sending_command = threading.Event()  # FIX: signals stream thread to pause during commands

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

    # Signal stream thread to pause, wait long enough for it to finish current readline
    sending_command.set()
    time.sleep(0.5)  # increased from 0.3 — gives stream thread time to exit its readline

    with serial_lock:
        if nano is None or not nano.is_open:
            if not connect_nano():
                sending_command.clear()
                return False, "Arduino not connected"

        try:
            nano.reset_input_buffer()
            nano.write(f"{command}\n".encode())
            time.sleep(0.4)  # increased from 0.2 — Nano needs time to process and reply

            # Read up to 20 lines with a deadline — skip DATA: stream lines, grab first ACK
            deadline = time.time() + 2.0  # 2-second timeout
            while time.time() < deadline:
                line = nano.readline().decode(errors="ignore").strip()
                if not line:
                    continue
                if line.startswith("DATA:"):
                    continue  # skip sensor stream lines, keep waiting for ACK
                print(f"[ACK] {line}")
                sending_command.clear()
                return True, line

            sending_command.clear()
            return True, "No ACK received"

        except Exception as e:
            print(f"--- SERIAL WRITE ERROR: {e} ---")
            sending_command.clear()  # always resume even on error
            return False, str(e)

# -----------------------------
# Sensor stream background thread
# Nano format: DATA:temp,hum,dist,smoke,joy_x,joy_y
# -----------------------------
def read_sensor_stream():
    global nano
    while True:
        try:
            # FIX: pause stream while a command is being sent
            if sending_command.is_set():
                time.sleep(0.1)
                continue

            if nano is None or not nano.is_open:
                time.sleep(2)
                connect_nano()
                continue

            with serial_lock:
                line = nano.readline().decode(errors="ignore").strip()

            if not line.startswith("DATA:"):
                continue

            raw = line[5:]  # Strip "DATA:" prefix
            print(f"[SENSOR] {raw}")

            parts = raw.split(",")
            if len(parts) != 6:
                print(f"[SENSOR] Unexpected format, skipping: {raw}")
                continue

            temp  = float(parts[0])
            hum   = float(parts[1])
            dist  = float(parts[2])
            smoke = int(parts[3])
            joy_x = int(parts[4])
            joy_y = int(parts[5])
            
            # Raw joystick for hazard detection (before deadzone)
            raw_joy_x = int(parts[4])
            raw_joy_y = int(parts[5])

            # Deadzone filter
            if abs(joy_x - 512) < 20:
                joy_x = 512
            if abs(joy_y - 512) < 20:
                joy_y = 512

            # Auto emergency trigger
            check_auto_emergency(smoke, dist)

            # Joystick hazard check
            check_joystick_hazard(raw_joy_x, raw_joy_y)

            conn = sqlite3.connect("chatbot.db")
            cursor = conn.cursor()
            cursor.execute(
                """INSERT INTO sensor_data (temp, hum, dist, smoke, joy_x, joy_y, raw)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (temp, hum, dist, smoke, joy_x, joy_y, raw)
            )
            conn.commit()
            conn.close()

        except Exception as e:
            print(f"--- STREAM READ ERROR: {e} ---")
            time.sleep(1)
            if nano and nano.is_open:
                nano.close()
            nano = None

# -----------------------------
# Routes
# -----------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/sensor", methods=["GET"])
def get_sensor_data():
    try:
        conn = sqlite3.connect("chatbot.db")
        cursor = conn.cursor()
        cursor.execute(
            """SELECT temp, hum, dist, smoke, joy_x, joy_y, raw, timestamp
               FROM sensor_data ORDER BY id DESC LIMIT 1"""
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return jsonify({
                "temp":      row[0],
                "hum":       row[1],
                "dist":      row[2],
                "smoke":     row[3],
                "joy_x":     row[4],
                "joy_y":     row[5],
                "raw":       row[6],
                "timestamp": row[7]
            })
        else:
            return jsonify({"raw": None, "timestamp": None})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -----------------------------
# Auto emergency trigger
# Called from sensor stream when thresholds are breached
# -----------------------------
emergency_active = False

def check_auto_emergency(smoke, dist):
    global emergency_active
    should_trigger = (smoke > 400) or (dist != -1 and dist < 20)
    if should_trigger and not emergency_active:
        emergency_active = True
        print("[AUTO-EMERGENCY] Threshold breached — triggering ALERT_ON")
        send_serial_command("ALERT_ON")
    elif not should_trigger and emergency_active:
        emergency_active = False
        print("[AUTO-EMERGENCY] Values normal — triggering ALERT_OFF")
        send_serial_command("ALERT_OFF")

# -----------------------------
# Joystick hazard check
# Triggered from sensor stream when joy_x and joy_y are in 0-100 range
# -----------------------------
hazard_active = False

def check_joystick_hazard(joy_x, joy_y):
    global hazard_active
    in_hazard_zone = (0 <= joy_x <= 100) and (0 <= joy_y <= 100)
    if in_hazard_zone and not hazard_active:
        hazard_active = True
        print("[JOYSTICK-HAZARD] Hazard zone detected — triggering ALERT_ON")
        send_serial_command("ALERT_ON")
    elif not in_hazard_zone and hazard_active:
        hazard_active = False
        print("[JOYSTICK-HAZARD] Joystick returned to normal")
        send_serial_command("ALERT_OFF")

# -----------------------------
# History endpoint — last N sensor readings
# -----------------------------
@app.route("/history", methods=["GET"])
def get_history():
    try:
        limit = int(request.args.get("limit", 10))
        conn = sqlite3.connect("chatbot.db")
        cursor = conn.cursor()
        cursor.execute(
            """SELECT temp, hum, dist, smoke, joy_x, joy_y, timestamp
               FROM sensor_data ORDER BY id DESC LIMIT ?""",
            (limit,)
        )
        rows = cursor.fetchall()
        conn.close()
        return jsonify([{
            "temp": r[0], "hum": r[1], "dist": r[2],
            "smoke": r[3], "joy_x": r[4], "joy_y": r[5], "timestamp": r[6]
        } for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/ask", methods=["POST"])
def ask():
    user_input = request.json.get("message", "").strip()

    if not user_input:
        return jsonify({"response": "No message received."})

    if nlp is None:
        return jsonify({"response": "AI engine is not available. Install the spaCy model first."})

    doc    = nlp(user_input)
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

    # ----- MORNING ROUTINE -----
    elif "morning" in tokens:
        results = []
        ok1, r1 = send_serial_command("LED_ON")
        results.append(f"LED ON: {r1}")
        ok2, r2 = send_serial_command("BUZZ_OFF")
        results.append(f"Buzzer OFF: {r2}")
        ok3, r3 = send_serial_command("ALERT_OFF")
        results.append(f"Alert OFF: {r3}")
        response = "Morning routine executed. " + " | ".join(results)

    # ----- NIGHT ROUTINE -----
    elif "night" in tokens:
        results = []
        ok1, r1 = send_serial_command("LED_OFF")
        results.append(f"LED OFF: {r1}")
        ok2, r2 = send_serial_command("BUZZ_OFF")
        results.append(f"Buzzer OFF: {r2}")
        ok3, r3 = send_serial_command("ALERT_OFF")
        results.append(f"Alert OFF: {r3}")
        response = "Night routine executed. " + " | ".join(results)

    # ----- HISTORICAL DATA QUERY -----
    elif "last" in tokens or "history" in tokens or "show" in tokens or "data" in tokens:
        # Extract number from tokens if present e.g. "show last 10 data"
        limit = 5
        for token in doc:
            if token.like_num:
                try:
                    limit = min(int(token.text), 50)
                    break
                except:
                    pass
        try:
            conn = sqlite3.connect("chatbot.db")
            cursor = conn.cursor()
            cursor.execute(
                """SELECT temp, hum, dist, smoke, timestamp
                   FROM sensor_data ORDER BY id DESC LIMIT ?""",
                (limit,)
            )
            rows = cursor.fetchall()
            conn.close()
            if rows:
                lines = [f"Last {len(rows)} readings:"]
                for r in rows:
                    lines.append(f"  {r[4][:19]} | T:{r[0]}°C H:{r[1]}% D:{r[2]}cm S:{r[3]}")
                response = "\n".join(lines)
            else:
                response = "No historical data found in database."
        except Exception as e:
            response = f"DB query error: {e}"

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

# Voice input route — uncomment when vosk/pyaudio are installed and imports above are enabled
# @app.route("/listen", methods=["POST"])
# def listen():
#     try:
#         stream = mic.open(format=pyaudio.paInt16, channels=1, rate=16000,
#                           input=True, frames_per_buffer=8192)
#         stream.start_stream()
#         text = ""
#         while True:
#             data = stream.read(4096, exception_on_overflow=False)
#             if rec.AcceptWaveform(data):
#                 result = json.loads(rec.Result())
#                 text = result.get("text", "")
#                 break
#         stream.stop_stream()
#         stream.close()
#         return jsonify({"transcript": text})
#     except Exception as e:
#         print(f"STT Error: {e}")
#         return jsonify({"transcript": "", "error": str(e)}), 500

if __name__ == "__main__":
    init_db()
    connect_nano()

    sensor_thread = threading.Thread(target=read_sensor_stream, daemon=True)
    sensor_thread.start()

    app.run(host="0.0.0.0", port=5000, debug=True)
