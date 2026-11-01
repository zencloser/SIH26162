import requests
import math

OVERPASS_URL = "https://overpass.private.coffee/api/interpreter"


def query_overpass(query: str):
    """
    Send a query to the OpenStreetMap Overpass API.

    If the public Overpass server is unavailable,
    return an empty result instead of crashing the backend.
    """

    try:
        response = requests.post(
            OVERPASS_URL,
            data=query,
            timeout=30
        )

        response.raise_for_status()

        return response.json()

    except requests.RequestException as error:
        print(f"OSM Overpass request failed: {error}")

        return {
            "elements": []
        }


def get_nearby_industrial_features(latitude: float, longitude: float):
    """
    Find industrial-related OSM features within 1 km
    of a given FIRMS hotspot.
    """

    query = f"""
    [out:json][timeout:60];

    (
        nwr(
            around:1000,
            {latitude},
            {longitude}
        )["landuse"="industrial"];

        nwr(
            around:1000,
            {latitude},
            {longitude}
        )["man_made"="works"];

        nwr(
            around:1000,
            {latitude},
            {longitude}
        )["power"="plant"];
    );

    out center tags;
    """

    return query_overpass(query)

def calculate_distance_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float
):
    """
    Calculate the distance between two geographic coordinates
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

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return earth_radius * c

def extract_industrial_context(
    latitude: float,
    longitude: float,
    osm_data: dict
):
    """
    Extract useful industrial context from raw OSM data.
    """

    features = osm_data.get("elements", [])

    if not features:
        return {
            "industrial_area": False,
            "facility_type": None,
            "facility_name": None,
            "distance_meters": None
        }

    nearest_feature = None
    nearest_distance = None

    for feature in features:
        tags = feature.get("tags", {})

        if feature["type"] == "node":
            feature_lat = feature.get("lat")
            feature_lon = feature.get("lon")
        else:
            center = feature.get("center", {})
            feature_lat = center.get("lat")
            feature_lon = center.get("lon")

        if feature_lat is None or feature_lon is None:
            continue

        distance = calculate_distance_meters(
            latitude,
            longitude,
            feature_lat,
            feature_lon
        )

        if nearest_distance is None or distance < nearest_distance:
            nearest_distance = distance
            nearest_feature = feature

    if nearest_feature is None:
        return {
            "industrial_area": False,
            "facility_type": None,
            "facility_name": None,
            "distance_meters": None
        }

    tags = nearest_feature.get("tags", {})

    if tags.get("landuse") == "industrial":
        facility_type = "industrial_area"
    elif tags.get("man_made") == "works":
        facility_type = "works"
    elif tags.get("power") == "plant":
        facility_type = "power_plant"
    else:
        facility_type = "industrial"

    return {
        "industrial_area": True,
        "facility_type": facility_type,
        "facility_name": tags.get("name"),
        "distance_meters": round(nearest_distance, 2)
    }