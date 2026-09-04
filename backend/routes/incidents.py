import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from models.event import Event


router = APIRouter()


DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "sample_events.json"


@router.get("/api/incidents/{event_id}")
def get_incident(event_id: str):

    with open(DATA_FILE, "r") as file:
        data = json.load(file)

    for event in data:
        if event["id"] == event_id:
            return Event(**event)

    raise HTTPException(
        status_code=404,
        detail="Incident not found"
    )