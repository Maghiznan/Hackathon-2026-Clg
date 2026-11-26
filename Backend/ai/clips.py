"""Cut short evidence clips from processed demonstration videos."""

import subprocess
from pathlib import Path

import cv2


def video_duration(path: Path) -> float:
    capture = cv2.VideoCapture(str(path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frames = float(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    finally:
        capture.release()
    return frames / fps if fps > 0 and frames > 0 else 0.0


def extract_clip(source: Path, destination: Path, start: float, duration: float) -> None:
    """Re-encode (not stream-copy) so the start time is frame-accurate."""
    if duration <= 0:
        raise RuntimeError("Clip duration must be positive.")

    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", f"{start:.3f}",
            "-i", str(source),
            "-t", f"{duration:.3f}",
            "-an",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(destination),
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )

    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size == 0:
        destination.unlink(missing_ok=True)
        raise RuntimeError("FFmpeg could not create the event clip: " + result.stderr[-300:])
