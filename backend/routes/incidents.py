from fastapi import APIRouter, HTTPException

from services.live_event_store import get_event


router = APIRouter()


@router.get("/api/incidents/{event_id}")
def get_incident(event_id: str):

    live_event = get_event(event_id)

    if live_event is not None:
        return live_event

    raise HTTPException(
        status_code=404,
        detail="Incident not found"
    )