"""
Mini-Bot Vision - Flask backend.
The camera + object detection (TensorFlow.js COCO-SSD) run in the browser, using your
laptop webcam (or the Pi camera when the dashboard is opened on the Raspberry Pi).
This server stores detections, foreign-object events, verification results and
drives the GPIO buzzer when running on a Raspberry Pi.
"""
import os, time, threading, base64
from datetime import datetime
from flask import Flask, jsonify, render_template, request

BASE = os.path.dirname(os.path.abspath(__file__))
CAP_DIR = os.path.join(BASE, "static", "captures")
os.makedirs(CAP_DIR, exist_ok=True)
BUZZER_PIN = 17  # GPIO17 (physical pin 11)

app = Flask(__name__)
S = {
    "armed": True, "confidence": 0.35, "buzzer_on": True, "buzzing": False, "bot": "idle",
    "allowed": ["person", "chair", "tv", "laptop", "keyboard", "mouse"],  # others = foreign
    "detections": [], "counts": {}, "events": [], "log": [],
}
_last_alert, _eid = {}, 0

try:
    from gpiozero import Buzzer
    _buzzer = Buzzer(BUZZER_PIN)
except Exception:
    _buzzer = None  # not on a Pi: the browser plays the alert sound instead

def log(msg):
    S["log"].insert(0, {"t": datetime.now().strftime("%H:%M:%S"), "msg": msg}); del S["log"][40:]

def beep(seconds=0.6):
    def run():
        S["buzzing"] = True
        if _buzzer: _buzzer.on()
        time.sleep(seconds)
        if _buzzer: _buzzer.off()
        S["buzzing"] = False
    if S["buzzer_on"]: threading.Thread(target=run, daemon=True).start()

@app.route("/")
def landing(): return render_template("landing.html")

@app.route("/dashboard")
def dashboard(): return render_template("dashboard.html")

@app.route("/api/detections", methods=["POST"])
def detections():
    global _eid
    d = request.get_json(force=True)
    dets, counts = d.get("detections", []), {}
    for x in dets:
        x["foreign"] = x["label"] not in S["allowed"]
        counts[x["label"]] = counts.get(x["label"], 0) + 1
    S["detections"], S["counts"] = dets, counts
    snap, label = d.get("snapshot"), d.get("snap_label")
    if snap and label and S["armed"] and time.time() - _last_alert.get(label, 0) > 8:
        _last_alert[label] = time.time(); _eid += 1
        fn = f"event_{_eid}.jpg"
        with open(os.path.join(CAP_DIR, fn), "wb") as f: f.write(base64.b64decode(snap.split(",")[-1]))
        S["events"].insert(0, {"id": _eid, "time": datetime.now().strftime("%H:%M:%S"), "label": label,
                               "conf": round(float(d.get("snap_conf", 0)), 2), "status": "pending",
                               "img": f"/static/captures/{fn}"})
        del S["events"][30:]
        log(f"Foreign object: {label} - buzzer triggered"); beep()
    return jsonify(ok=True)

@app.route("/api/status")
def status():
    done = [e for e in S["events"] if e["status"] != "pending"]
    ok = [e for e in done if e["status"] == "confirmed"]
    out = {k: S[k] for k in ("armed", "confidence", "allowed", "detections", "counts", "events", "log", "buzzer_on", "buzzing", "bot")}
    out.update(verified=len(done), accuracy=round(100 * len(ok) / len(done)) if done else None)
    return jsonify(out)

@app.route("/api/settings", methods=["POST"])
def settings():
    d = request.get_json(force=True)
    if "armed" in d: S["armed"] = bool(d["armed"]); log("Detection " + ("armed" if S["armed"] else "paused"))
    if "confidence" in d: S["confidence"] = max(0.1, min(0.95, float(d["confidence"])))
    if "buzzer_on" in d: S["buzzer_on"] = bool(d["buzzer_on"]); log("Buzzer " + ("enabled" if S["buzzer_on"] else "muted"))
    if "allowed" in d: S["allowed"] = [str(x) for x in d["allowed"]]
    return jsonify(ok=True)

@app.route("/api/verify", methods=["POST"])
def verify():
    d = request.get_json(force=True)
    for e in S["events"]:
        if e["id"] == d.get("id") and d.get("verdict") in ("confirmed", "false_alarm"):
            e["status"] = d["verdict"]; log(f"Event #{e['id']} {e['label']}: {d['verdict'].replace('_', ' ')}")
    return jsonify(ok=True)

@app.route("/api/buzzer", methods=["POST"])
def buzzer(): beep(1.0); log("Buzzer test"); return jsonify(ok=True)

@app.route("/api/move", methods=["POST"])
def move():
    cmd = request.get_json(force=True).get("cmd", "stop")
    if cmd in ("forward", "backward", "left", "right", "stop"):
        S["bot"] = cmd; log(f"Mini-Bot: {cmd}")
        # TODO: drive your motor driver here (e.g. gpiozero.Robot)
    return jsonify(ok=True, bot=S["bot"])

@app.route("/api/clear", methods=["POST"])
def clear(): S["events"].clear(); log("Events cleared"); return jsonify(ok=True)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, threaded=True)
