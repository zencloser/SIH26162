from fastapi import APIRouter, Query

from models.hotspot import LiveHotspot

from services.firms_service import get_firms_data
from services.osm_service import (
    get_nearby_industrial_features,
    extract_industrial_context
)
from services.ml_service import predict_classification
from services.persistence_service import calculate_persistence
from services.risk_service import calculate_risk
from services.live_event_store import save_event


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

        # --------------------------------------------------
        # 1. Get live FIRMS detections
        # --------------------------------------------------

        detections = get_firms_data(
            west=west,
            south=south,
            east=east,
            north=north,
            days=1
        )

        # Keep all detections for analysis.
        # The limit should only control how many events
        # are returned to the frontend.
        all_detections = detections

        if limit:
            detections = detections[:limit]

        events = []

        # --------------------------------------------------
        # 2. Process each hotspot
        # --------------------------------------------------

        for detection in detections:

            latitude = detection["latitude"]
            longitude = detection["longitude"]

            # --------------------------------------------------
            # 3. Get nearby OSM industrial context
            # --------------------------------------------------

            osm_data = get_nearby_industrial_features(
                latitude,
                longitude
            )

            context = extract_industrial_context(
                latitude,
                longitude,
                osm_data
            )

            # --------------------------------------------------
            # 4. Prepare features for classification
            # --------------------------------------------------

            features = {
                "frp": detection["frp"],
                "brightness": detection["brightness"],
                "industrial_area": context["industrial_area"]
            }

            # --------------------------------------------------
            # 5. Classification
            # --------------------------------------------------

            classification = predict_classification(
                features
            )

            # --------------------------------------------------
            # 6. Persistence
            # --------------------------------------------------

            persistence = calculate_persistence(
                current_latitude=latitude,
                current_longitude=longitude,
                observations=all_detections
            )

            # --------------------------------------------------
            # 7. Risk
            # --------------------------------------------------

            risk = calculate_risk(
                frp=detection["frp"],
                brightness=detection["brightness"],
                classification=classification,
                context=context
            )

            # --------------------------------------------------
            # 8. Build final hotspot
            # --------------------------------------------------

            event = LiveHotspot(
                **detection,
                context=context,
                classification=classification,
                risk=risk,
                persistence=persistence
            )

            # --------------------------------------------------
            # 9. Convert to JSON-compatible dictionary
            # --------------------------------------------------

            event_data = event.model_dump(
                mode="json"
            )

            # --------------------------------------------------
            # 10. Store live event
            # --------------------------------------------------

            save_event(event_data)

            events.append(event_data)

        # --------------------------------------------------
        # 11. Return live hotspot response
        # --------------------------------------------------

        return {
            "source": "NASA FIRMS",
            "events": events
        }

    # ------------------------------------------------------
    # Mock mode
    # ------------------------------------------------------

    return {
        "source": "mock",
        "events": []
    }