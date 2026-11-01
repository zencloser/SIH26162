from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HotspotContext(BaseModel):
    industrial_area: bool = False
    facility_type: Optional[str] = None
    facility_name: Optional[str] = None
    distance_meters: Optional[float] = None

class HotspotRisk(BaseModel):
    score: float
    severity: str

class HotspotPersistence(BaseModel):
    score: float
    detection_count: int
    distinct_detection_days: int
    duration_days: float
    first_detected: Optional[datetime] = None
    last_detected: Optional[datetime] = None
    average_frp: Optional[float] = None
    maximum_frp: Optional[float] = None


class LiveHotspot(BaseModel):
    id: str

    latitude: float
    longitude: float

    timestamp: datetime

    source: str
    satellite: str

    frp: float
    brightness: float

    firms_confidence: str
    day_night: Optional[str] = None

    context: HotspotContext
    classification: dict
    risk: HotspotRisk
    persistence: HotspotPersistence