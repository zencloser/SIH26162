import json
from pathlib import Path

from fastapi import APIRouter

from models.event import Event


router = APIRouter()


DATA_FILE = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "sample_events.json"
)


@router.get("/api/statistics")
def get_statistics():

    with open(DATA_FILE, "r") as file:
        data = json.load(file)

    events = [Event(**event) for event in data]

    industrial_fires = 0
    natural_fires = 0
    agricultural_burning = 0
    persistent_sources = 0
    high_risk_events = 0

    for event in events:

        classification = event.classification.label

        if classification == "industrial_fire":
            industrial_fires += 1

        elif classification == "natural_fire":
            natural_fires += 1

        elif classification == "agricultural_burning":
            agricultural_burning += 1

        elif classification == "persistent_source":
            persistent_sources += 1

        if event.risk.severity in ["high", "critical"]:
            high_risk_events += 1

    return {
        "active_anomalies": len(events),
        "industrial_fires": industrial_fires,
        "persistent_sources": persistent_sources,
        "natural_fires": natural_fires,
        "agricultural_burning": agricultural_burning,
        "unknown": 0,
        "high_risk_events": high_risk_events
    }