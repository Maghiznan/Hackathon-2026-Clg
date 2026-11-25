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

from ai.detector import process_video


BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "Frontend"

STORAGE_DIR = BASE_DIR / "storage"
UPLOAD_DIR = STORAGE_DIR / "uploads"
OUTPUT_DIR = STORAGE_DIR / "outputs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 200 * 1024 * 1024

app = FastAPI(
    title="BorderWatch AI — Controlled Sample API",
    version="0.2.0",
)

logger = logging.getLogger("uvicorn.error")

# Local single-process prototype state.
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
        jobs[job_id]["events"].append(
            {
                **event,
                "job_id": job_id,
            }
        )


def run_processing_job(
    job_id: str,
    input_path: Path,
    polygon: list[dict],
) -> None:
    output_path = OUTPUT_DIR / f"{job_id}.mp4"

    try:
        update_job(
            job_id,
            status="processing",
            progress=0,
        )

        process_video(
            input_path=input_path,
            output_path=output_path,
            polygon=polygon,
            on_progress=lambda progress: update_job(
                job_id,
                progress=progress,
            ),
            on_event=lambda event: append_job_event(
                job_id,
                event,
            ),
        )

        update_job(
            job_id,
            status="completed",
            progress=100,
            output_url=f"/api/jobs/{job_id}/output",
        )

    except Exception:
        logger.exception("Video processing failed: %s", job_id)

        update_job(
            job_id,
            status="failed",
            error=(
                "Processing failed. Check the backend terminal for details "
                "and verify FFmpeg and model availability."
            ),
        )


@app.get("/api/health")
def health():
    with state_lock:
        busy = any(
            job["status"] in {"queued", "processing"}
            for job in jobs.values()
        )

    return {
        "status": "ok",
        "mode": "controlled-sample-only",
        "processing": busy,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
    }


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
                    raise HTTPException(
                        413,
                        "The maximum sample size is 200 MB.",
                    )

                output.write(chunk)

        capture = cv2.VideoCapture(str(destination))

        try:
            valid, frame = capture.read()
        finally:
            capture.release()

        if not valid or frame is None:
            raise HTTPException(
                400,
                "The uploaded file does not contain a readable video frame.",
            )

        with state_lock:
            videos[video_id] = {
                "path": destination,
                "filename": Path(file.filename).name,
            }

        return {
            "video_id": video_id,
            "filename": Path(file.filename).name,
            "bytes": total_bytes,
        }

    except Exception:
        destination.unlink(missing_ok=True)
        raise

    finally:
        file.file.close()


@app.post("/api/jobs", status_code=202)
def start_job(
    request: JobRequest,
    background_tasks: BackgroundTasks,
):
    if request.polygon and len(request.polygon) < 3:
        raise HTTPException(
            422,
            "Use at least three polygon points, or submit no polygon.",
        )

    if shutil.which("ffmpeg") is None:
        raise HTTPException(
            503,
            "FFmpeg is not installed on the backend.",
        )

    with state_lock:
        video = videos.get(request.video_id)

        if video is None:
            raise HTTPException(
                404,
                "Uploaded video not found. Upload it again.",
            )

        if any(
            job["status"] in {"queued", "processing"}
            for job in jobs.values()
        ):
            raise HTTPException(
                409,
                "A sample is already processing. Please wait.",
            )

        job_id = uuid4().hex

        jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "output_url": None,
            "error": None,
            "events": [],
        }

        response = dict(jobs[job_id])

    background_tasks.add_task(
        run_processing_job,
        job_id,
        video["path"],
        [point.model_dump() for point in request.polygon],
    )

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

    return FileResponse(
        output_path,
        media_type="video/mp4",
    )


# Keep this mount AFTER the API routes.
app.mount(
    "/",
    StaticFiles(directory=str(FRONTEND_DIR), html=True),
    name="Frontend",
)