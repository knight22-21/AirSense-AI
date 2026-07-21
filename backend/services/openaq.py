import httpx
import logging
from datetime import datetime, timedelta
from typing import List, Dict

logger = logging.getLogger(__name__)
OPENAQ_BASE = "https://api.openaq.org/v3"

# Hardcoded Delhi CAAQMS stations as authoritative fallback
_DELHI_STATIONS = [
    {"id": "anand-vihar",   "name": "Anand Vihar",       "city": "Delhi", "latitude": 28.6469, "longitude": 77.3164},
    {"id": "rk-puram",      "name": "RK Puram",           "city": "Delhi", "latitude": 28.5640, "longitude": 77.1742},
    {"id": "punjabi-bagh",  "name": "Punjabi Bagh",       "city": "Delhi", "latitude": 28.6667, "longitude": 77.1167},
    {"id": "mandir-marg",   "name": "Mandir Marg",        "city": "Delhi", "latitude": 28.6363, "longitude": 77.2008},
    {"id": "igi-airport",   "name": "IGI Airport T3",     "city": "Delhi", "latitude": 28.5665, "longitude": 77.1031},
    {"id": "shadipur",      "name": "Shadipur",           "city": "Delhi", "latitude": 28.6518, "longitude": 77.1427},
    {"id": "okhla-phase2",  "name": "Okhla Phase-II",     "city": "Delhi", "latitude": 28.5355, "longitude": 77.2710},
    {"id": "rohini",        "name": "Rohini",             "city": "Delhi", "latitude": 28.7494, "longitude": 77.0647},
]


async def fetch_delhi_stations() -> List[Dict]:
    """Return Delhi AQI stations. Tries OpenAQ v3, falls back to static list."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{OPENAQ_BASE}/locations",
                params={"city": "Delhi", "country_id": "IN", "limit": 25},
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                if results:
                    stations = []
                    for loc in results:
                        coords = loc.get("coordinates") or {}
                        stations.append({
                            "id": str(loc.get("id", "")),
                            "name": loc.get("name", "Unknown"),
                            "city": "Delhi",
                            "latitude": coords.get("latitude", 28.6139),
                            "longitude": coords.get("longitude", 77.2090),
                        })
                    return stations
        except Exception as e:
            logger.warning(f"OpenAQ stations fetch failed: {e}")
    return _DELHI_STATIONS


async def fetch_live_aqi() -> List[Dict]:
    """Fetch latest PM2.5 readings for Delhi. Falls back to seeded mock data."""
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{OPENAQ_BASE}/measurements",
                params={
                    "country_id": "IN",
                    "city": "Delhi",
                    "parameter": "pm25",
                    "limit": 30,
                    "sort": "desc",
                    "order_by": "datetime",
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                items = resp.json().get("results", [])
                if items:
                    return [_shape_measurement(m) for m in items]
        except Exception as e:
            logger.warning(f"OpenAQ live fetch failed: {e}")
    return _mock_live_aqi()


async def fetch_historical_aqi(station_id: str, days: int = 7) -> List[Dict]:
    """Fetch historical PM2.5 for a station."""
    date_from = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.get(
                f"{OPENAQ_BASE}/measurements",
                params={
                    "location_id": station_id,
                    "parameter": "pm25",
                    "limit": 500,
                    "sort": "desc",
                    "date_from": date_from,
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                items = resp.json().get("results", [])
                if items:
                    return [
                        {
                            "timestamp": m.get("date", {}).get("utc", ""),
                            "value": m.get("value", 0),
                            "aqi": _pm25_to_aqi(m.get("value", 0)),
                            "parameter": "pm25",
                        }
                        for m in items
                    ]
        except Exception as e:
            logger.warning(f"OpenAQ history fetch failed: {e}")
    return _mock_historical_aqi()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _shape_measurement(m: Dict) -> Dict:
    coords = m.get("coordinates") or {}
    val = m.get("value", 0)
    return {
        "station_id": str(m.get("locationId", "")),
        "station_name": m.get("location", ""),
        "parameter": m.get("parameter", "pm25"),
        "value": val,
        "unit": m.get("unit", "µg/m³"),
        "timestamp": (m.get("date") or {}).get("utc", ""),
        "latitude": coords.get("latitude", 28.6139),
        "longitude": coords.get("longitude", 77.2090),
        "aqi": _pm25_to_aqi(val),
    }


def _pm25_to_aqi(pm25: float) -> float:
    """US EPA linear interpolation formula for PM2.5 → AQI."""
    breakpoints = [
        (0.0,   12.0,   0,   50),
        (12.1,  35.4,  51,  100),
        (35.5,  55.4, 101,  150),
        (55.5, 150.4, 151,  200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= pm25 <= c_hi:
            return round((i_hi - i_lo) / (c_hi - c_lo) * (pm25 - c_lo) + i_lo, 1)
    return 500.0 if pm25 > 500 else 0.0


def _mock_live_aqi() -> List[Dict]:
    import random
    rng = random.Random(42)
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    results = []
    for s in _DELHI_STATIONS:
        pm25 = rng.uniform(60, 280)
        results.append({
            "station_id": s["id"],
            "station_name": s["name"],
            "parameter": "pm25",
            "value": round(pm25, 1),
            "unit": "µg/m³",
            "timestamp": now,
            "latitude": s["latitude"],
            "longitude": s["longitude"],
            "aqi": _pm25_to_aqi(pm25),
        })
    return results


def _mock_historical_aqi() -> List[Dict]:
    import random
    rng = random.Random(7)
    readings = []
    for i in range(168):
        ts = datetime.utcnow() - timedelta(hours=i)
        pm25 = rng.uniform(50, 300)
        readings.append({
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "value": round(pm25, 1),
            "aqi": _pm25_to_aqi(pm25),
            "parameter": "pm25",
        })
    return readings
