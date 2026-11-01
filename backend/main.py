from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.hotspots import router as hotspots_router
from routes.incidents import router as incidents_router
from routes.history import router as history_router
from routes.statistics import router as statistics_router
from services.live_event_store import initialize_database


app = FastAPI(
    title="AGNIRA Backend",
    description="Backend API for SIH26162",
    version="1.0.0"
)

initialize_database()

# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(hotspots_router)
app.include_router(incidents_router)
app.include_router(history_router)
app.include_router(statistics_router)


@app.get("/")
def home():
    return {
        "message": "AGNIRA Backend is running"
    }