# BorderWatch AI

**SIH26187: AI-Based Intelligent Video Analytics Platform for Border Surveillance Using Existing CCTV Infrastructure**

BorderWatch AI is a dashboard prototype for analysing recorded video. You upload a sample MP4, mark a boundary polygon on the video, and the backend detects people and records an event each time someone enters the marked zone. Each event is stored in a database with a clip from 5 seconds before to 5 seconds after the entry.

> **Scope:** This is a controlled demonstration prototype. It processes uploaded sample videos only. It does not connect to live CCTV feeds or real surveillance systems. Detections are not verified security incidents.

## Features

- Dashboard with MP4 upload, looping preview, and playback controls
- Polygon boundary marking with numbered points and normalized (0–1) video-frame coordinates
- Per-video polygon saving and restoring in the browser
- Person-only detection with YOLO and OpenCV
- Zone-entry check using the bottom-centre (foot) point of each person's bounding box
- Red zone border and red person boxes while someone is inside the marked zone
- Processed output shown only in Live Monitoring, separate from the original upload
- One event per zone entry, with a video timestamp
- SQLite alert database with a saved clip from 5 s before to 5 s after each entry
- Search, review-status filtering, review marking, and CSV export
- Responsive dark interface with a fixed, independently scrolling sidebar

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript |
| Backend | Python, FastAPI, Uvicorn |
| Detection | Ultralytics YOLO, OpenCV |
| Video encoding | FFmpeg (H.264) |
| Database | SQLite |

## Project structure

```text
HACKATHON-2026-CLG/
├── Backend/
│   ├── main.py              # FastAPI app, job handling, serves the frontend
│   ├── requirements.txt
│   ├── ai/
│   │   ├── detector.py      # YOLO person detection and zone logic
│   │   └── clips.py         # ±5 second clip extraction with FFmpeg
│   ├── database/
│   │   └── db.py            # SQLite access
│   ├── routes/
│   │   └── events.py        # Event and clip endpoints
│   └── storage/             # Created automatically (uploads, outputs, clips, DB)
├── Frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js           # API calls
│       └── script.js        # UI logic
├── sample_vids/
├── .gitignore
└── README.md
```

## Setup

### Requirements

- Python 3.12 or newer (3.12 or 3.13 is safest for ML packages)
- FFmpeg with libx264 support
- A few GB of free disk space for the dependencies

### Arch Linux

```bash
sudo pacman -S --needed python python-pip ffmpeg
cd Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y python3-venv ffmpeg
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Windows 10 / 11

1. Install Python from [python.org](https://www.python.org/downloads/). On the first installer screen, tick **Add python.exe to PATH**.
2. Install FFmpeg in PowerShell, then close and reopen PowerShell:

   ```powershell
   winget install --id Gyan.FFmpeg -e
   ffmpeg -version
   ```

3. Create the environment and install the dependencies:

   ```powershell
   cd Backend
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

If PowerShell blocks the activation script, run this once in the same window and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

If `ffmpeg -version` isn't recognised, close and reopen the terminal. If it still fails, add the FFmpeg `bin` folder to your PATH.

## Run

Linux:

```bash
cd Backend
source .venv/bin/activate
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Windows (PowerShell):

```powershell
cd Backend
.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000** in your browser. Do not open `index.html` directly.

## How to use

1. **Dashboard:** upload a short MP4 sample.
2. Click on the video to add at least three polygon points, then press **Save polygon**.
3. Open **Live Monitoring** and press **Process Dashboard sample**.
4. When processing finishes, the annotated video plays and the zone alerts appear below it.
5. **Events / Alerts** lists each zone entry with its video timestamp.
6. **Alert Database** stores each event with its saved clip. Use **Play clip** to review it, or **Export filtered CSV** to download the records.

Tip: turn **Annotation** off on the Dashboard if you want to use the video's own seek bar.

## How detection works

For each frame, the backend runs a YOLO model restricted to the `person` class. It takes the bottom-centre point of every person box (roughly where their feet are) and tests whether it falls inside your polygon.

- While at least one person is inside, the polygon and boxes are drawn in red. Otherwise they are green.
- An event is recorded when the zone changes from empty to occupied. The zone must stay empty for a short time before another event can be recorded.
- Each event gets a clip from 5 seconds before to 5 seconds after, clamped to the start and end of the video.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend and FFmpeg status |
| POST | `/api/videos` | Upload a sample MP4 |
| POST | `/api/jobs` | Start processing (video ID and polygon) |
| GET | `/api/jobs/{id}` | Job status, progress, and events |
| GET | `/api/jobs/{id}/output` | Processed video |
| GET | `/api/events` | Stored events |
| GET | `/api/events/{id}/clip` | Saved ±5 s clip |
| PATCH | `/api/events/{id}/review` | Mark an event reviewed or pending |
| DELETE | `/api/events` | Delete all stored events and clips |

Interactive API docs are available at `http://127.0.0.1:8000/docs` while the server runs.

## Limitations

- Processing is batch-based: the output is available after the whole video is processed. It is not a live stream.
- One job runs at a time, and job status is kept in memory, so it is lost when the server restarts. Stored events and clips are kept.
- Detection can miss people or briefly lose them, which may produce extra events. Results depend on lighting, camera angle, resolution, and distance.
- People are not tracked or identified. The system reports zone entries, not individuals.
- The foot-point test is an approximation. It can be wrong if a person is partly hidden or the camera angle is unusual.
- The polygon is a fixed annotation in the video frame. Polygon coordinates are not GPS coordinates.
- No authentication or access control. Run it locally only, and do not expose it to the internet.

## Troubleshooting

| Problem | Fix |
|---|---|
| `uvicorn: command not found` | Activate the virtual environment, then run `python -m uvicorn ...` |
| Events pages are empty | Open the site from `http://127.0.0.1:8000`, then hard refresh (Ctrl+Shift+R) |
| No events after processing | Check that a polygon is saved and that a person's feet actually enter it |
| Processing fails | Check the terminal for errors and confirm `ffmpeg -version` works |
| Reset all data | Stop the server, then delete `Backend/storage/borderwatch.db` and `Backend/storage/clips/` |

## Team

- Syndicates
- [K Tamil Maghiznan, Nandika B, Navein A, Nethra B, Nithish Baskar S 
   Shanmugapriya R, Yogesh A]

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file.

It uses [Ultralytics YOLO](https://github.com/ultralytics/ultralytics), which is also released under AGPL-3.0. Other dependencies, such as FastAPI, OpenCV, and FFmpeg, have their own licences. Check each project's terms before redistributing or building a commercial product.

Sample videos are not included in this repository. If you add your own, make sure you have the right to use and share them.