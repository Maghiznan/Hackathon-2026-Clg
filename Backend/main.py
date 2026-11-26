"""Local FastAPI service for the BorderWatch controlled-video prototype."""

import logging
import shutil
from pathlib import Path
from threading import Lock
from uuid import uuid4

import cv2
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ai.clips import extract_clip, video_duration
from ai.detector import process_video
from database.db import CLIPS_DIR, init_db, insert_event
from routes.events import router as events_router

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "Frontend"   # folder name must match exactly

STORAGE_DIR = BASE_DIR / "storage"
UPLOAD_DIR = STORAGE_DIR / "uploads"
OUTPUT_DIR = STORAGE_DIR / "outputs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
init_db()

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
CLIP_SECONDS_BEFORE = 5.0
CLIP_SECONDS_AFTER = 5.0
ACTIVE = {"queued", "processing", "saving_events"}

app = FastAPI(title="BorderWatch AI — Controlled Sample API", version="0.4.1")
logger = logging.getLogger("uvicorn.error")

videos: dict = {}
jobs: dict = {}
state_lock = Lock()


class Point(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class JobRequest(BaseModel):
    video_id: str
    polygon: list[Point] = Field(default_factory=list, max_length=1000)


def update_job(job_id: str, **changes) -> None:
    with state_lock:
        jobs[job_id].update(changes)


def append_job_event(job_id: str, event: dict) -> None:
    with state_lock:
        jobs[job_id]["events"].append({**event, "job_id": job_id})


def save_job_events(job_id: str, source_filename: str, output_path: Path) -> int:
    """Store each zone event in SQLite with a -5s/+5s clip. Returns clip failures."""
    with state_lock:
        events = list(jobs[job_id]["events"])
    if not events:
        return 0

    duration = video_duration(output_path)
    failures = 0

    for event in events:
        entry = float(event["video_seconds"])
        start = max(0.0, entry - CLIP_SECONDS_BEFORE)
        end = entry + CLIP_SECONDS_AFTER
        if duration > 0:
            end = min(duration, end)

        code = f"{event['id']}-{job_id[:6].upper()}"
        clip_name, status = f"{code}.mp4", "ready"

        try:
            extract_clip(output_path, CLIPS_DIR / clip_name, start, end - start)
        except Exception:
            logger.exception("Clip extraction failed: %s", code)
            clip_name, status = None, "failed"
            failures += 1

        insert_event({
            "event_code": code,
            "job_id": job_id,
            "source_filename": source_filename,
            "event_type": event["type"],
            "video_seconds": entry,
            "people_inside": int(event["people_inside"]),
            "clip_start": start,
            "clip_end": end,
            "clip_filename": clip_name,
            "clip_status": status,
        })

    return failures


def run_processing_job(job_id: str, input_path: Path, source_filename: str, polygon: list[dict]) -> None:
    output_path = OUTPUT_DIR / f"{job_id}.mp4"
    try:
        update_job(job_id, status="processing", progress=0)

        process_video(
            input_path=input_path,
            output_path=output_path,
            polygon=polygon,
            on_progress=lambda value: update_job(job_id, progress=value),
            on_event=lambda event: append_job_event(job_id, event),
        )

        update_job(job_id, status="saving_events", progress=99)
        failures = save_job_events(job_id, source_filename, output_path)

        update_job(job_id, status="completed", progress=100,
                   output_url=f"/api/jobs/{job_id}/output", clip_failures=failures)
    except Exception:
        logger.exception("Video processing failed: %s", job_id)
        update_job(job_id, status="failed",
                   error="Processing failed. Check the backend terminal for details.")


@app.get("/api/health")
def health():
    with state_lock:
        busy = any(job["status"] in ACTIVE for job in jobs.values())
    return {"status": "ok", "mode": "controlled-sample-only", "processing": busy,
            "ffmpeg_available": shutil.which("ffmpeg") is not None}


@app.post("/api/videos", status_code=201)
def upload_video(file: UploadFile = File(...)):
    if Path(file.filename or "").suffix.lower() != ".mp4":
        file.file.close()
        raise HTTPException(400, "Please upload an MP4 sample video.")

    video_id = uuid4().hex
    destination = UPLOAD_DIR / f"{video_id}.mp4"
    total_bytes = 0

    try:
        with destination.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "The maximum sample size is 200 MB.")
                output.write(chunk)

        capture = cv2.VideoCapture(str(destination))
        try:
            valid, frame = capture.read()
        finally:
            capture.release()
        if not valid or frame is None:
            raise HTTPException(400, "The file has no readable video frame.")

        with state_lock:
            videos[video_id] = {"path": destination, "filename": Path(file.filename).name}

        return {"video_id": video_id, "filename": Path(file.filename).name, "bytes": total_bytes}
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        file.file.close()


@app.post("/api/jobs", status_code=202)
def start_job(request: JobRequest, background_tasks: BackgroundTasks):
    if request.polygon and len(request.polygon) < 3:
        raise HTTPException(422, "Use at least three polygon points, or none.")
    if shutil.which("ffmpeg") is None:
        raise HTTPException(503, "FFmpeg is not installed on the backend.")

    with state_lock:
        video = videos.get(request.video_id)
        if video is None:
            raise HTTPException(404, "Uploaded video not found. Upload it again.")
        if any(job["status"] in ACTIVE for job in jobs.values()):
            raise HTTPException(409, "A sample is already processing.")

        job_id = uuid4().hex
        jobs[job_id] = {"job_id": job_id, "status": "queued", "progress": 0,
                        "output_url": None, "error": None, "events": [], "clip_failures": 0}
        response = dict(jobs[job_id])

    background_tasks.add_task(run_processing_job, job_id, video["path"], video["filename"],
                              [p.model_dump() for p in request.polygon])
    return response


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    with state_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Processing job not found.")
        return dict(job)


@app.get("/api/jobs/{job_id}/output")
def get_output(job_id: str):
    with state_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Processing job not found.")
        if job["status"] != "completed":
            raise HTTPException(409, "Processed output is not ready.")

    output_path = OUTPUT_DIR / f"{job_id}.mp4"
    if not output_path.is_file():
        raise HTTPException(404, "Processed output file is missing.")
    return FileResponse(output_path, media_type="video/mp4")


app.include_router(events_router)

# Must stay AFTER every API route.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
