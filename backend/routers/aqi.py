from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from config import get_city
from services.openaq import fetch_stations, fetch_live_aqi, fetch_historical_aqi
from services.wards import get_ward_geojson
from utils.aqi import risk_level
from utils.geo import dist_km, feature_centroid, idw_value

router = APIRouter()


def _city(city: str) -> str:
    try:
        return get_city(city)["id"]
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city}'")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _source(rows) -> str:
    return rows[0].get("source", "mock") if rows else "mock"


def _data_age_minutes(rows) -> float | None:
    ages = []
    now = datetime.now(timezone.utc)
    for r in rows:
        try:
            ts = datetime.fromisoformat(str(r["timestamp"]).replace("Z", "+00:00"))
            ages.append((now - ts).total_seconds() / 60.0)
        except (KeyError, TypeError, ValueError):
            continue
    return round(min(ages), 1) if ages else None


def _annotate_wards(geojson: dict, readings) -> dict:
    valid = [r for r in readings if r.get("aqi") is not None]
    if not valid:
        return {**geojson, "interpolation": "idw", "data_source": _source(readings)}
    features = []
    for feature in geojson.get("features", []):
        centre = feature_centroid(feature)
        if not centre:
            features.append(feature)
            continue
        lat, lon = centre
        aqi = idw_value(lat, lon, valid)
        nearest = min(valid, key=lambda r: dist_km(lat, lon, r["latitude"], r["longitude"]))
        distance = dist_km(lat, lon, nearest["latitude"], nearest["longitude"])
        features.append({
            **feature,
            "properties": {
                **feature.get("properties", {}),
                "aqi": round(aqi, 1) if aqi is not None else None,
                "risk_level": risk_level(aqi) if aqi is not None else "No data",
                "nearest_station": nearest.get("station_name") or nearest.get("station_id"),
                "nearest_distance_km": round(distance, 1),
            },
        })
    return {
        **geojson,
        "features": features,
        "interpolation": "idw",
        "data_source": _source(readings),
    }


@router.get("/stations")
async def get_stations(city: str = "delhi"):
    stations = await fetch_stations(_city(city))
    return {"stations": stations, "count": len(stations), "data_source": _source(stations)}


@router.get("/live")
async def get_live_aqi(city: str = "delhi"):
    readings = await fetch_live_aqi(_city(city))
    return {"readings": readings, "count": len(readings), "timestamp": _now(),
            "data_age_minutes": _data_age_minutes(readings),
            "data_source": _source(readings)}


@router.get("/city/{city}")
async def get_city_aqi(city: str):
    readings = await fetch_live_aqi(_city(city))
    if not readings:
        raise HTTPException(status_code=503, detail="AQI data unavailable")
    vals = [r["aqi"] for r in readings if r.get("aqi") is not None]
    return {"city": get_city(city)["name"], "average_aqi": round(sum(vals) / len(vals), 1) if vals else 0.0,
            "station_count": len(readings), "stations": readings, "timestamp": _now(),
            "data_age_minutes": _data_age_minutes(readings),
            "data_source": _source(readings)}


@router.get("/history/{station_id}")
async def get_history(station_id: str, days: int = 7, city: str = "delhi"):
    if days > 30 or days < 1:
        raise HTTPException(status_code=400, detail="days must be 1-30")
    history = await fetch_historical_aqi(station_id, days, _city(city))
    return {"station_id": station_id, "days": days, "readings": history, "count": len(history),
            "data_source": _source(history)}


@router.get("/wards/{city}")
async def get_wards(city: str, with_aqi: bool = False):
    """Ward boundaries. ``with_aqi=true`` adds IDW-interpolated AQI per ward centroid."""
    city_id = _city(city)
    geojson = await get_ward_geojson(city_id)
    if not with_aqi:
        return geojson
    readings = await fetch_live_aqi(city_id)
    return _annotate_wards(geojson, readings)
