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
from services.live_event_store import (
    save_event,
    get_observations_as_datetime,
    combine_observations,
    get_all_events,
)


router = APIRouter()


@router.get("/api/hotspots")
def get_hotspots(
    live: bool = Query(False),
    limit: int | None = Query(None, ge=1, le=50),
    days: int = Query(3, ge=1, le=5),
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
            days=days
        )

        # Keep all detections for analysis.
        # The limit should only control how many events
        # are returned to the frontend.
        all_detections = detections

        # --------------------------------------------------
        # 1b. Bring in historical observations from SQLite so
        # persistence reflects real multi-day activity, not just
        # what FIRMS happened to return in this one request.
        #
        # Fetched once per request (not once per detection) —
        # persistence_service.calculate_persistence() already does its
        # own 500m filtering per detection against whatever list it's
        # given, so one combined list serves every detection below.
        # --------------------------------------------------

        historical_observations = get_observations_as_datetime()

        combined_observations = combine_observations(
            historical_observations,
            all_detections
        )

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
            # 4. Persistence
            # --------------------------------------------------

            persistence = calculate_persistence(            
                current_latitude=latitude,
                current_longitude=longitude,
                observations=combined_observations
            )

            # --------------------------------------------------
            # 5. Classification
            # --------------------------------------------------

            classification = predict_classification(
                detection=detection,
                persistence=persistence,
                context=context,
                observations=combined_observations
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
    # Cached mode - real stored events, not mock data
    # ------------------------------------------------------

    return {
        "source": "SQLite cached events",
        "events": get_all_events()
    }