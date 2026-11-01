import csv
import io
import os
import hashlib
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
    days: int = 1,
    date: str | None = None
):
    """
    Fetch FIRMS thermal anomaly data.

    If date is None:
        Fetch the most recent FIRMS data.

    If date is provided:
        Fetch FIRMS data starting from that historical date.
    """

    if not FIRMS_MAP_KEY:
        raise ValueError("FIRMS_MAP_KEY is not configured")

    if not 1 <= days <= 5:
        raise ValueError("days must be between 1 and 5")

    # Validate historical date if provided
    if date is not None:
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise ValueError(
                "date must be in YYYY-MM-DD format"
            )

    area = f"{west},{south},{east},{north}"

    url = (
        f"{BASE_URL}/csv/"
        f"{FIRMS_MAP_KEY}/"
        f"VIIRS_NOAA21_NRT/"
        f"{area}/"
        f"{days}"
    )

    # Add historical date only when requested
    if date is not None:
        url += f"/{date}"

    response = requests.get(
        url,
        timeout=30
    )

    response.raise_for_status()

    reader = csv.DictReader(
        io.StringIO(response.text)
    )

    detections = []

    for row in reader:

        acq_date = row["acq_date"]
        acq_time = row["acq_time"].zfill(4)

        timestamp = datetime.strptime(
            f"{acq_date} {acq_time}",
            "%Y-%m-%d %H%M"
        ).replace(
            tzinfo=timezone.utc
        )

        detection = {
            "id": hashlib.sha256(
                f"{row['latitude']}_"
                f"{row['longitude']}_"
                f"{row['acq_date']}_"
                f"{row['acq_time']}_"
                f"{row['satellite']}".encode()
            ).hexdigest()[:16],

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