"""SQLite storage for detection-generated zone events."""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
STORAGE_DIR = BASE_DIR / "storage"
CLIPS_DIR = STORAGE_DIR / "clips"
DB_PATH = STORAGE_DIR / "borderwatch.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_code      TEXT NOT NULL UNIQUE,
    job_id          TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    video_seconds   REAL NOT NULL,
    people_inside   INTEGER NOT NULL,
    clip_start      REAL,
    clip_end        REAL,
    clip_filename   TEXT,
    clip_status     TEXT NOT NULL DEFAULT 'failed',
    review_status   TEXT NOT NULL DEFAULT 'Pending Review',
    created_at      TEXT NOT NULL
);
"""


@contextmanager
def connect():
    """One short-lived connection per call keeps worker threads independent."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


def insert_event(event: dict) -> int:
    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO events (
                event_code, job_id, source_filename, event_type,
                video_seconds, people_inside, clip_start, clip_end,
                clip_filename, clip_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["event_code"], event["job_id"], event["source_filename"],
                event["event_type"], event["video_seconds"], event["people_inside"],
                event["clip_start"], event["clip_end"], event["clip_filename"],
                event["clip_status"], created_at,
            ),
        )
        return cursor.lastrowid


def list_events() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM events ORDER BY created_at DESC, id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def get_event(event_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return dict(row) if row else None


def set_review(event_id: int, review_status: str) -> bool:
    with connect() as conn:
        cursor = conn.execute(
            "UPDATE events SET review_status = ? WHERE id = ?", (review_status, event_id)
        )
        return cursor.rowcount > 0


def clear_events() -> list[str]:
    """Delete all records; return clip filenames so files can be removed."""
    with connect() as conn:
        names = [
            row["clip_filename"]
            for row in conn.execute(
                "SELECT clip_filename FROM events WHERE clip_filename IS NOT NULL"
            )
        ]
        conn.execute("DELETE FROM events")
    return names
