from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Location(BaseModel):
    latitude: float
    longitude: float


class Detection(BaseModel):
    id: str
    timestamp: datetime

    source: str = "VIIRS"
    satellite: str = "unknown"

    frp: float
    brightness: float

    firms_confidence: str
    day_night: Optional[str] = None


class Classification(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)

    probabilities: dict[str, float] = {}
    reasoning: list[str] = []


class Persistence(BaseModel):
    score: float = Field(ge=0.0, le=100.0)

    detection_count: int = 0

    first_detected: Optional[datetime] = None
    last_detected: Optional[datetime] = None

    average_frp: Optional[float] = None
    maximum_frp: Optional[float] = None


class Context(BaseModel):
    industrial_area: bool = False

    facility_type: Optional[str] = None
    facility_name: Optional[str] = None
    distance_meters: Optional[float] = None

    schools_count: int = 0
    hospitals_count: int = 0

    nearest_school_distance: Optional[float] = None
    nearest_hospital_distance: Optional[float] = None


class Risk(BaseModel):
    score: float = Field(ge=0.0, le=100.0)
    severity: str


class Event(BaseModel):
    id: str

    location: Location
    detection: Detection

    classification: Classification
    persistence: Persistence
    context: Context
    risk: Risk