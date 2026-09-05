from fastapi import APIRouter, Query

from services.firms_service import get_firms_data


router = APIRouter()


@router.get("/api/hotspots")
def get_hotspots(
    live: bool = Query(False)
):
    if live:
        detections = get_firms_data(
            west=68.0,
            south=6.0,
            east=97.0,
            north=37.0,
            days=1
        )

        return {
            "source": "NASA FIRMS",
            "events": detections
        }

    return {
        "source": "mock",
        "events": []
    }