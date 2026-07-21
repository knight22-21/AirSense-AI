from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class Station(BaseModel):
    id: str
    name: str
    city: str
    latitude: float
    longitude: float
    last_aqi: Optional[float] = None
    last_updated: Optional[datetime] = None


class AQIReading(BaseModel):
    station_id: str
    station_name: Optional[str] = None
    parameter: str
    value: float
    unit: str
    timestamp: str
    latitude: float
    longitude: float
    aqi: Optional[float] = None


class WeatherData(BaseModel):
    timestamp: str
    temperature: float
    humidity: float
    wind_speed: float
    wind_direction: float
    boundary_layer_height: Optional[float] = None


class ForecastPoint(BaseModel):
    timestamp: str
    aqi: float
    pm25: Optional[float] = None
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None


class ForecastResponse(BaseModel):
    station_id: str
    station_name: str
    generated_at: str
    horizon_hours: int
    forecasts: List[ForecastPoint]


class EnforcementHotspot(BaseModel):
    rank: int
    location: str
    latitude: float
    longitude: float
    score: float
    evidence_tags: List[str]
    summary: str
    source_type: str


class AdvisoryResponse(BaseModel):
    city: str
    risk_level: str
    aqi_value: float
    advisory_en: str
    advisory_hi: str
    generated_at: str
    vulnerable_groups: List[str]
