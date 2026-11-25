"""Person-only zone annotation for controlled demonstration videos."""

import math
import subprocess
from pathlib import Path
from typing import Callable

import cv2
import numpy as np
from ultralytics import YOLO


def process_video(
    input_path: Path,
    output_path: Path,
    polygon: list[dict[str, float]],
    on_progress: Callable[[int], None],
    on_event: Callable[[dict], None] | None = None,
) -> None:
    """
    Process an uploaded demonstration video.

    - Detects people only.
    - Tests the bottom-center point of each detected bounding box.
    - Draws the zone red whenever at least one detected person is inside.
    - Emits an alert when the zone changes from empty to occupied.

    This is zone occupancy, not identity tracking or threat classification.
    """
    temporary_path = output_path.with_suffix(".working.mp4")

    capture = None
    writer = None

    # OpenCV uses BGR color order.
    green = (53, 230, 163)
    red = (113, 113, 248)
    white = (229, 231, 235)

    try:
        model = YOLO("yolo26n.pt")

        capture = cv2.VideoCapture(str(input_path))

        if not capture.isOpened():
            raise RuntimeError("Could not open the uploaded sample video.")

        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))

        if width <= 0 or height <= 0:
            raise RuntimeError("Invalid video dimensions.")

        if not math.isfinite(fps) or fps <= 0:
            fps = 25.0

        writer = cv2.VideoWriter(
            str(temporary_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (width, height),
        )

        if not writer.isOpened():
            raise RuntimeError("Could not create the processed video.")

        contour = None

        if polygon:
            contour = np.array(
                [
                    (
                        round(point["x"] * (width - 1)),
                        round(point["y"] * (height - 1)),
                    )
                    for point in polygon
                ],
                dtype=np.int32,
            ).reshape((-1, 1, 2))

        frame_number = 0
        last_progress = -1
        event_number = 0

        # Require a short empty period before rearming an alert.
        # This reduces repeated alerts caused by brief missed detections.
        clear_frames_required = max(1, round(fps * 0.75))
        empty_frames = 0
        alert_armed = True

        while True:
            success, frame = capture.read()

            if not success:
                break

            results = model.predict(
                source=frame,
                classes=[0],       # Person class for this pretrained model.
                conf=0.30,
                imgsz=640,
                device="cpu",
                verbose=False,
            )[0]

            detections = []
            inside_count = 0

            if results.boxes is not None:
                boxes = results.boxes.xyxy.cpu().numpy()
                confidences = results.boxes.conf.cpu().numpy()

                for box, confidence in zip(boxes, confidences):
                    x1, y1, x2, y2 = map(float, box)

                    # Approximate point where the person meets the ground.
                    foot_x = (x1 + x2) / 2.0
                    foot_y = min(y2, height - 1)

                    inside = False

                    if contour is not None:
                        inside = (
                            cv2.pointPolygonTest(
                                contour,
                                (foot_x, foot_y),
                                False,
                            )
                            >= 0
                        )

                    if inside:
                        inside_count += 1

                    detections.append(
                        {
                            "box": (
                                round(x1),
                                round(y1),
                                round(x2),
                                round(y2),
                            ),
                            "foot": (
                                round(foot_x),
                                round(foot_y),
                            ),
                            "confidence": float(confidence),
                            "inside": inside,
                        }
                    )

            occupied = inside_count > 0
            video_seconds = frame_number / fps

            # One alert per zone-occupancy episode, not one per frame.
            if occupied:
                empty_frames = 0

                if alert_armed:
                    event_number += 1

                    if on_event is not None:
                        on_event(
                            {
                                "id": f"ZONE-{event_number:04d}",
                                "type": "Person in marked zone",
                                "video_seconds": round(video_seconds, 3),
                                "people_inside": inside_count,
                                "source": "Controlled sample detection",
                                "review": "Pending Review",
                            }
                        )

                    alert_armed = False
            else:
                empty_frames += 1

                if empty_frames >= clear_frames_required:
                    alert_armed = True

            annotated = frame.copy()

            if contour is not None:
                zone_color = red if occupied else green

                overlay = annotated.copy()
                cv2.fillPoly(overlay, [contour], zone_color)

                annotated = cv2.addWeighted(
                    overlay,
                    0.16,
                    annotated,
                    0.84,
                    0,
                )

                cv2.polylines(
                    annotated,
                    [contour],
                    True,
                    zone_color,
                    3,
                )

                for index, vertex in enumerate(
                    contour[:, 0, :],
                    start=1,
                ):
                    position = tuple(int(value) for value in vertex)

                    cv2.circle(
                        annotated,
                        position,
                        5,
                        zone_color,
                        -1,
                    )

                    cv2.putText(
                        annotated,
                        str(index),
                        (position[0] + 7, position[1] - 7),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        zone_color,
                        1,
                        cv2.LINE_AA,
                    )

            for detection in detections:
                x1, y1, x2, y2 = detection["box"]
                color = red if detection["inside"] else green

                cv2.rectangle(
                    annotated,
                    (x1, y1),
                    (x2, y2),
                    color,
                    2,
                )

                cv2.circle(
                    annotated,
                    detection["foot"],
                    5,
                    color,
                    -1,
                )

                label = (
                    f"Person {detection['confidence']:.2f}"
                    + (" | IN ZONE" if detection["inside"] else "")
                )

                cv2.putText(
                    annotated,
                    label,
                    (max(0, x1), max(18, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    color,
                    2,
                    cv2.LINE_AA,
                )

            if contour is None:
                banner = "DEMO | PERSON DETECTION | NO ZONE SET"
                banner_color = white
            elif occupied:
                banner = (
                    f"DEMO ALERT | PERSON IN MARKED ZONE: {inside_count}"
                )
                banner_color = red
            else:
                banner = "DEMO | NO PERSON DETECTED IN MARKED ZONE"
                banner_color = green

            cv2.rectangle(
                annotated,
                (0, 0),
                (width, 42),
                (12, 18, 14),
                -1,
            )

            cv2.putText(
                annotated,
                banner,
                (12, 28),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                banner_color,
                2,
                cv2.LINE_AA,
            )

            writer.write(annotated)
            frame_number += 1

            if total_frames > 0:
                progress = min(
                    95,
                    int(frame_number / total_frames * 95),
                )

                if progress != last_progress:
                    on_progress(progress)
                    last_progress = progress

        capture.release()
        capture = None

        writer.release()
        writer = None

        if frame_number == 0:
            raise RuntimeError("No decodable frames were found.")

        on_progress(96)

        conversion = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(temporary_path),
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=1800,
        )

        if conversion.returncode != 0:
            raise RuntimeError(
                "FFmpeg output conversion failed. "
                "Verify libx264 is available."
            )

        if (
            not output_path.exists()
            or output_path.stat().st_size == 0
        ):
            raise RuntimeError("Processed output was not created.")

        on_progress(100)

    except Exception:
        output_path.unlink(missing_ok=True)
        raise

    finally:
        if capture is not None:
            capture.release()

        if writer is not None:
            writer.release()

        temporary_path.unlink(missing_ok=True)