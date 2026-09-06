from fastapi import APIRouter

from services.live_event_store import get_all_events


router = APIRouter()


@router.get("/api/statistics")
def get_statistics():

    events = get_all_events()

    industrial_fires = 0
    natural_fires = 0
    agricultural_burning = 0
    persistent_sources = 0
    high_risk_events = 0

    for event in events:

        # Stored events are flat LiveHotspot dicts (see models/hotspot.py),
        # not the nested Event model - access via dict keys, not attributes.
        classification = event.get("classification", {}).get("label")

        if classification == "industrial_fire":
            industrial_fires += 1

        elif classification == "natural_fire":
            natural_fires += 1

        elif classification == "agricultural_burning":
            agricultural_burning += 1

        elif classification == "persistent_source":
            persistent_sources += 1

        if event.get("risk", {}).get("severity") in ["high", "critical"]:
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