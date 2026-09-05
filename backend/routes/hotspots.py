from fastapi import APIRouter, Query

from services.firms_service import get_firms_data
from services.osm_service import (
    get_nearby_industrial_features,
    extract_industrial_context
)
from services.ml_service import predict_classification
from services.risk_service import calculate_risk
from services.live_event_store import save_event
from models.hotspot import LiveHotspot


router = APIRouter()


@router.get("/api/hotspots")
def get_hotspots(
    live: bool = Query(False),
    limit: int | None = Query(None, ge=1, le=50),
    west: float = Query(68.0),
    south: float = Query(6.0),
    east: float = Query(97.0),
    north: float = Query(37.0)
):
    if live:
        detections = get_firms_data(
            west=west,
            south=south,
            east=east,
            north=north,
            days=1
        )

        if limit:
            detections = detections[:limit]

        events = []

        for detection in detections:
            latitude = detection["latitude"]
            longitude = detection["longitude"]

            osm_data = get_nearby_industrial_features(
                latitude,
                longitude
            )

            context = extract_industrial_context(
                latitude,
                longitude,
                osm_data
            )

            features = {
                "frp": detection["frp"],
                "brightness": detection["brightness"],
                "industrial_area": context["industrial_area"]
            }

            classification = predict_classification(features)

            risk = calculate_risk(
                frp=detection["frp"],
                brightness=detection["brightness"],
                classification=classification,
                context=context
            )

            event = LiveHotspot(
                **detection,
                context=context,
                classification=classification,
                risk=risk
            )

            event_data = event.model_dump(mode="json")

            save_event(event_data)

            events.append(event_data)

        return {
            "source": "NASA FIRMS",
            "events": events
        }

    return {
        "source": "mock",
        "events": []
    }