from fastapi import FastAPI

from routes.hotspots import router as hotspots_router
from routes.incidents import router as incidents_router
from routes.history import router as history_router
from routes.statistics import router as statistics_router


app = FastAPI(
    title="AGNIRA Backend",
    description="Backend API for SIH26162",
    version="1.0.0"
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