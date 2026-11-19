const $ = s => document.querySelector(s);
const ALL = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];
let S = {allowed: [], events: [], log: [], detections: [], counts: {}, armed: true, confidence: .5}, seen = new Set(), first = true, audio;
let curDets = [], target = null, lastTargetSay = 0, talkT;
let model = null, stream = null, camOn = false, fps = 0, lastSend = 0; const lastSnap = {};
const video = $("#video"), cv = $("#overlay"), ctx = cv.getContext("2d");

const post = (u, b = {}) => fetch(u, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(b)});
const esc = s => String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
function beepWeb() {
  try { audio = audio || new AudioContext(); const o = audio.createOscillator(), g = audio.createGain();
    o.type = "square"; o.frequency.value = 880; g.gain.value = .06; o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + .35); } catch (e) {}
}
function speak(t) {
  $("#voiceOut").textContent = t; const f = $("#botFace"); f.classList.add("talking"); clearTimeout(talkT); talkT = setTimeout(() => f.classList.remove("talking"), 2500);
  try { if ("speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } } catch (e) {}
}

// ---------- camera + detection (runs in the browser) ----------
async function startCamera() {
  $("#camOverlay").hidden = false; $("#camBtn").hidden = true;
  try {
    $("#camMsg").textContent = "Asking for camera permission...";
    stream = await navigator.mediaDevices.getUserMedia({video: {width: 640, height: 480}, audio: false});
    video.srcObject = stream; await video.play();
    if (typeof cocoSsd === "undefined") throw new Error("TensorFlow.js could not load. Check your internet connection.");
    $("#camMsg").textContent = "Loading detection model (first time takes a few seconds)...";
    model = model || await cocoSsd.load({base: "mobilenet_v2"});
    camOn = true; $("#camOverlay").hidden = true; loop();
  } catch (e) {
    camOn = false; $("#camBtn").hidden = false; $("#camBtn").textContent = "Try again";
    $("#camMsg").textContent = "Could not start: " + e.message + ". Allow camera access in the browser and try again.";
  }
}
function snapshot() {
  const c = document.createElement("canvas"); c.width = 480; c.height = 360;
  const x = c.getContext("2d"); x.drawImage(video, 0, 0, 480, 360); x.drawImage(cv, 0, 0, 480, 360);
  return c.toDataURL("image/jpeg", .7);
}
function draw(dets) {
  ctx.clearRect(0, 0, cv.width, cv.height); ctx.lineWidth = 3; ctx.font = "600 16px sans-serif";
  dets.forEach(d => {
    const foreign = !S.allowed.includes(d.label), isT = target && d.label === target, col = isT ? "#6fd3ff" : foreign ? "#ffb020" : "#5ee6b0", [x, y, w, h] = d.box;
    const t = `${d.label} ${(d.conf * 100).toFixed(0)}%${foreign ? " FOREIGN" : ""}${isT ? " TARGET" : ""}`;
    ctx.strokeStyle = col; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, Math.max(0, y - 24), ctx.measureText(t).width + 12, 24);
    ctx.fillStyle = "#0d181d"; ctx.fillText(t, x + 6, Math.max(17, y - 7));
  });
}
async function loop() {
  if (!camOn) return;
  const t0 = performance.now();
  if (video.readyState >= 2) {
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    let dets = [];
    if (S.armed) {
      const preds = await model.detect(video, 30, 0.15);
      dets = preds.filter(p => p.score >= S.confidence).map(p => ({label: p.class, conf: p.score, box: p.bbox.map(Math.round)}));
    }
    draw(dets); curDets = dets; watchTarget(dets);
    const now = performance.now();
    if (now - lastSend > 700) {
      lastSend = now; const body = {detections: dets};
      const f = dets.find(d => !S.allowed.includes(d.label) && now - (lastSnap[d.label] || 0) > 8000);
      if (f) { lastSnap[f.label] = now; Object.assign(body, {snapshot: snapshot(), snap_label: f.label, snap_conf: f.conf}); }
      post("/api/detections", body);
    }
  }
  fps = Math.round(1000 / Math.max(1, performance.now() - t0));
  requestAnimationFrame(loop);
}
$("#camBtn").onclick = startCamera;

// ---------- dashboard ----------
async function refresh() {
  try { S = await (await fetch("/api/status")).json(); } catch (e) { return; }
  $("#modePill").textContent = camOn ? "Camera on" : "Camera off"; $("#modePill").className = "pill " + (camOn ? "live" : "demo");
  $("#fpsPill").textContent = fps + " fps"; $("#botPill").textContent = "Bot " + S.bot;
  $("#armBtn").textContent = S.armed ? "Pause detection" : "Resume detection";
  $("#buzzBtn").textContent = S.buzzer_on ? "Mute buzzer" : "Unmute buzzer";
  $("#confVal").textContent = Math.round(S.confidence * 100) + "%";
  if (document.activeElement !== $("#conf")) $("#conf").value = Math.round(S.confidence * 100);

  const total = S.detections.length; $("#total").textContent = total;
  $("#countList").innerHTML = total ? Object.entries(S.counts).map(([k, v]) =>
    `<div class="crow ${S.allowed.includes(k) ? "ok" : "foreign"}"><span>${esc(k)}</span><b>${v}</b></div>`).join("") : '<div class="empty">Nothing in view.</div>';
  const chips = [...S.allowed, ...ALL.filter(a => !S.allowed.includes(a))];
  $("#allowedChips").innerHTML = chips.map(a => `<button class="chip ${S.allowed.includes(a) ? "on" : ""}" data-a="${esc(a)}">${esc(a)}</button>`).join("");
  $("#detBody").innerHTML = total ? S.detections.map(d => `<tr><td>${esc(d.label)}</td>
    <td><span class="bar" style="width:${d.conf * 80}px"></span>${(d.conf * 100).toFixed(0)}%</td>
    <td>${d.box.join(", ")}</td><td><span class="tag ${d.foreign ? "foreign" : "ok"}">${d.foreign ? "Foreign" : "Allowed"}</span></td></tr>`).join("")
    : '<tr><td colspan="4" class="empty">No detections right now.</td></tr>';

  $("#acc").textContent = S.accuracy === null ? "--" : S.accuracy + "%";
  $("#events").innerHTML = S.events.length ? S.events.map(e => `<div class="ev"><img src="${e.img}" alt="Snapshot">
    <div><b>${esc(e.label)}</b> <small>${(e.conf * 100).toFixed(0)}% at ${e.time}</small><br>
    <small class="st-${e.status}">${e.status === "pending" ? "Waiting for verification" : e.status === "confirmed" ? "Confirmed foreign" : "False alarm"}</small></div>
    <div class="acts">${e.status === "pending" ? `<button class="yes" data-id="${e.id}" data-v="confirmed">Confirm</button><button class="no" data-id="${e.id}" data-v="false_alarm">False alarm</button>` : ""}</div></div>`).join("")
    : '<div class="empty">No foreign objects yet. Hold up a bottle or phone to test.</div>';
  $("#log").innerHTML = S.log.map(l => `<li><time>${l.t}</time>${esc(l.msg)}</li>`).join("");

  const newEv = S.events.filter(e => !seen.has(e.id)); newEv.forEach(e => seen.add(e.id));
  if (!first && newEv.length) {
    const e = newEv[0]; $("#alert").hidden = false; $("#alertText").textContent = `${e.label} (${(e.conf * 100).toFixed(0)}%) at ${e.time}`;
    $("#eye").classList.add("alarm"); $("#botFace").classList.add("alarm"); if (S.buzzer_on) beepWeb();
    speak(`Warning. Foreign object detected: ${e.label}.`);
    setTimeout(() => { $("#alert").hidden = true; $("#eye").classList.remove("alarm"); $("#botFace").classList.remove("alarm"); }, 6000);
  }
  first = false;
}
document.addEventListener("click", async e => {
  const t = e.target;
  if (t.dataset.a) { const s = new Set(S.allowed); s.has(t.dataset.a) ? s.delete(t.dataset.a) : s.add(t.dataset.a); await post("/api/settings", {allowed: [...s]}); }
  if (t.dataset.id) await post("/api/verify", {id: +t.dataset.id, verdict: t.dataset.v});
  if (t.dataset.cmd) await post("/api/move", {cmd: t.dataset.cmd});
  refresh();
});
$("#armBtn").onclick = () => post("/api/settings", {armed: !S.armed});
$("#buzzBtn").onclick = () => post("/api/settings", {buzzer_on: !S.buzzer_on});
$("#testBuzz").onclick = () => { post("/api/buzzer"); beepWeb(); };
$("#clearBtn").onclick = () => { seen.clear(); post("/api/clear"); };
$("#conf").oninput = e => { $("#confVal").textContent = e.target.value + "%"; post("/api/settings", {confidence: e.target.value / 100}); };

// ---------- voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null;
const ALIAS = {"phone":"cell phone","mobile":"cell phone","mobile phone":"cell phone","cellphone":"cell phone","television":"tv","monitor":"tv","screen":"tv","mug":"cup","glass":"cup","sofa":"couch","table":"dining table","bag":"backpack","human":"person","people":"person","man":"person","woman":"person","computer":"laptop","water bottle":"bottle","tumbler":"cup","notebook":"book","luggage":"suitcase","bag":"backpack","bike":"bicycle","motorbike":"motorcycle","plane":"airplane","plant":"potted plant","teddy":"teddy bear","fridge":"refrigerator","sofa":"couch","tv remote":"remote","pc":"laptop","controller":"remote","remote control":"remote"};
function norm(w) {
  w = w.trim().replace(/[?.!,]/g, "").replace(/\s+(are|is|do|can|there|now|here).*$/, "").replace(/^(a|an|the|any|some)\s+/, "");
  if (ALIAS[w]) return ALIAS[w];
  if (w.endsWith("s") && !["glass"].includes(w)) { const s = w.slice(0, -1); return ALIAS[s] || s; }
  return w;
}
const where = d => { const c = (d.box[0] + d.box[2] / 2) / (cv.width || 640); return c < .33 ? "on the left" : c > .66 ? "on the right" : "in the center"; };
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
function setTarget(l) { target = l; $("#targetBar").hidden = !l; $("#targetName").textContent = l || ""; }
function watchTarget(dets) {
  if (!target) return; const hit = dets.find(d => d.label === target), now = performance.now();
  if (hit && now - lastTargetSay > 10000) { lastTargetSay = now; speak(`Found the ${target} ${where(hit)}.`); }
}
function handleVoice(raw) {
  const t = raw.toLowerCase().replace(/mini[\s-]?bot[,]?\s*/g, "").trim(); let m;
  $("#heard").textContent = `You said: "${raw}"`;
  if (/pause|stop detection/.test(t)) { post("/api/settings", {armed: false}); return speak("Detection paused."); }
  if (/start detection|resume/.test(t)) { post("/api/settings", {armed: true}); return speak("Detection resumed."); }
  if (/unmute/.test(t)) { post("/api/settings", {buzzer_on: true}); return speak("Buzzer is on."); }
  if (/mute/.test(t)) { post("/api/settings", {buzzer_on: false}); return speak("Buzzer muted."); }
  if (/(stop|clear|cancel).*(track|look|search|target)/.test(t)) { setTarget(null); return speak("Okay, I stopped looking."); }
  const isQuery = /find|look for|search for|locate|track|where|is there|are there|do you see|can you see|how many|foreign|strange|suspicious|intruder|unknown|what do you see|what's there|scan|describe|look around/.test(t);
  if (isQuery && !camOn) return speak("My camera is off. Press Start camera first.");
  if (isQuery && !S.armed) return speak("Detection is paused. Say resume to wake me up.");
  if (m = t.match(/(?:find|look for|search for|locate|track|where is|where's)\s+(.+)/)) {
    const l = norm(m[1]), hit = curDets.filter(d => d.label === l); setTarget(l); lastTargetSay = performance.now();
    return speak(hit.length ? `Yes, I see ${plural(hit.length, l)}. The first is ${where(hit[0])}, ${(hit[0].conf * 100).toFixed(0)} percent sure.` : `I don't see a ${l} yet. I'll keep watching and tell you when I spot one.`);
  }
  if (m = t.match(/(?:is there|are there|do you see|can you see)\s+(.+)/)) {
    const l = norm(m[1]), hit = curDets.filter(d => d.label === l);
    return speak(hit.length ? `Yes, I see ${plural(hit.length, l)}, ${where(hit[0])}.` : `No, I don't see a ${l} right now.`);
  }
  if (m = t.match(/how many\s+(.+)/)) { const l = norm(m[1]), n = curDets.filter(d => d.label === l).length; return speak(n ? `I count ${plural(n, l)}.` : `I count zero ${l}s.`); }
  if (/foreign|strange|suspicious|intruder|unknown/.test(t)) {
    const f = curDets.filter(d => !S.allowed.includes(d.label));
    return speak(f.length ? `Warning. I see ${f.map(d => `a ${d.label} ${where(d)}`).join(", and ")}.` : "All clear. No foreign objects.");
  }
  if (/what do you see|what's there|scan|describe|look around/.test(t))
    return speak(curDets.length ? "I see " + curDets.map(d => `a ${d.label} ${where(d)}`).join(", ") + "." : "I don't see any objects right now.");
  const mv = ["forward", "backward", "left", "right", "stop"].find(x => t.includes(x)) || (t.includes("back") ? "backward" : null);
  if (mv) { post("/api/move", {cmd: mv}); return speak(`Moving ${mv}.`); }
  speak("Sorry, I didn't get that. Try: find bottle, or what do you see.");
}
const toggleMic = () => {
  if (!SR) return speak("Voice recognition needs Chrome or Edge.");
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.continuous = true; rec.lang = "en-US";
  rec.onresult = ev => handleVoice(ev.results[ev.results.length - 1][0].transcript);
  rec.onend = () => { rec = null; $("#botFace").classList.remove("listening"); $("#micBtn").classList.remove("on"); $("#fabMic").classList.remove("on"); $("#fabMic").innerHTML = "&#127908; Talk to Mini-Bot"; $("#micBtn").textContent = "Start voice control"; };
  rec.start(); $("#botFace").classList.add("listening"); $("#micBtn").classList.add("on"); $("#fabMic").classList.add("on"); $("#fabMic").textContent = "Listening... tap to stop"; $("#micBtn").textContent = "Listening... click to stop";
};

$("#micBtn").onclick = toggleMic; $("#fabMic").onclick = toggleMic;
const say = () => { const v = $("#sayInput").value.trim(); if (v) { handleVoice(v); $("#sayInput").value = ""; } };
$("#sayBtn").onclick = say; $("#sayInput").onkeydown = e => { if (e.key === "Enter") say(); };
$("#clearTarget").onclick = () => setTarget(null);
document.addEventListener("click", e => { if (e.target.dataset.say) handleVoice(e.target.dataset.say); });
setInterval(refresh, 1000); refresh(); startCamera();
