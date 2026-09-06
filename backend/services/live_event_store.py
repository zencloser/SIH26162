"""
Persistent storage for AGNIRA backend.

Replaces temporary in-memory event storage with a local SQLite database.
Only Python's built-in sqlite3 module is used — no new dependencies.

LiveHotspot (backend/models/hotspot.py) is FLAT at the top level:

    {
        "id": "...",
        "latitude": ...,
        "longitude": ...,
        "timestamp": "...",
        "source": "...",
        "satellite": "...",
        "frp": ...,
        "brightness": ...,
        "firms_confidence": "...",
        "day_night": ...,
        "context": {...},
        "classification": {...},
        "risk": {...},
        "persistence": {...}
    }

Two tables:
  - hotspot_events: one row per fully processed LiveHotspot (id is unique;
    re-saving the same id updates the row instead of duplicating it). The
    complete object — including nested context/classification/risk/
    persistence — is preserved in event_json.
  - observations:   the raw thermal detection underlying that hotspot
    (lat/lon/timestamp/frp/brightness/satellite/source), used for
    multi-day persistence analysis. save_event() writes to both tables,
    since a processed LiveHotspot IS a processed FIRMS observation.

This module also provides the read-side helpers used by
routes/hotspots.py to bring historical observations into the existing
persistence_service.calculate_persistence() call:

  - get_observations_as_datetime(): historical observations with
    "timestamp" converted back into the tz-aware UTC datetime type that
    firms_service.py produces and persistence_service.py requires
    (it calls timestamp.date() and does datetime subtraction — a raw
    string would break or silently misbehave there).
  - combine_observations(historical, current): merges historical +
    this request's FIRMS detections without double-counting a detection
    that appears in both (e.g. one already saved from an earlier call
    that FIRMS is still reporting today).
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


DB_FILE = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "agnira.db"
)


def _get_connection() -> sqlite3.Connection:
    """Open a new connection to the SQLite database."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DB_FILE)


def initialize_database() -> None:
    """
    Create backend/data/agnira.db (and the data/ folder) if they don't
    already exist, and make sure both tables exist.

    Safe to call every time the app starts — CREATE TABLE IF NOT EXISTS
    is a no-op if the schema is already there.
    """
    conn = _get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hotspot_events (
                id TEXT PRIMARY KEY,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                timestamp TEXT,
                frp REAL,
                brightness REAL,
                event_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                timestamp TEXT NOT NULL,
                frp REAL,
                brightness REAL,
                satellite TEXT,
                source TEXT,
                UNIQUE(latitude, longitude, timestamp, satellite, source)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _event_to_dict(event: Any) -> dict:
    """
    Accept either a plain dict or a Pydantic LiveHotspot model (or
    anything pydantic-like) and normalize it to a plain, JSON-safe dict.
    """
    if isinstance(event, dict):
        return event

    if hasattr(event, "model_dump"):
        # Pydantic v2 — mode="json" turns datetimes into ISO strings.
        return event.model_dump(mode="json")

    if hasattr(event, "dict"):
        # Pydantic v1 fallback.
        return json.loads(event.json())

    raise TypeError(
        "save_event() expects a dict or a Pydantic model, "
        f"got {type(event)!r}"
    )


def save_event(event: Any) -> dict:
    """
    Persist a fully processed LiveHotspot.

    Writes to hotspot_events (full object, keyed by id — INSERT OR REPLACE
    so re-processing the same event updates rather than duplicates it),
    and to observations (the raw detection underlying it — INSERT OR
    IGNORE so the exact same detection reported twice isn't duplicated).

    Returns the normalized dict that was stored.
    """
    data = _event_to_dict(event)

    event_id = data["id"]
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    timestamp = data.get("timestamp")
    frp = data.get("frp")
    brightness = data.get("brightness")
    satellite = data.get("satellite")
    source = data.get("source")
    event_json = json.dumps(data, default=str)

    conn = _get_connection()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO hotspot_events
                (id, latitude, longitude, timestamp, frp, brightness, event_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, latitude, longitude, timestamp, frp, brightness, event_json),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO observations
                (latitude, longitude, timestamp, frp, brightness, satellite, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (latitude, longitude, timestamp, frp, brightness, satellite, source),
        )
        conn.commit()
    finally:
        conn.close()

    return data


def get_event(event_id: str) -> Optional[dict]:
    """Return the stored event dict for event_id, or None if not found."""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "SELECT event_json FROM hotspot_events WHERE id = ?",
            (event_id,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if row is None:
        return None

    return json.loads(row[0])


def get_all_events() -> list[dict]:
    """Return every stored event as a list of dicts."""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "SELECT event_json FROM hotspot_events ORDER BY timestamp DESC"
        )
        rows = cursor.fetchall()
    finally:
        conn.close()

    return [json.loads(row[0]) for row in rows]


def get_observations() -> list[dict]:
    """
    Return every stored raw observation as a list of dicts, with
    "timestamp" exactly as stored (an ISO string). Do NOT compare this
    against datetime objects — use get_observations_as_datetime() for
    anything that needs to reach persistence_service.py.
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT latitude, longitude, timestamp, frp, brightness, satellite, source
            FROM observations
            ORDER BY timestamp ASC
            """
        )
        rows = cursor.fetchall()
    finally:
        conn.close()

    columns = ["latitude", "longitude", "timestamp", "frp", "brightness", "satellite", "source"]
    return [dict(zip(columns, row)) for row in rows]


def _parse_iso_timestamp(value: str) -> datetime:
    """
    Parse an ISO-8601 timestamp string — as stored via
    LiveHotspot.model_dump(mode="json") — back into a timezone-aware UTC
    datetime, matching exactly what firms_service.py produces
    (datetime.replace(tzinfo=timezone.utc)) and what persistence_service.py
    requires (it calls .date() and subtracts datetimes).

    Handles both "...Z" and "...+00:00" suffixes. If the parsed value is
    naive (shouldn't happen given how it was written, but just in case),
    it's treated as UTC rather than silently compared as a naive value.
    """
    text = value
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    parsed = datetime.fromisoformat(text)

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)

    return parsed


def get_observations_as_datetime() -> list[dict]:
    """
    Same data as get_observations(), but with "timestamp" converted from
    the ISO string stored in SQLite into a timezone-aware UTC datetime
    object — the type persistence_service.py actually operates on.
    """
    converted = []
    for observation in get_observations():
        observation = dict(observation)
        if observation.get("timestamp"):
            observation["timestamp"] = _parse_iso_timestamp(observation["timestamp"])
        converted.append(observation)
    return converted


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Great-circle distance in km. Same formula/radius convention used for
    location-scoping elsewhere in the pipeline (e.g. ml_service.py's
    night_ratio calculation) - duplicated here (not imported) to keep
    live_event_store.py independent of ml_service.py.
    """
    from math import radians, sin, cos, asin, sqrt

    r = 6371.0088
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * r * asin(sqrt(a))


def get_observations_near(
    latitude: float,
    longitude: float,
    radius_km: float = 0.5,
) -> list[dict]:
    """
    Real replacement for the history.json lookup used by
    routes/history.py: return this location's stored observations as
    {"timestamp": ISO string, "frp": ..., "brightness": ...} dicts,
    sorted by timestamp ascending - matching history.json's existing
    per-event list shape exactly (no new response fields).

    Read-only query over the existing `observations` table/columns - no
    schema change. 0.5 km default matches the same location-scoping
    radius convention already used elsewhere in the pipeline.
    """
    matched = []
    for observation in get_observations():
        try:
            distance = _haversine_km(
                latitude, longitude,
                observation["latitude"], observation["longitude"],
            )
        except (TypeError, KeyError):
            continue
        if distance <= radius_km:
            matched.append({
                "timestamp": observation["timestamp"],
                "frp": observation["frp"],
                "brightness": observation["brightness"],
            })

    matched.sort(key=lambda o: o["timestamp"])
    return matched


def combine_observations(historical: list[dict], current: list[dict]) -> list[dict]:
    """
    Merge historical SQLite observations with the current FIRMS
    detections for a single persistence calculation, without double-
    counting an observation that exists in both (e.g. a detection that
    was already saved in an earlier request and that FIRMS is still
    reporting today).

    Identity is (latitude, longitude, timestamp, satellite, source).
    Latitude/longitude are rounded to 5 decimal places (~1m) purely to
    absorb any float round-tripping through SQLite storage — it does not
    change which physical detections are considered distinct.

    Both "historical" and "current" entries must already have "timestamp"
    as a real datetime object (not a string) — pass get_observations_
    as_datetime() output as `historical`, and FIRMS detection dicts
    (which already carry tz-aware datetimes) as `current`.

    When the same identity appears in both lists, the current detection's
    dict is kept (fresher, full-precision source).
    """

    def _key(observation: dict):
        return (
            round(observation["latitude"], 5),
            round(observation["longitude"], 5),
            observation["timestamp"],
            observation.get("satellite"),
            observation.get("source"),
        )

    merged: dict = {}
    for observation in historical:
        merged[_key(observation)] = observation
    for observation in current:
        merged[_key(observation)] = observation

    return list(merged.values())