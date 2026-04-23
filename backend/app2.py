from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
import sqlite3

app = Flask(__name__)
CORS(app)

DB_NAME = "iot_alerts.db"

ALLOWED_ALERT_TYPES = ["LOW_RISK", "HIGH_RISK"]
ALLOWED_STATUS = ["ACTIVE", "ACKNOWLEDGED", "RESOLVED"]

# ------------------ DATABASE CONNECTION ------------------

def get_db():
    conn = sqlite3.connect(
        DB_NAME,
        check_same_thread=False,
        timeout=10
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

# ------------------ DATABASE SETUP ------------------

def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            device_id TEXT PRIMARY KEY,
            device_key TEXT NOT NULL,
            location TEXT,
            registered_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT,
            alert_type TEXT,
            latitude REAL,
            longitude REAL,
            timestamp TEXT,
            status TEXT,
            FOREIGN KEY(device_id) REFERENCES devices(device_id)
        )
    """)

    conn.commit()
    conn.close()

init_db()

# ------------------ DEVICE REGISTRATION ------------------

@app.route("/api/devices/register", methods=["POST"])
def register_device():
    data = request.json
    device_id = data.get("device_id")
    device_key = data.get("device_key")
    location = data.get("location", "unknown")

    if not device_id or not device_key:
        return jsonify({"error": "device_id and device_key required"}), 400

    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute(
            "INSERT INTO devices VALUES (?, ?, ?, ?)",
            (device_id, device_key, location, datetime.now().isoformat())
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Device already registered"}), 409
    finally:
        conn.close()

    return jsonify({"message": "Device registered successfully"})

# ------------------ ALERT INGESTION ------------------

@app.route("/api/alerts", methods=["POST"])
def receive_alert():
    data = request.json

    device_id = data.get("device_id")
    device_key = data.get("device_key")
    alert_type = data.get("type", "LOW_RISK")

    if not device_id or not device_key:
        return jsonify({"error": "Missing device credentials"}), 400

    if alert_type not in ALLOWED_ALERT_TYPES:
        return jsonify({
            "error": "Invalid alert type",
            "allowed": ALLOWED_ALERT_TYPES
        }), 400

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT device_key FROM devices WHERE device_id = ?",
        (device_id,)
    )
    device = cur.fetchone()

    if not device:
        conn.close()
        return jsonify({"error": "Unregistered device"}), 403

    if device["device_key"] != device_key:
        conn.close()
        return jsonify({"error": "Invalid device key"}), 401

    lat = data.get("lat", 0.0)
    lng = data.get("lng", 0.0)

    cur.execute("""
        INSERT INTO alerts (device_id, alert_type, latitude, longitude, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        device_id,
        alert_type,
        lat,
        lng,
        datetime.now().isoformat(),
        "ACTIVE"
    ))

    conn.commit()
    alert_id = cur.lastrowid
    conn.close()

    return jsonify({
        "alert_id": alert_id,
        "device_id": device_id,
        "alert_type": alert_type,
        "latitude": lat,
        "longitude": lng,
        "status": "ACTIVE"
    })

# ------------------ GET ALERTS ------------------

@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT alert_id, device_id, alert_type, latitude, longitude, timestamp, status
        FROM alerts
        WHERE status != 'RESOLVED'
        ORDER BY alert_id DESC
        LIMIT 100
    """)

    alerts = [dict(row) for row in cur.fetchall()]
    conn.close()

    return jsonify(alerts)



# ------------------ UPDATE ALERT STATUS ------------------

@app.route("/api/alerts/update", methods=["POST"])
def update_alert_status():
    data = request.json
    alert_id = data.get("alert_id")
    new_status = data.get("status")

    if new_status not in ["ACKNOWLEDGED", "RESOLVED"]:
        return jsonify({"error": "Invalid status"}), 400

    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        "SELECT status, alert_type FROM alerts WHERE alert_id = ?",
        (alert_id,)
    )
    row = cur.fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "Alert not found"}), 404

    current_status = row["status"]
    alert_type = row["alert_type"]

    # -------- STATE MACHINE --------
    if current_status == "ACTIVE" and new_status == "ACKNOWLEDGED":
        pass
    elif current_status == "ACKNOWLEDGED" and new_status == "RESOLVED":
        pass
    else:
        conn.close()
        return jsonify({
            "error": f"Invalid transition {current_status} → {new_status}"
        }), 409

    cur.execute(
        "UPDATE alerts SET status = ? WHERE alert_id = ?",
        (new_status, alert_id)
    )

    conn.commit()
    conn.close()

    return jsonify({"message": "Alert status updated"})

# ------------------ DELETE DEVICE ------------------

@app.route("/api/devices/delete", methods=["POST"])
def delete_device():
    data = request.json
    device_id = data.get("device_id")

    if not device_id:
        return jsonify({"error": "device_id required"}), 400

    conn = get_db()
    cur = conn.cursor()

    cur.execute("DELETE FROM alerts WHERE device_id = ?", (device_id,))
    cur.execute("DELETE FROM devices WHERE device_id = ?", (device_id,))

    conn.commit()
    conn.close()

    return jsonify({"message": "Device deleted"})   

# ------------------ HEALTH CHECK ------------------

@app.route("/")
def home():
    return "Flask backend running ✅"

# ------------------ RUN SERVER ------------------

@app.route('/button')
def serve_button():
    return send_from_directory('../button', 'index.html')

@app.route('/dashboard')
def serve_dashboard():
    return send_from_directory('../dashboard', 'index.html')

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        threaded=True
    )
