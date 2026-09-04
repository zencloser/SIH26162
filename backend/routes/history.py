import json
from pathlib import Path

from fastapi import APIRouter, HTTPException


router = APIRouter()


HISTORY_FILE = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "history.json"
)


@router.get("/api/incidents/{event_id}/history")
def get_incident_history(event_id: str):

    with open(HISTORY_FILE, "r") as file:
        history = json.load(file)

    if event_id not in history:
        raise HTTPException(
            status_code=404,
            detail="History not found"
        )

    return {
        "event_id": event_id,
        "history": history[event_id]
    }