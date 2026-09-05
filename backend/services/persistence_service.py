from datetime import datetime
import math

def calculate_distance_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float
):
    """
    Calculate distance between two geographic coordinates
    using the Haversine formula.
    """

    earth_radius = 6_371_000

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(delta_lon / 2) ** 2
    )

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a)
    )

    return earth_radius * c

def calculate_persistence(
    current_latitude: float,
    current_longitude: float,
    observations: list[dict],
    radius_meters: float = 500
):
    """
    Calculate persistence for a thermal source.

    Only observations within radius_meters of the
    current hotspot are considered part of the
    same thermal source.

    Persistence score considers:
        - number of detections
        - number of distinct detection days
        - time span between first and last detection
    """

    nearby_observations = []

    for observation in observations:

        distance = calculate_distance_meters(
            current_latitude,
            current_longitude,
            observation["latitude"],
            observation["longitude"]
        )

        if distance <= radius_meters:
            nearby_observations.append(observation)

    if not nearby_observations:
        return {
            "score": 0.0,
            "detection_count": 0,
            "distinct_detection_days": 0,
            "duration_days": 0.0,
            "first_detected": None,
            "last_detected": None,
            "average_frp": None,
            "maximum_frp": None
        }

    timestamps = [
        observation["timestamp"]
        for observation in nearby_observations
    ]

    frp_values = [
        observation["frp"]
        for observation in nearby_observations
    ]

    first_detected = min(timestamps)
    last_detected = max(timestamps)

    detection_count = len(nearby_observations)

    distinct_detection_days = len({
        timestamp.date()
        for timestamp in timestamps
    })

    duration_days = (
        last_detected - first_detected
    ).total_seconds() / 86_400

    average_frp = sum(frp_values) / detection_count
    maximum_frp = max(frp_values)

    # --------------------------------------------------
    # Persistence score
    # --------------------------------------------------

    # 40 points: repeated detections
    detection_score = min(
        detection_count / 10,
        1.0
    ) * 40

    # 40 points: detections spread across different days
    day_score = min(
        distinct_detection_days / 7,
        1.0
    ) * 40

    # 20 points: duration between first and last detection
    duration_score = min(
        duration_days / 30,
        1.0
    ) * 20

    if distinct_detection_days < 2:
        score = 0.0
    else:
        score = (
            detection_score
            + day_score
            + duration_score
        )

    return {
        "score": round(score, 2),
        "detection_count": detection_count,
        "distinct_detection_days": distinct_detection_days,
        "duration_days": round(duration_days, 2),
        "first_detected": first_detected,
        "last_detected": last_detected,
        "average_frp": round(average_frp, 2),
        "maximum_frp": round(maximum_frp, 2)
    }