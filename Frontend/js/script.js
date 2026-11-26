/* BorderWatch AI — complete frontend script (replaces all earlier versions). */
"use strict";
const $ = id => document.getElementById(id);
const store = {
  get(key, fallback) {try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }},
  set(key, value) {try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast("Browser storage unavailable; changes last only this session."); return false; }}
};
function toast(message) {
  $("toast").textContent = message; $("toast").hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $("toast").hidden = true, 5000);
}
function clock(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "0:00";
  return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ---------- Navigation ---------- */
const titles = {dashboard:"Dashboard","live-monitoring":"Live Monitoring","events-alerts":"Events / Alerts","alert-database":"Alert Database",settings:"Settings"};
function closeMenu() {$("sidebar").classList.remove("open"); $("scrim").hidden = true; $("menu").setAttribute("aria-expanded", "false");}
function navigate() {
  const id = Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
  document.querySelectorAll(".page").forEach(page => page.hidden = page.id !== id);
  document.querySelectorAll("[data-page]").forEach(link => {
    const active = link.dataset.page === id;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("pageTitle").textContent = titles[id];
  closeMenu();
  requestAnimationFrame(resizeCanvas);
  if (id === "events-alerts" || id === "alert-database") refreshRecords();
}
$("menu").onclick = () => {
  const open = !$("sidebar").classList.contains("open");
  $("sidebar").classList.toggle("open", open); $("scrim").hidden = !open;
  $("menu").setAttribute("aria-expanded", String(open));
};
$("scrim").onclick = closeMenu;
document.addEventListener("keydown", e => {if (e.key === "Escape") closeMenu();});
window.addEventListener("hashchange", navigate);
$("goProcess").onclick = () => location.hash = "live-monitoring";

/* ---------- Dashboard video + polygon ---------- */
const raw = $("dashboardVideo"), canvas = $("polygonCanvas"), ctx = canvas.getContext("2d");
let selectedFile = null, rawUrl = null, points = [], sampleKey = "", annotationOn = true;

function validPoints(v) {
  return Array.isArray(v) && v.length <= 1000 &&
    v.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
}
function updatePoints() {
  $("pointCount").textContent = `${points.length} points`;
  $("savePolygon").disabled = points.length < 3;
  $("undoPoint").disabled = !points.length;
  $("coordinates").replaceChildren();
  if (!points.length) {
    const p = document.createElement("p"); p.className = "hint";
    p.textContent = "No points yet. Add at least three to save a polygon.";
    $("coordinates").append(p);
  }
  points.forEach((p, i) => {
    const row = document.createElement("div"); row.className = "coordinate";
    [String(i + 1), `X ${p.x.toFixed(4)}`, `Y ${p.y.toFixed(4)}`].forEach(t => {const s = document.createElement("span"); s.textContent = t; row.append(s);});
    $("coordinates").append(row);
  });
  drawPolygon();
}
function resizeCanvas() {
  const stage = $("videoStage"), w = stage.clientWidth, h = stage.clientHeight;
  if (!raw.videoWidth || !w || !h || !selectedFile) {canvas.hidden = true; return;}
  const scale = Math.min(w / raw.videoWidth, h / raw.videoHeight);
  const width = raw.videoWidth * scale, height = raw.videoHeight * scale;
  canvas.hidden = false;
  Object.assign(canvas.style, {left:`${(w - width) / 2}px`, top:`${(h - height) / 2}px`, width:`${width}px`, height:`${height}px`, pointerEvents: annotationOn ? "auto" : "none"});
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawPolygon();
}
function drawPolygon() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!points.length) return;
  const v = points.map(p => ({x: p.x * rect.width, y: p.y * rect.height}));
  ctx.beginPath(); v.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  if (v.length >= 3) {ctx.closePath(); ctx.fillStyle = "rgba(163,230,53,.16)"; ctx.fill();}
  ctx.strokeStyle = "#a3e635"; ctx.lineWidth = 2; ctx.stroke();
  v.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fillStyle = "#a3e635"; ctx.fill();
    ctx.fillStyle = "#101613"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), p.x, p.y);
  });
}
canvas.addEventListener("pointerdown", event => {
  if (!selectedFile || !raw.videoWidth || !annotationOn) return;
  if (points.length >= 1000) {toast("This demo accepts up to 1,000 points per polygon."); return;}
  const rect = canvas.getBoundingClientRect();
  points.push({
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  });
  $("polygonStatus").textContent = "Unsaved changes. Processing uses the points currently shown.";
  updatePoints();
});
$("videoInput").onchange = () => {
  const file = $("videoInput").files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".mp4")) {toast("Choose an MP4 sample."); $("videoInput").value = ""; return;}
  if (file.size > 200 * 1024 * 1024) {toast("Maximum sample size is 200 MB."); $("videoInput").value = ""; return;}
  raw.pause(); raw.removeAttribute("src"); raw.load();
  if (rawUrl) URL.revokeObjectURL(rawUrl);
  selectedFile = file;
  sampleKey = `bw4:polygon:${file.name}:${file.size}:${file.lastModified}`;
  const saved = store.get(sampleKey, []);
  points = validPoints(saved) ? saved : [];
  rawUrl = URL.createObjectURL(file);
  raw.src = rawUrl; raw.muted = true; raw.loop = true;
  $("mute").textContent = "Unmute"; $("fileName").textContent = file.name;
  $("rawPlaceholder").hidden = true; $("removeVideo").disabled = false;
  $("polygonStatus").textContent = points.length ? "Saved polygon restored for this sample." : "No saved polygon for this sample.";
  updatePoints(); raw.load();
};
raw.addEventListener("loadedmetadata", () => {
  resizeCanvas();
  ["playPause", "seek", "mute"].forEach(id => $(id).disabled = false);
  raw.play().catch(() => toast("Press Play to start the preview."));
  updateTime();
});
raw.addEventListener("error", () => {
  if (selectedFile) {toast("Your browser could not decode this MP4. Try an H.264 MP4."); $("rawPlaceholder").hidden = false;}
});
function updateTime() {
  $("timeLabel").textContent = `${clock(raw.currentTime)} / ${clock(raw.duration)}`;
  $("seek").value = raw.duration ? raw.currentTime / raw.duration * 1000 : 0;
}
raw.addEventListener("timeupdate", updateTime);
raw.addEventListener("play", () => $("playPause").textContent = "Pause");
raw.addEventListener("pause", () => $("playPause").textContent = "Play");
$("playPause").onclick = () => raw.paused ? raw.play().catch(() => toast("Unable to play this sample.")) : raw.pause();
$("seek").oninput = () => {if (Number.isFinite(raw.duration)) raw.currentTime = Number($("seek").value) / 1000 * raw.duration;};
$("mute").onclick = () => {raw.muted = !raw.muted; $("mute").textContent = raw.muted ? "Unmute" : "Mute";};
$("removeVideo").onclick = () => {
  raw.pause(); raw.removeAttribute("src"); raw.load();
  if (rawUrl) URL.revokeObjectURL(rawUrl);
  rawUrl = null; selectedFile = null; sampleKey = ""; points = [];
  canvas.hidden = true; $("videoInput").value = ""; $("fileName").textContent = "No file selected";
  $("rawPlaceholder").hidden = false;
  ["removeVideo", "playPause", "seek", "mute"].forEach(id => $(id).disabled = true);
  $("playPause").textContent = "Play"; $("polygonStatus").textContent = "No sample selected.";
  updatePoints(); updateTime();
};
$("annotate").onclick = () => {
  annotationOn = !annotationOn;
  $("annotate").setAttribute("aria-pressed", String(annotationOn));
  $("annotate").textContent = `Annotation: ${annotationOn ? "On" : "Off"}`;
  canvas.style.pointerEvents = annotationOn ? "auto" : "none";
};
$("savePolygon").onclick = () => {
  if (selectedFile && points.length >= 3 && store.set(sampleKey, points)) {
    $("polygonStatus").textContent = "Saved for this sample. Select the same file after a reload to restore it.";
    toast("Polygon saved.");
  }
};
$("undoPoint").onclick = () => {points.pop(); $("polygonStatus").textContent = "Unsaved changes."; updatePoints();};
$("resetPoints").onclick = () => {points = []; if (sampleKey) store.set(sampleKey, []); $("polygonStatus").textContent = "Polygon reset."; updatePoints();};
new ResizeObserver(resizeCanvas).observe($("videoStage"));
window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", () => {if (rawUrl) URL.revokeObjectURL(rawUrl);});

/* ---------- Backend status ---------- */
async function health() {
  try {
    const data = await BorderWatchAPI.health();
    const text = data.ffmpeg_available ? "Connected" : "Connected · FFmpeg missing";
    document.querySelectorAll("[data-backend]").forEach(el => el.textContent = text);
    $("backendStat").textContent = "Online";
    return true;
  } catch {
    document.querySelectorAll("[data-backend]").forEach(el => el.textContent = "Disconnected");
    $("backendStat").textContent = "Offline";
    return false;
  }
}
$("refreshBackend").onclick = () => health();

/* ---------- Zone alerts for the current processed sample ---------- */
function setZoneMessage(message) {
  $("zoneAlertRows").replaceChildren();
  const row = document.createElement("tr"), cell = document.createElement("td");
  cell.colSpan = 5; cell.textContent = message; row.append(cell); $("zoneAlertRows").append(row);
}
function renderZoneAlerts(events) {
  $("zoneAlertRows").replaceChildren();
  if (!events.length) {setZoneMessage("No person-in-zone entries were detected in this sample."); return;}
  events.forEach(event => {
    const row = document.createElement("tr");
    [event.id, event.type, clock(event.video_seconds), String(event.people_inside)].forEach(v => {
      const cell = document.createElement("td"); cell.textContent = v; row.append(cell);
    });
    const action = document.createElement("td"), button = document.createElement("button");
    button.type = "button"; button.className = "secondary"; button.textContent = "View moment";
    button.onclick = () => {
      const player = $("processedVideo");
      if (!Number.isFinite(player.duration)) return;
      player.currentTime = Math.min(Math.max(0, Number(event.video_seconds) || 0), player.duration);
      player.play().catch(() => toast("Press Play to view this moment."));
    };
    action.append(button); row.append(action); $("zoneAlertRows").append(row);
  });
}

/* ---------- Processing jobs ---------- */
const output = $("processedVideo");
let busy = false, activeJob = null, polling = false, completedCount = 0;
const countedJobs = new Set();

function jobUI(label, progress = 0) {
  $("jobStatus").textContent = label; $("settingsJob").textContent = label;
  $("jobProgress").textContent = `${progress}%`; $("progress").value = progress;
}
function lockSample(locked) {
  $("videoInput").disabled = locked;
  $("processVideo").disabled = locked;
  $("removeVideo").disabled = locked || !selectedFile;
}
function resetOutput() {
  output.pause(); output.removeAttribute("src"); output.load(); output.hidden = true;
  $("outputPlaceholder").hidden = false; $("outputStatus").textContent = "Unavailable";
  $("zoneAlertSummary").textContent = "Process a sample to load its zone alerts.";
  setZoneMessage("No processed sample loaded.");
}
async function pollJob() {
  if (polling || !activeJob) return;
  polling = true; $("checkJob").hidden = true;
  try {
    while (activeJob) {
      const job = await BorderWatchAPI.job(activeJob);
      jobUI(job.status, job.progress || 0);
      $("outputMessage").textContent = `${job.status} · ${job.progress || 0}%. Processing the submitted sample.`;
      if (job.status === "failed") throw new Error(job.error || "Backend processing failed.");
      if (job.status === "completed") {
        const expected = `/api/jobs/${encodeURIComponent(activeJob)}/output`;
        if (job.output_url !== expected) throw new Error("Unexpected processed-output URL returned by backend.");
        output.src = expected; output.hidden = false; $("outputPlaceholder").hidden = true;
        $("outputStatus").textContent = "Available";
        output.load(); output.play().catch(() => toast("Output ready. Press Play to view it."));

        const events = Array.isArray(job.events) ? job.events : [];
        renderZoneAlerts(events);
        $("zoneAlertSummary").textContent =
          `${events.length} zone entr${events.length === 1 ? "y" : "ies"} detected. Saved to the Alert Database` +
          (job.clip_failures ? ` (${job.clip_failures} clip(s) could not be created).` : ".");

        if (!countedJobs.has(activeJob)) {countedJobs.add(activeJob); $("completedCount").textContent = ++completedCount;}
        activeJob = null; busy = false; lockSample(false);
        await refreshRecords();
        toast(events.length ? `Processed. ${events.length} event(s) saved.` : "Processed. No zone entries detected.");
        break;
      }
      await wait(1500);
    }
  } catch (error) {
    $("outputMessage").textContent = error.message;
    jobUI("Status check interrupted"); $("checkJob").hidden = false; toast(error.message);
  } finally {polling = false;}
}
$("processVideo").onclick = async () => {
  if (busy) return;
  if (!selectedFile) {toast("Upload a sample on the Dashboard first."); return;}
  if (points.length && points.length < 3) {toast("Add at least three polygon points, or reset them."); return;}
  if (!points.length) toast("No polygon marked: people will be detected but no zone events can be recorded.");

  const file = selectedFile, polygon = points.map(p => ({...p}));
  busy = true; lockSample(true); resetOutput(); $("checkJob").hidden = true;
  try {
    if (!await health()) throw new Error("Start FastAPI and open http://127.0.0.1:8000, not a file URL.");
    jobUI("Uploading"); $("outputMessage").textContent = "Uploading the selected controlled sample…";
    const uploaded = await BorderWatchAPI.upload(file);
    jobUI("Submitting");
    const job = await BorderWatchAPI.start(uploaded.video_id, polygon);
    activeJob = job.job_id; $("jobId").textContent = `Job: ${activeJob}`;
    await pollJob();
  } catch (error) {
    busy = false; lockSample(false); jobUI("Submission not confirmed");
    $("outputMessage").textContent = error.message; toast(error.message);
  }
};
$("checkJob").onclick = async () => {
  if (!activeJob) return;
  try {
    const job = await BorderWatchAPI.job(activeJob);
    if (job.status === "failed") {
      jobUI("Failed", job.progress || 0); $("outputMessage").textContent = job.error || "Processing failed.";
      activeJob = null; busy = false; lockSample(false); $("checkJob").hidden = true; return;
    }
    await pollJob();
  } catch (error) {toast(`${error.message} If the backend restarted, reload and submit again.`);}
};
output.addEventListener("error", () => {
  if (output.getAttribute("src")) {$("outputStatus").textContent = "Playback error"; toast("Cannot play processed output.");}
});

/* ---------- Stored events (SQLite via backend) ---------- */
let records = [], recordsError = "";

function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}
function clipWindow(r) {
  return (r.clip_start == null || r.clip_end == null) ? "Unavailable" : `${clock(r.clip_start)} – ${clock(r.clip_end)}`;
}
function makeRow(values) {
  const row = document.createElement("tr");
  values.forEach(value => {
    const cell = document.createElement("td");
    if (value instanceof Node) cell.append(value); else cell.textContent = value;
    row.append(cell);
  });
  return row;
}
function populate(body, rows, columns, emptyMessage) {
  body.replaceChildren(...rows);
  if (!rows.length) {
    const row = document.createElement("tr"), cell = document.createElement("td");
    cell.colSpan = columns; cell.textContent = recordsError || emptyMessage;
    row.append(cell); body.append(row);
  }
}
function matches(r, query, review) {
  const text = [r.event_code, r.event_type, r.source_filename, r.review_status, clock(r.video_seconds)].join(" ").toLowerCase();
  return (!review || r.review_status === review) && text.includes(query);
}
function reviewCell(r) {
  const wrap = document.createElement("div"), label = document.createElement("span"), button = document.createElement("button");
  const reviewed = r.review_status === "Reviewed";
  wrap.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap";
  label.textContent = r.review_status;
  button.type = "button"; button.className = "secondary"; button.textContent = reviewed ? "Mark pending" : "Mark reviewed";
  button.onclick = async () => {
    button.disabled = true;
    try {await BorderWatchAPI.setReview(r.id, reviewed ? "Pending Review" : "Reviewed"); await refreshRecords();}
    catch (error) {toast(error.message); button.disabled = false;}
  };
  wrap.append(label, button);
  return wrap;
}
function clipCell(r) {
  if (!r.clip_url) return "Clip unavailable";
  const button = document.createElement("button");
  button.type = "button"; button.className = "secondary"; button.textContent = "Play clip";
  button.onclick = () => {
    $("clipTitle").textContent = `${r.event_code} · ${r.event_type}`;
    $("clipMeta").textContent = `Entry at ${clock(r.video_seconds)} in ${r.source_filename}. Clip covers ${clipWindow(r)} of the processed video.`;
    $("clipPlayer").src = r.clip_url;
    $("clipDialog").showModal();
    $("clipPlayer").play().catch(() => {});
  };
  return button;
}
function renderRecords() {
  const eq = $("eventSearch").value.toLowerCase(), er = $("eventFilter").value;
  const eventList = records.filter(r => matches(r, eq, er));
  populate($("eventRows"), eventList.map(r => makeRow([
    r.event_code, r.event_type, clock(r.video_seconds), localTime(r.created_at), r.source_filename, reviewCell(r)
  ])), 6, "No zone entries recorded yet. Mark a polygon, then process a sample.");
  $("eventSummary").textContent = recordsError ||
    `${eventList.length} of ${records.length} event(s). Video timestamp = entry moment in the processed sample; “Recorded at” = when the backend saved it.`;

  const dq = $("databaseSearch").value.toLowerCase(), dr = $("databaseFilter").value;
  const dbList = records.filter(r => matches(r, dq, dr));
  populate($("databaseRows"), dbList.map(r => makeRow([
    r.event_code, r.source_filename, clock(r.video_seconds), clipWindow(r), localTime(r.created_at), clipCell(r)
  ])), 6, "No stored records yet.");
  $("databaseSummary").textContent = recordsError || `${dbList.length} of ${records.length} record(s) shown.`;
  $("recordCount").textContent = records.length;
}
async function refreshRecords() {
  try {records = (await BorderWatchAPI.events()).events; recordsError = "";}
  catch (error) {records = []; recordsError = `Could not load stored events: ${error.message}`;}
  renderRecords();
}
["eventSearch", "databaseSearch"].forEach(id => $(id).addEventListener("input", renderRecords));
["eventFilter", "databaseFilter"].forEach(id => $(id).addEventListener("change", renderRecords));
$("reloadEvents").onclick = () => refreshRecords();
$("clipDialog").addEventListener("close", () => {
  const p = $("clipPlayer"); p.pause(); p.removeAttribute("src"); p.load();
});
$("closeClip").onclick = () => $("clipDialog").close();
$("clearRecords").onclick = async () => {
  if (!confirm("Permanently delete all stored events and their saved clips?")) return;
  try {
    const result = await BorderWatchAPI.clearEvents();
    toast(`Deleted ${result.deleted} stored event(s).`); await refreshRecords();
  } catch (error) {toast(error.message);}
};
$("exportCsv").onclick = () => {
  const rows = records.filter(r => matches(r, $("databaseSearch").value.toLowerCase(), $("databaseFilter").value));
  if (!rows.length) {toast("No matching records to export."); return;}
  const safe = v => {let t = String(v); if (/^[=+@\-\t\r]/.test(t)) t = "'" + t; return '"' + t.replaceAll('"', '""') + '"';};
  const csv = [
    ["Record ID","Source video","Event type","Entry (video seconds)","Clip start (s)","Clip end (s)","People inside","Review","Stored at (UTC)","Clip available"],
    ...rows.map(r => [r.event_code, r.source_filename, r.event_type, r.video_seconds, r.clip_start ?? "", r.clip_end ?? "",
      r.people_inside, r.review_status, r.created_at, r.clip_url ? "yes" : "no"])
  ].map(row => row.map(safe).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], {type: "text/csv;charset=utf-8"}));
  const a = document.createElement("a"); a.href = url; a.download = "borderwatch-events.csv";
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ---------- Preferences + startup ---------- */
$("reduceMotion").checked = store.get("bw4:reduceMotion", false) === true;
function motion() {document.body.classList.toggle("reduce-motion", $("reduceMotion").checked);}
$("reduceMotion").onchange = () => {motion(); store.set("bw4:reduceMotion", $("reduceMotion").checked);};

motion(); setZoneMessage("No processed sample loaded.");
navigate(); updatePoints(); health(); refreshRecords();
setInterval(health, 15000);
