import json
from pathlib import Path

from fastapi import APIRouter

from models.event import Event


router = APIRouter()


DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "sample_events.json"


@router.get("/api/hotspots")
def get_hotspots():
    with open(DATA_FILE, "r") as file:
        data = json.load(file)

    events = [Event(**event) for event in data]

    return {
        "events": events
    }