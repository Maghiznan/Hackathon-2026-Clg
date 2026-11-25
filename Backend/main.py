
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize application
app = FastAPI(
    title="BorderWatch AI",
    description="AI-Based Intelligent Video Analytics Platform",
    version="1.0.0"
)

# Allow frontend connection during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Home route
@app.get("/")
def home():
    return {
        "project": "BorderWatch AI",
        "status": "Online",
        "message": "Backend is running successfully!"
    }


# System health
@app.get("/api/status")
def system_status():
    return {
        "server": "Online",
        "ai": "Not Connected",
        "database": "Not Connected",
        "cameras": 0
    }


# Dashboard statistics
@app.get("/api/statistics")
def statistics():
    return {
        "total_cameras": 12,
        "active_cameras": 10,
        "events_today": 24,
        "pending_review": 3
    }
