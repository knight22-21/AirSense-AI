import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from config import get_city
from utils.geo import dist_km
from services.openaq import fetch_live_aqi
from services.satellite import fetch_osm_layers
from services.llm import generate_citizen_advisory, _get_risk_level

router = APIRouter()


def _cfg(city: str):
    try:
        return get_city(city)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city}'")


def _near(osm, layer: str, lat: float, lon: float, km: float) -> int:
    return sum(1 for f in osm.get(layer, []) if dist_km(lat, lon, f["latitude"], f["longitude"]) <= km)


@router.get("/{city}/wards")
async def get_ward_advisories(city: str):
    """Per-station ('ward') risk level with vulnerable-population tags from OSM."""
    cfg = _cfg(city)
    readings, osm = await asyncio.gather(fetch_live_aqi(cfg["id"]), fetch_osm_layers(cfg["id"]))
    wards = []
    for r in readings:
        if r.get("aqi") is None:
            continue
        lat, lon = r["latitude"], r["longitude"]
        schools, hospitals = _near(osm, "school", lat, lon, 2.0), _near(osm, "hospital", lat, lon, 2.0)
        workers = _near(osm, "construction", lat, lon, 2.0) + _near(osm, "industrial", lat, lon, 2.0)
        tags = []
        if schools:
            tags.append(f"{schools} schools within 2 km")
        if hospitals:
            tags.append(f"{hospitals} hospitals within 2 km")
        if workers:
            tags.append("Outdoor/industrial workers nearby")
        wards.append({"station_id": r["station_id"], "name": r["station_name"] or r["station_id"],
                      "aqi": r["aqi"], "risk_level": _get_risk_level(r["aqi"]), "vulnerable_tags": tags,
                      "latitude": lat, "longitude": lon})
    wards.sort(key=lambda w: w["aqi"], reverse=True)
    return {"city": cfg["name"], "wards": wards, "count": len(wards),
            "data_source": readings[0].get("source", "mock") if readings else "mock"}


@router.get("/{city}")
async def get_city_advisory(city: str, station_id: Optional[str] = None):
    cfg = _cfg(city)
    readings = await fetch_live_aqi(cfg["id"])
    station = next((r for r in readings if r["station_id"] == station_id), None) if station_id else None
    if station_id and not station:
        raise HTTPException(status_code=404, detail="Unknown station for this city")
    if station:
        aqi_val, area = station["aqi"], station["station_name"]
    else:
        vals = [r["aqi"] for r in readings if r.get("aqi") is not None]
        aqi_val, area = (round(sum(vals) / len(vals), 1) if vals else 150.0), ""

    advisory = await generate_citizen_advisory(aqi_val, cfg["name"], area)
    return {
        "city": cfg["name"], "station_name": area or None, "aqi_value": aqi_val,
        "risk_level": advisory.get("risk_level", _get_risk_level(aqi_val)),
        "advisory_en": advisory.get("advisory_en", ""), "advisory_hi": advisory.get("advisory_hi", ""),
        "advisory_ta": advisory.get("advisory_ta", ""), "advisory_kn": advisory.get("advisory_kn", ""),
        "vulnerable_groups": advisory.get("vulnerable_groups", []),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_source": readings[0].get("source", "mock") if readings else "mock",
    }
