"""Stored zone-event endpoints."""

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import db

router = APIRouter(prefix="/api/events", tags=["events"])


class ReviewUpdate(BaseModel):
    review_status: Literal["Pending Review", "Reviewed"]


def serialize(row: dict) -> dict:
    ready = row["clip_status"] == "ready" and row["clip_filename"]
    item = {key: value for key, value in row.items() if key != "clip_filename"}
    item["clip_url"] = f"/api/events/{row['id']}/clip" if ready else None
    return item


@router.get("")
def list_all():
    return {"events": [serialize(row) for row in db.list_events()]}


@router.get("/{event_id}/clip")
def get_clip(event_id: int):
    row = db.get_event(event_id)
    if row is None or not row["clip_filename"]:
        raise HTTPException(404, "Clip not found.")

    clip_path = (db.CLIPS_DIR / Path(row["clip_filename"]).name).resolve()
    if db.CLIPS_DIR.resolve() not in clip_path.parents or not clip_path.is_file():
        raise HTTPException(404, "Clip file is missing.")

    return FileResponse(clip_path, media_type="video/mp4")


@router.patch("/{event_id}/review")
def update_review(event_id: int, body: ReviewUpdate):
    if not db.set_review(event_id, body.review_status):
        raise HTTPException(404, "Event not found.")
    return {"id": event_id, "review_status": body.review_status}


@router.delete("")
def delete_all():
    names = db.clear_events()
    for name in names:
        (db.CLIPS_DIR / Path(name).name).unlink(missing_ok=True)
    return {"deleted": len(names)}
