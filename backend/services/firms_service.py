import csv
import io
import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY")

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area"


def get_firms_data(
    west: float,
    south: float,
    east: float,
    north: float,
    days: int = 1
):
    """
    Fetch recent FIRMS thermal anomaly data
    and return it in our backend format.
    """

    if not FIRMS_MAP_KEY:
        raise ValueError("FIRMS_MAP_KEY is not configured")

    if not 1 <= days <= 5:
        raise ValueError("days must be between 1 and 5")

    area = f"{west},{south},{east},{north}"

    url = (
        f"{BASE_URL}/csv/"
        f"{FIRMS_MAP_KEY}/"
        f"VIIRS_NOAA21_NRT/"
        f"{area}/"
        f"{days}"
    )

    response = requests.get(url, timeout=30)
    response.raise_for_status()

    reader = csv.DictReader(io.StringIO(response.text))

    detections = []

    for row in reader:
        acq_date = row["acq_date"]
        acq_time = row["acq_time"].zfill(4)

        timestamp = datetime.strptime(
            f"{acq_date} {acq_time}",
            "%Y-%m-%d %H%M"
        ).replace(tzinfo=timezone.utc)

        detection = {
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "timestamp": timestamp,
            "source": "VIIRS",
            "satellite": row["satellite"],
            "frp": float(row["frp"]),
            "brightness": float(row["bright_ti4"]),
            "firms_confidence": row["confidence"],
            "day_night": row["daynight"],
        }

        detections.append(detection)

    return detections