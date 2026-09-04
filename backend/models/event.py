from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class Location(BaseModel):
    latitude: float
    longitude: float


class Detection(BaseModel):
    timestamp: datetime
    source: str
    satellite: str

    frp: float
    brightness: float

    firms_confidence: str


class Classification(BaseModel):
    label: str
    confidence: float

    reasoning: list[str] = []


class Persistence(BaseModel):
    score: float
    detection_count: int

    first_detected: Optional[datetime] = None
    last_detected: Optional[datetime] = None


class Context(BaseModel):
    industrial_area: bool = False
    facility_type: Optional[str] = None
    distance_meters: Optional[float] = None

    schools_count: int = 0
    hospitals_count: int = 0


class Risk(BaseModel):
    score: float
    severity: str


class Event(BaseModel):
    id: str

    location: Location
    detection: Detection
    classification: Classification
    persistence: Persistence
    context: Context
    risk: Risk