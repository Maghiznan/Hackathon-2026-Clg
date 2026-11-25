/* BorderWatch UI. Replace the previous script entirely; do not append it. */
"use strict";
const $ = id => document.getElementById(id);
const store = {
  get(key, fallback) {try { const value=localStorage.getItem(key); return value===null?fallback:JSON.parse(value); } catch {return fallback;}},
  set(key,value) {try {localStorage.setItem(key,JSON.stringify(value)); return true;} catch {toast("Browser storage unavailable; changes last only this session."); return false;}}
};
function toast(message) {$("toast").textContent=message; $("toast").hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$("toast").hidden=true,5000);}
const titles={dashboard:"Dashboard","live-monitoring":"Live Monitoring","events-alerts":"Events / Alerts","alert-database":"Alert Database",settings:"Settings"};
function closeMenu() {$("sidebar").classList.remove("open"); $("scrim").hidden=true; $("menu").setAttribute("aria-expanded","false");}
function navigate() {
 const id=Object.hasOwn(titles,location.hash.slice(1))?location.hash.slice(1):"dashboard";
 document.querySelectorAll(".page").forEach(page=>page.hidden=page.id!==id);
 document.querySelectorAll("[data-page]").forEach(link=>{const active=link.dataset.page===id; link.classList.toggle("active",active); if(active) link.setAttribute("aria-current","page"); else link.removeAttribute("aria-current");});
 $("pageTitle").textContent=titles[id]; closeMenu(); requestAnimationFrame(resizeCanvas);
}
$("menu").onclick=()=>{const open=!$("sidebar").classList.contains("open"); $("sidebar").classList.toggle("open",open); $("scrim").hidden=!open; $("menu").setAttribute("aria-expanded",String(open));};
$("scrim").onclick=closeMenu;
document.addEventListener("keydown",event=>{if(event.key==="Escape") closeMenu();});
window.addEventListener("hashchange",navigate);
$("goProcess").onclick=()=>location.hash="live-monitoring";

/* Local sample playback and video-image-relative annotation. */
const raw=$("dashboardVideo"), canvas=$("polygonCanvas"), ctx=canvas.getContext("2d");
let selectedFile=null, rawUrl=null, points=[], sampleKey="", annotationOn=true;
function validPoints(value) {return Array.isArray(value)&&value.length<=1000&&value.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);}
function updatePoints() {
 $("pointCount").textContent=`${points.length} points`;
 $("savePolygon").disabled=points.length<3; $("undoPoint").disabled=!points.length;
 $("coordinates").replaceChildren();
 if(!points.length) {const p=document.createElement("p"); p.className="hint"; p.textContent="No points yet. Add at least three to save a polygon."; $("coordinates").append(p);}
 points.forEach((p,i)=>{const row=document.createElement("div"); row.className="coordinate"; [String(i+1),`X ${p.x.toFixed(4)}`,`Y ${p.y.toFixed(4)}`].forEach(text=>{const span=document.createElement("span"); span.textContent=text; row.append(span);}); $("coordinates").append(row);}); drawPolygon();
}
function resizeCanvas() {
 const stage=$("videoStage"); const w=stage.clientWidth,h=stage.clientHeight;
 if(!raw.videoWidth||!w||!h||!selectedFile) {canvas.hidden=true;return;}
 const scale=Math.min(w/raw.videoWidth,h/raw.videoHeight), width=raw.videoWidth*scale,height=raw.videoHeight*scale;
 canvas.hidden=false; Object.assign(canvas.style,{left:`${(w-width)/2}px`,top:`${(h-height)/2}px`,width:`${width}px`,height:`${height}px`,pointerEvents:annotationOn?"auto":"none"});
 const ratio=window.devicePixelRatio||1; canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
 ctx.setTransform(ratio,0,0,ratio,0,0); drawPolygon();
}
function drawPolygon() {
 const rect=canvas.getBoundingClientRect(); if(!rect.width||!rect.height) return;
 ctx.clearRect(0,0,rect.width,rect.height); if(!points.length) return;
 const vertices=points.map(p=>({x:p.x*rect.width,y:p.y*rect.height}));
 ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
 if(vertices.length>=3){ctx.closePath();ctx.fillStyle="rgba(163,230,53,.16)";ctx.fill();}
 ctx.strokeStyle="#a3e635";ctx.lineWidth=2;ctx.stroke();
 vertices.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,11,0,Math.PI*2);ctx.fillStyle="#a3e635";ctx.fill();ctx.fillStyle="#101613";ctx.font="bold 10px system-ui";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(i+1),p.x,p.y);});
}
canvas.addEventListener("pointerdown",event=>{
 if(!selectedFile||!raw.videoWidth||!annotationOn) return;
 if(points.length>=1000){toast("This demo accepts up to 1,000 points per polygon.");return;}
 const rect=canvas.getBoundingClientRect();points.push({x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))});
 $("polygonStatus").textContent="Unsaved changes. Processing uses the currently displayed points.";updatePoints();
});
$("videoInput").onchange=()=>{
 const file=$("videoInput").files[0]; if(!file) return;
 if(!file.name.toLowerCase().endsWith(".mp4")){toast("Choose an MP4 sample.");$("videoInput").value="";return;}
 if(file.size>200*1024*1024){toast("Maximum sample size is 200 MB.");$("videoInput").value="";return;}
 raw.pause();raw.removeAttribute("src");raw.load();if(rawUrl)URL.revokeObjectURL(rawUrl);
 selectedFile=file;sampleKey=`bw3:polygon:${file.name}:${file.size}:${file.lastModified}`;
 const saved=store.get(sampleKey,[]);points=validPoints(saved)?saved:[];
 rawUrl=URL.createObjectURL(file);raw.src=rawUrl;raw.muted=true;raw.loop=true;
 $("mute").textContent="Unmute";$("fileName").textContent=file.name;$("rawPlaceholder").hidden=true;$("removeVideo").disabled=false;
 $("polygonStatus").textContent=points.length?"Saved polygon restored for this sample.":"No saved polygon for this sample.";updatePoints();raw.load();
};
raw.addEventListener("loadedmetadata",()=>{resizeCanvas();["playPause","seek","mute"].forEach(id=>$(id).disabled=false);raw.play().catch(()=>toast("Press Play to start the preview."));updateTime();});
raw.addEventListener("error",()=>{if(selectedFile){toast("This MP4 could not be decoded by your browser. Try an H.264 MP4.");$("rawPlaceholder").hidden=false;}});
function clock(value){if(!Number.isFinite(value))return "0:00";return `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,"0")}`;}
function updateTime(){$("timeLabel").textContent=`${clock(raw.currentTime)} / ${clock(raw.duration)}`;$("seek").value=raw.duration?raw.currentTime/raw.duration*1000:0;}
raw.addEventListener("timeupdate",updateTime);raw.addEventListener("play",()=>$("playPause").textContent="Pause");raw.addEventListener("pause",()=>$("playPause").textContent="Play");
$("playPause").onclick=()=>raw.paused?raw.play().catch(()=>toast("Unable to play this sample.")):raw.pause();
$("seek").oninput=()=>{if(Number.isFinite(raw.duration))raw.currentTime=Number($("seek").value)/1000*raw.duration;};
$("mute").onclick=()=>{raw.muted=!raw.muted;$("mute").textContent=raw.muted?"Unmute":"Mute";};
$("removeVideo").onclick=()=>{raw.pause();raw.removeAttribute("src");raw.load();if(rawUrl)URL.revokeObjectURL(rawUrl);rawUrl=null;selectedFile=null;sampleKey="";points=[];canvas.hidden=true;$("videoInput").value="";$("fileName").textContent="No file selected";$("rawPlaceholder").hidden=false;["removeVideo","playPause","seek","mute"].forEach(id=>$(id).disabled=true);$("playPause").textContent="Play";$("polygonStatus").textContent="No sample selected.";updatePoints();updateTime();};
$("annotate").onclick=()=>{annotationOn=!annotationOn;$("annotate").setAttribute("aria-pressed",String(annotationOn));$("annotate").textContent=`Annotation: ${annotationOn?"On":"Off"}`;canvas.style.pointerEvents=annotationOn?"auto":"none";};
$("savePolygon").onclick=()=>{if(selectedFile&&points.length>=3&&store.set(sampleKey,points)){$("polygonStatus").textContent="Saved for this sample. Select the same file after reloading to restore.";toast("Polygon saved.");}};
$("undoPoint").onclick=()=>{points.pop();$("polygonStatus").textContent="Unsaved changes.";updatePoints();};
$("resetPoints").onclick=()=>{points=[];if(sampleKey)store.set(sampleKey,[]);$("polygonStatus").textContent="Polygon reset.";updatePoints();};
new ResizeObserver(resizeCanvas).observe($("videoStage"));window.addEventListener("resize",resizeCanvas);
window.addEventListener("beforeunload",()=>{if(rawUrl)URL.revokeObjectURL(rawUrl);});

/* Backend state: one active job, non-overlapping polling, explicit reconnection. */
const output=$("processedVideo");let busy=false,activeJob=null,polling=false,completedCount=0;const countedJobs=new Set();
async function health(){try{const data=await BorderWatchAPI.health();const text=data.ffmpeg_available?"Connected":"Connected · FFmpeg missing";document.querySelectorAll("[data-backend]").forEach(el=>el.textContent=text);$("backendStat").textContent="Online";return true;}catch{document.querySelectorAll("[data-backend]").forEach(el=>el.textContent="Disconnected");$("backendStat").textContent="Offline";return false;}}
function jobUI(label,progress=0){$("jobStatus").textContent=label;$("settingsJob").textContent=label;$("jobProgress").textContent=`${progress}%`;$("progress").value=progress;}
function lockSample(locked){["videoInput","removeVideo","processVideo"].forEach(id=>$(id).disabled=locked||(id==="removeVideo"&&!selectedFile));}
function resetOutput(){output.pause();output.removeAttribute("src");output.load();output.hidden=true;$("outputPlaceholder").hidden=false;$("outputStatus").textContent="Unavailable";}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function pollJob(){
 if(polling||!activeJob)return;polling=true;$("checkJob").hidden=true;
 try{while(activeJob){
  const job=await BorderWatchAPI.job(activeJob);jobUI(job.status,job.progress||0);$("outputMessage").textContent=`${job.status} · ${job.progress||0}%. Processing the submitted sample.`;
  if(job.status==="failed")throw new Error(job.error||"Backend processing failed.");
  if(job.status==="completed"){
   // The player only accepts the dedicated output endpoint for this job.
   const expected=`/api/jobs/${encodeURIComponent(activeJob)}/output`;
   if(job.output_url!==expected)throw new Error("Unexpected processed-output URL returned by backend.");
   output.src=expected;output.hidden=false;$("outputPlaceholder").hidden=true;$("outputStatus").textContent="Available";output.load();output.play().catch(()=>toast("Output ready. Press Play to view it."));
   if(!countedJobs.has(activeJob)){countedJobs.add(activeJob);$("completedCount").textContent=++completedCount;}
   activeJob=null;busy=false;lockSample(false);toast("Processed output is ready.");break;
  }
  await wait(1500);
 }}catch(error){
  $("outputMessage").textContent=error.message;
  // Preserve the job ID after network or backend errors so status can be retried.
  jobUI("Status check interrupted");$("checkJob").hidden=false;toast(error.message);
 }finally{polling=false;}
}
$("processVideo").onclick=async()=>{
 if(busy)return;if(!selectedFile){toast("Upload a sample on the Dashboard first.");return;}
 if(points.length&&points.length<3){toast("Add at least three polygon points, or reset them.");return;}
 const file=selectedFile,polygon=points.map(p=>({...p}));busy=true;lockSample(true);resetOutput();$("checkJob").hidden=true;
 try{
  if(!await health())throw new Error("Start FastAPI and open http://127.0.0.1:8000, not a file URL.");
  jobUI("Uploading");$("outputMessage").textContent="Uploading the selected controlled sample…";
  const uploaded=await BorderWatchAPI.upload(file);jobUI("Submitting");
  const job=await BorderWatchAPI.start(uploaded.video_id,polygon);activeJob=job.job_id;$("jobId").textContent=`Job: ${activeJob}`;await pollJob();
 }catch(error){busy=false;lockSample(false);jobUI("Submission not confirmed");$("outputMessage").textContent=error.message;toast(error.message);}
};
$("checkJob").onclick=async()=>{
 if(!activeJob)return;
 try{const job=await BorderWatchAPI.job(activeJob);if(job.status==="failed"){jobUI("Failed",job.progress||0);$("outputMessage").textContent=job.error||"Processing failed.";activeJob=null;busy=false;lockSample(false);$("checkJob").hidden=true;return;}await pollJob();}catch(error){toast(`${error.message} If the backend restarted, reload this page and submit again.`);}
};
output.addEventListener("error",()=>{if(output.getAttribute("src")){$("outputStatus").textContent="Playback error";toast("Cannot play processed output. Check backend encoding and file availability.");}});
$("refreshBackend").onclick=()=>health();

/* Browser-local simulated event records, intentionally separate from AI output. */
const samples=[
 {id:"DEMO-001",type:"Boundary Crossing",time:"2026-11-25 18:42:10",processing:"Simulated",review:"Pending Review",details:"Illustrative boundary event for interface testing. Not produced by the detector."},
 {id:"DEMO-002",type:"Motion Detection",time:"2026-11-25 17:18:44",processing:"Simulated",review:"Reviewed",details:"Illustrative motion event. No live camera or actual incident is represented."},
 {id:"DEMO-003",type:"Unattended Object",time:"2026-11-25 16:03:27",processing:"Simulated",review:"Pending Review",details:"Illustrative object event. This record is sample data, not a behavioral inference."}
];
let records=store.get("bw3:records",null);
if(!Array.isArray(records)){records=structuredClone(samples);store.set("bw3:records",records);}
records=records.filter(r=>r&&["id","type","time","processing","review","details"].every(k=>typeof r[k]==="string"));
function filteredRecords(){const query=$("databaseSearch").value.toLowerCase(),type=$("databaseFilter").value;return records.filter(r=>(!type||r.type===type)&&Object.values(r).join(" ").toLowerCase().includes(query));}
function makeRow(values){const row=document.createElement("tr");values.forEach(value=>{const cell=document.createElement("td");if(value instanceof Node)cell.append(value);else cell.textContent=value;row.append(cell);});return row;}
function populate(body,rows){body.replaceChildren(...rows);if(!rows.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=5;cell.textContent="No demonstration records match.";row.append(cell);body.append(row);}}
function renderRecords(){
 const query=$("eventSearch").value.toLowerCase(),review=$("eventFilter").value;
 populate($("eventRows"),records.filter(r=>(!review||r.review===review)&&Object.values(r).join(" ").toLowerCase().includes(query)).map(r=>makeRow([r.id,r.type,r.time,r.processing,r.review])));
 populate($("databaseRows"),filteredRecords().map(r=>{const button=document.createElement("button");button.textContent="View details";button.onclick=()=>{$("detailsText").textContent=`${r.id} · SIMULATED\n${r.type}\n${r.time}\nReview: ${r.review}\n\n${r.details}`;$("detailsDialog").showModal();};return makeRow([r.id,r.type,r.time,"Simulated",button]);}));
 $("recordCount").textContent=records.length;
}
["eventSearch","databaseSearch"].forEach(id=>$(id).addEventListener("input",renderRecords));["eventFilter","databaseFilter"].forEach(id=>$(id).addEventListener("change",renderRecords));
$("closeDetails").onclick=()=>$("detailsDialog").close();
$("clearRecords").onclick=()=>{if(!confirm("Clear browser-local simulated records? Backend files will not be deleted."))return;records=[];store.set("bw3:records",records);renderRecords();toast("Demonstration records cleared.");};
$("restoreRecords").onclick=()=>{records=structuredClone(samples);store.set("bw3:records",records);renderRecords();toast("Sample records restored.");};
$("exportCsv").onclick=()=>{
 const rows=filteredRecords();if(!rows.length){toast("No matching records to export.");return;}
 const safe=value=>{let text=String(value);if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const csv=[["ID","Type","Timestamp","Processing","Review","Details"],...rows.map(r=>[r.id,r.type,r.time,r.processing,r.review,r.details])].map(row=>row.map(safe).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="borderwatch-simulated-records.csv";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$("reduceMotion").checked=store.get("bw3:reduceMotion",false)===true;
function motion(){document.body.classList.toggle("reduce-motion",$("reduceMotion").checked);}
$("reduceMotion").onchange=()=>{motion();store.set("bw3:reduceMotion",$("reduceMotion").checked);};
motion();navigate();updatePoints();renderRecords();health();setInterval(health,15000);

/* Detection-generated zone alerts for the processed sample. */

const zoneAlertRows = document.getElementById("zoneAlertRows");
const zoneAlertSummary = document.getElementById(
  "zoneAlertSummary"
);
const zoneOutputPlayer = document.getElementById(
  "processedVideo"
);

let zoneAlertLoadVersion = 0;

function formatZoneTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remaining = Math.floor(value % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function setZoneAlertMessage(message) {
  zoneAlertRows.replaceChildren();

  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = 5;
  cell.textContent = message;

  row.append(cell);
  zoneAlertRows.append(row);
}

function renderZoneAlerts(events) {
  zoneAlertRows.replaceChildren();

  if (!events.length) {
    setZoneAlertMessage(
      "No person-in-zone episodes were detected in this sample."
    );
    return;
  }

  events.forEach((event) => {
    const row = document.createElement("tr");

    const values = [
      event.id,
      event.type,
      formatZoneTime(event.video_seconds),
      String(event.people_inside)
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });

    const actionCell = document.createElement("td");
    const button = document.createElement("button");

    button.type = "button";
    button.className = "secondary";
    button.textContent = "View moment";

    button.addEventListener("click", () => {
      if (!Number.isFinite(zoneOutputPlayer.duration)) {
        return;
      }

      zoneOutputPlayer.currentTime = Math.min(
        Math.max(0, Number(event.video_seconds) || 0),
        zoneOutputPlayer.duration
      );

      zoneOutputPlayer.play().catch(() => {
        toast("Press Play to view this moment.");
      });
    });

    actionCell.append(button);
    row.append(actionCell);
    zoneAlertRows.append(row);
  });
}

zoneOutputPlayer.addEventListener("emptied", () => {
  zoneAlertLoadVersion += 1;

  zoneAlertSummary.textContent =
    "Process a sample to load its zone alerts.";

  setZoneAlertMessage("No processed sample loaded.");
});

zoneOutputPlayer.addEventListener(
  "loadedmetadata",
  async () => {
    const source = zoneOutputPlayer.getAttribute("src") || "";

    const match = source.match(
      /^\/api\/jobs\/([a-f0-9]+)\/output$/
    );

    if (!match) {
      return;
    }

    const currentVersion = ++zoneAlertLoadVersion;

    zoneAlertSummary.textContent = "Loading sample alerts…";

    try {
      const job = await BorderWatchAPI.job(match[1]);

      // Ignore stale responses if a different output was loaded.
      if (currentVersion !== zoneAlertLoadVersion) {
        return;
      }

      const events = Array.isArray(job.events)
        ? job.events
        : [];

      renderZoneAlerts(events);

      zoneAlertSummary.textContent =
        `${events.length} detected zone-occupancy ` +
        `episode${events.length === 1 ? "" : "s"}. ` +
        "These are sample-video results, not verified security incidents.";
    } catch (error) {
      if (currentVersion !== zoneAlertLoadVersion) {
        return;
      }

      zoneAlertSummary.textContent =
        "Could not load this sample’s alert records.";

      setZoneAlertMessage(error.message);
    }
  }
);