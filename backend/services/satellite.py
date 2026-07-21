import os
import httpx
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

NASA_FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
MAP_KEY = os.getenv("NASA_FIRMS_MAP_KEY", "MAP_KEY")

# Delhi NCR bounding box: west,south,east,north
DELHI_BBOX = "76.8,28.4,77.4,28.9"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


async def fetch_fire_hotspots(days: int = 7) -> List[Dict]:
    """Fetch VIIRS fire detections near Delhi from NASA FIRMS."""
    url = f"{NASA_FIRMS_BASE}/{MAP_KEY}/VIIRS_SNPP_NRT/{DELHI_BBOX}/{days}"
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.get(url)
            if resp.status_code == 200 and "latitude" in resp.text:
                return _parse_firms_csv(resp.text)
        except Exception as e:
            logger.warning(f"NASA FIRMS fetch failed: {e}")
    return _mock_hotspots()


def _parse_firms_csv(text: str) -> List[Dict]:
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if len(lines) < 2:
        return _mock_hotspots()
    headers = [h.strip() for h in lines[0].split(",")]
    hotspots = []
    for line in lines[1:]:
        vals = [v.strip() for v in line.split(",")]
        if len(vals) < len(headers):
            continue
        row = dict(zip(headers, vals))
        try:
            hotspots.append({
                "latitude": float(row.get("latitude", 0)),
                "longitude": float(row.get("longitude", 0)),
                "brightness": float(row.get("bright_ti4", row.get("brightness", 300))),
                "confidence": row.get("confidence", "nominal"),
                "acq_date": row.get("acq_date", ""),
                "frp": float(row.get("frp", 0)),
                "type": "fire_hotspot",
            })
        except (ValueError, KeyError):
            continue
    return hotspots if hotspots else _mock_hotspots()


async def fetch_industrial_zones() -> List[Dict]:
    """Query OSM Overpass API for industrial land-use in Delhi."""
    query = """
[out:json][timeout:25];
(
  way["landuse"="industrial"](28.4,76.8,28.9,77.4);
  relation["landuse"="industrial"](28.4,76.8,28.9,77.4);
);
out center;
"""
    async with httpx.AsyncClient(timeout=25) as client:
        try:
            resp = await client.post(OVERPASS_URL, data={"data": query})
            if resp.status_code == 200:
                elements = resp.json().get("elements", [])
                zones = []
                for el in elements:
                    center = el.get("center", {})
                    tags = el.get("tags", {})
                    if center:
                        zones.append({
                            "id": el.get("id"),
                            "latitude": center.get("lat", 0),
                            "longitude": center.get("lon", 0),
                            "name": tags.get("name", "Industrial Zone"),
                            "type": "industrial",
                        })
                if zones:
                    return zones
        except Exception as e:
            logger.warning(f"OSM Overpass fetch failed: {e}")
    return _mock_industrial_zones()


def _mock_hotspots() -> List[Dict]:
    return [
        {"latitude": 28.8200, "longitude": 77.2200, "brightness": 340, "confidence": "high",    "acq_date": "2024-01-15", "frp": 14.5, "type": "fire_hotspot"},
        {"latitude": 28.5800, "longitude": 77.3000, "brightness": 315, "confidence": "nominal", "acq_date": "2024-01-15", "frp":  8.2, "type": "fire_hotspot"},
        {"latitude": 28.7500, "longitude": 76.9500, "brightness": 328, "confidence": "high",    "acq_date": "2024-01-14", "frp": 16.1, "type": "fire_hotspot"},
        {"latitude": 28.6300, "longitude": 77.4000, "brightness": 302, "confidence": "low",     "acq_date": "2024-01-14", "frp":  5.0, "type": "fire_hotspot"},
    ]


def _mock_industrial_zones() -> List[Dict]:
    return [
        {"id": 1, "latitude": 28.6734, "longitude": 77.1174, "name": "Mayapuri Industrial Area",    "type": "industrial"},
        {"id": 2, "latitude": 28.7041, "longitude": 77.1025, "name": "Mundka Industrial Estate",    "type": "industrial"},
        {"id": 3, "latitude": 28.6469, "longitude": 77.3164, "name": "Patparganj Industrial Area",  "type": "industrial"},
        {"id": 4, "latitude": 28.6304, "longitude": 77.4135, "name": "Okhla Industrial Area",       "type": "industrial"},
        {"id": 5, "latitude": 28.7207, "longitude": 77.1025, "name": "Nangloi Industrial Zone",     "type": "industrial"},
        {"id": 6, "latitude": 28.5947, "longitude": 77.1456, "name": "Dwarka Industrial Pocket",    "type": "industrial"},
    ]
