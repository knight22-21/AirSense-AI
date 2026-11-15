"""Threshold alerts derived from the current station network.

No new data source is required: alerts are computed from the same live readings
used by the map. When Supabase is configured, the scheduler already persists
breaching readings to the ``alerts`` table for history.
"""
import asyncio
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, HTTPException

from config import CITIES, get_city
from services.openaq import fetch_live_aqi
from utils.aqi import risk_level

router = APIRouter()


def _age_hours(timestamp) -> float | None:
    try:
        ts = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0
    except (TypeError, ValueError):
        return None


def _alerts_from(readings: List[Dict], city_name: str, threshold: float,
                 hours: float) -> List[Dict]:
    alerts = []
    for r in readings:
        aqi = r.get("aqi")
        if aqi is None or float(aqi) < threshold:
            continue
        age = _age_hours(r.get("timestamp"))
        if age is not None and age > hours:
            continue
        station = r.get("station_name") or r.get("station_id")
        level = risk_level(float(aqi))
        alerts.append({
            "city": city_name,
            "station_id": r.get("station_id"),
            "station_name": station,
            "latitude": r.get("latitude"),
            "longitude": r.get("longitude"),
            "aqi": round(float(aqi), 1),
            "threshold": threshold,
            "exceedance": round(float(aqi) - threshold, 1),
            "level": level,
            "severity": "critical" if float(aqi) >= 300 else "warning",
            "timestamp": r.get("timestamp"),
            "age_hours": round(age, 1) if age is not None else None,
            "message": f"AQI {float(aqi):.0f} at {station} — {level}",
            "data_source": r.get("source", "mock"),
        })
    alerts.sort(key=lambda a: a["aqi"], reverse=True)
    return alerts


def _validate(threshold: float, hours: float):
    if not 0 <= threshold <= 500:
        raise HTTPException(status_code=400, detail="threshold must be 0-500")
    if not 1 <= hours <= 168:
        raise HTTPException(status_code=400, detail="hours must be 1-168")


@router.get("")
async def get_all_alerts(threshold: float = 200, hours: float = 24, limit: int = 50):
    _validate(threshold, hours)
    if not 1 <= limit <= 200:
        raise HTTPException(status_code=400, detail="limit must be 1-200")
    per_city = await asyncio.gather(
        *[fetch_live_aqi(cid) for cid in CITIES],
        return_exceptions=True,
    )
    alerts = []
    for cid, readings in zip(CITIES, per_city):
        if isinstance(readings, Exception):
            continue
        alerts.extend(_alerts_from(readings, CITIES[cid]["name"], threshold, hours))
    alerts.sort(key=lambda a: a["aqi"], reverse=True)
    return {"threshold": threshold, "hours": hours, "count": len(alerts),
            "alerts": alerts[:limit]}


@router.get("/{city}")
async def get_city_alerts(city: str, threshold: float = 200, hours: float = 24):
    _validate(threshold, hours)
    try:
        cfg = get_city(city)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city}'")
    readings = await fetch_live_aqi(cfg["id"])
    alerts = _alerts_from(readings, cfg["name"], threshold, hours)
    return {"city": cfg["name"], "threshold": threshold, "hours": hours,
            "count": len(alerts), "alerts": alerts,
            "data_source": readings[0].get("source", "mock") if readings else "mock"}
