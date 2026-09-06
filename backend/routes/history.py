from fastapi import APIRouter, HTTPException

from services.live_event_store import get_event, get_observations_near


router = APIRouter()


@router.get("/api/incidents/{event_id}/history")
def get_incident_history(event_id: str):

    event = get_event(event_id)

    if event is None:
        raise HTTPException(
            status_code=404,
            detail="History not found"
        )

    history = get_observations_near(
        event["latitude"],
        event["longitude"],
    )

    return {
        "event_id": event_id,
        "history": history
    }