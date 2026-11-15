import os
import httpx
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict

from config import get_city
from utils.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

NASA_FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_HEADERS = {"User-Agent": "AirSenseAI/1.1 (hackathon project)", "Accept": "application/json"}
_CONF = {"h": "high", "n": "nominal", "l": "low", "high": "high", "nominal": "nominal", "low": "low"}


# ------------------------------------------------------------------
# NASA FIRMS
# ------------------------------------------------------------------

async def fetch_fire_hotspots(city: str = "delhi", days: int = 5) -> List[Dict]:
    """VIIRS fire detections from NASA FIRMS (API caps the window at 5 days)."""
    cfg = get_city(city)
    key = os.getenv("NASA_FIRMS_MAP_KEY", "")  # read at call time, after load_dotenv
    cached = cache_get(f"fires:{cfg['id']}", 3600)
    if cached is not None:
        return cached
    if key:
        w, s, e, n = cfg["bbox"]
        url = f"{NASA_FIRMS_BASE}/{key}/VIIRS_SNPP_NRT/{w},{s},{e},{n}/{min(days, 5)}"
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                resp = await client.get(url)
            if resp.status_code == 200 and resp.text.lstrip().startswith("latitude"):
                return cache_set(f"fires:{cfg['id']}", _parse_firms_csv(resp.text))
            logger.warning(f"FIRMS HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            logger.warning(f"NASA FIRMS fetch failed: {e}")
    return _mock_hotspots(cfg["id"])


def _parse_firms_csv(text: str) -> List[Dict]:
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if len(lines) < 2:
        return []  # a valid empty response = no fires detected
    headers = [h.strip() for h in lines[0].split(",")]
    hotspots = []
    for line in lines[1:]:
        vals = [v.strip() for v in line.split(",")]
        if len(vals) < len(headers):
            continue
        row = dict(zip(headers, vals))
        try:
            hotspots.append({
                "latitude": float(row["latitude"]), "longitude": float(row["longitude"]),
                "brightness": float(row.get("bright_ti4", row.get("brightness", 300))),
                "confidence": _CONF.get(row.get("confidence", "n").lower(), "nominal"),  # VIIRS uses l/n/h
                "acq_date": row.get("acq_date", ""), "frp": float(row.get("frp", 0)),
                "type": "fire_hotspot", "source": "firms",
            })
        except (ValueError, KeyError):
            continue
    return hotspots


# ------------------------------------------------------------------
# OSM Overpass — one query per city, cached 24h
# ------------------------------------------------------------------

_LAYERS = {
    "industrial":   'way["landuse"="industrial"]',
    "construction": 'way["landuse"="construction"]',
    "dump":         'way["landuse"="landfill"]',
    "dump_node":    'node["amenity"="waste_transfer_station"]',
    "highway":      'way["highway"~"^(motorway|trunk)$"]',
    "school":       'nwr["amenity"="school"]',
    "hospital":     'nwr["amenity"="hospital"]',
}
_HW_SAMPLE_LIMIT = 400


def _build_query(bbox) -> str:
    w, s, e, n = bbox
    box = f"({s},{w},{n},{e})"
    parts = "".join(f"{sel}{box};" for sel in _LAYERS.values())
    return f"[out:json][timeout:60];({parts});out center tags 4000;"


def _classify(tags: Dict) -> str:
    if tags.get("landuse") == "industrial":   return "industrial"
    if tags.get("landuse") == "construction": return "construction"
    if tags.get("landuse") == "landfill" or tags.get("amenity") == "waste_transfer_station": return "dump"
    if tags.get("highway"):                   return "highway"
    if tags.get("amenity") == "school":       return "school"
    if tags.get("amenity") == "hospital":     return "hospital"
    return ""


async def fetch_osm_layers(city: str = "delhi") -> Dict[str, List[Dict]]:
    """Return {industrial, construction, dump, highway, school, hospital: [features]}."""
    cfg = get_city(city)
    cached = cache_get(f"osm:{cfg['id']}", 86400)
    if cached:
        return cached
    layers: Dict[str, List[Dict]] = {k: [] for k in ("industrial", "construction", "dump", "highway", "school", "hospital")}
    try:
        async with httpx.AsyncClient(timeout=70) as client:
            resp = await client.post(OVERPASS_URL, headers=OVERPASS_HEADERS, data={"data": _build_query(cfg["bbox"])})
        if resp.status_code == 200:
            for el in resp.json().get("elements", []):
                tags = el.get("tags", {})
                kind = _classify(tags)
                c = el.get("center") or ({"lat": el.get("lat"), "lon": el.get("lon")} if "lat" in el else None)
                if not kind or not c or c.get("lat") is None:
                    continue
                layers[kind].append({"id": el.get("id"), "latitude": c["lat"], "longitude": c["lon"],
                                     "name": tags.get("name") or tags.get("ref") or kind.title(), "type": kind})
            layers["highway"] = layers["highway"][:_HW_SAMPLE_LIMIT]
            if any(layers[k] for k in ("industrial", "construction", "dump", "highway")):
                return cache_set(f"osm:{cfg['id']}", layers)
        else:
            logger.warning(f"Overpass HTTP {resp.status_code}")
    except Exception as e:
        logger.warning(f"OSM Overpass fetch failed: {e}")
    return _mock_osm_layers(cfg["id"])


async def fetch_industrial_zones(city: str = "delhi") -> List[Dict]:
    return (await fetch_osm_layers(city))["industrial"]


# ------------------------------------------------------------------
# Mock fallbacks (Delhi has hand-picked ones; other cities get none -> 'undetermined')
# ------------------------------------------------------------------

def _mock_hotspots(city: str) -> List[Dict]:
    if city != "delhi":
        return []
    d = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    base = {"type": "fire_hotspot", "acq_date": d, "source": "mock"}
    return [
        {**base, "latitude": 28.8200, "longitude": 77.2200, "brightness": 340, "confidence": "high",    "frp": 14.5},
        {**base, "latitude": 28.5800, "longitude": 77.3000, "brightness": 315, "confidence": "nominal", "frp": 8.2},
        {**base, "latitude": 28.7500, "longitude": 76.9500, "brightness": 328, "confidence": "high",    "frp": 16.1},
        {**base, "latitude": 28.6300, "longitude": 77.4000, "brightness": 302, "confidence": "low",     "frp": 5.0},
    ]


def _mock_osm_layers(city: str) -> Dict[str, List[Dict]]:
    layers: Dict[str, List[Dict]] = {k: [] for k in ("industrial", "construction", "dump", "highway", "school", "hospital")}
    if city != "delhi":
        return layers
    def f(i, lat, lon, name, t): return {"id": i, "latitude": lat, "longitude": lon, "name": name, "type": t, "mock": True}
    layers["industrial"] = [
        f(1, 28.6734, 77.1174, "Mayapuri Industrial Area", "industrial"),
        f(2, 28.7041, 77.1025, "Mundka Industrial Estate", "industrial"),
        f(3, 28.6469, 77.3164, "Patparganj Industrial Area", "industrial"),
        f(4, 28.5355, 77.2710, "Okhla Industrial Area", "industrial"),
        f(5, 28.7207, 77.1025, "Nangloi Industrial Zone", "industrial"),
        f(6, 28.5947, 77.1456, "Dwarka Industrial Pocket", "industrial"),
    ]
    layers["construction"] = [f(11, 28.5665, 77.1500, "Aerocity construction", "construction"),
                              f(12, 28.6200, 77.2800, "Yamuna riverfront works", "construction")]
    layers["dump"] = [f(21, 28.6900, 77.3300, "Ghazipur landfill (approx)", "dump"),
                      f(22, 28.7400, 77.1700, "Bhalswa landfill", "dump")]
    layers["highway"] = [f(31, 28.6469, 77.3100, "NH-24 / Anand Vihar", "highway"),
                         f(32, 28.6667, 77.1200, "Ring Road / Punjabi Bagh", "highway"),
                         f(33, 28.5640, 77.1800, "Outer Ring Road / RK Puram", "highway")]
    layers["school"] = [f(41, 28.6450, 77.3150, "School", "school"), f(42, 28.5650, 77.1750, "School", "school")]
    layers["hospital"] = [f(51, 28.6360, 77.2000, "Hospital", "hospital")]
    return layers
