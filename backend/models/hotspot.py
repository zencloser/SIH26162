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