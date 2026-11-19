# Mini-Bot Vision
Landing page (/) -> dashboard (/dashboard). Object detection runs in the browser with
TensorFlow.js COCO-SSD on your laptop webcam; Flask stores events, verification and drives the GPIO buzzer on a Pi.

## Run (VS Code terminal)
```
python -m venv .venv
.venv\Scripts\activate          (Windows)   |   source .venv/bin/activate  (Linux/Pi)
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5000 in Chrome or Edge, click "Open dashboard", allow the camera.
Needs internet on first load (downloads TensorFlow.js + the model).
Test: hold up a bottle or phone -> foreign object alert. Person, chair, tv, laptop are allowed by default.

## Raspberry Pi
`pip install gpiozero`, wire buzzer to GPIO17, open the dashboard in Chromium on the Pi.

## Voice object detection (Mini-Bot)
say or type: what do you see | find bottle | is there a phone | how many people | any foreign objects | stop looking
Other: forward, backward, left, right, stop, pause detection, resume, mute, unmute
