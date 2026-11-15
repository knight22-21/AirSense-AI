"""OpenAQ v3 client. v3 requires an API key (free): set OPENAQ_API_KEY.

Flow: /locations (near city centre, PM2.5 sensors) -> /locations/{id}/latest for live values
-> /sensors/{id}/hours for hourly history. Every step falls back (DB, then seeded mock data).
"""
import os
import asyncio
import math
import random
import logging
import httpx
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

from config import get_city, city_of_station
from utils.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
OPENAQ_BASE = "https://api.openaq.org/v3"
PM25_PARAMETER_ID = 2
MAX_LIVE_STATIONS = 12

# station_id -> pm25 sensor id (filled by fetch_stations)
_SENSORS: Dict[str, int] = {}


def _headers() -> Dict[str, str]:
    h = {"Accept": "application/json"}
    key = os.getenv("OPENAQ_API_KEY", "")
    if key:
        h["X-API-Key"] = key
    return h


def _has_key() -> bool:
    return bool(os.getenv("OPENAQ_API_KEY"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ------------------------------------------------------------------
# Stations
# ------------------------------------------------------------------

async def fetch_stations(city: str = "delhi") -> List[Dict]:
    cfg = get_city(city)
    cached = cache_get(f"stations:{cfg['id']}", 3600)
    if cached:
        return cached
    if _has_key():
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    f"{OPENAQ_BASE}/locations",
                    params={"coordinates": f"{cfg['lat']},{cfg['lon']}", "radius": cfg["radius_m"],
                            "parameters_id": PM25_PARAMETER_ID, "limit": 100},
                    headers=_headers(),
                )
            if resp.status_code == 200:
                stations = []
                for loc in resp.json().get("results", []):
                    coords = loc.get("coordinates") or {}
                    sensor = next((s for s in loc.get("sensors", [])
                                   if (s.get("parameter") or {}).get("id") == PM25_PARAMETER_ID), None)
                    if not sensor or coords.get("latitude") is None:
                        continue
                    sid = str(loc["id"])
                    _SENSORS[sid] = sensor["id"]
                    stations.append({"id": sid, "name": loc.get("name") or f"Station {sid}",
                                     "city": cfg["name"], "latitude": coords["latitude"],
                                     "longitude": coords["longitude"], "source": "openaq"})
                if stations:
                    from db.supabase_client import save_stations
                    asyncio.create_task(save_stations(cfg["id"], stations))
                    return cache_set(f"stations:{cfg['id']}", stations)
            else:
                logger.warning(f"OpenAQ locations HTTP {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            logger.warning(f"OpenAQ stations fetch failed: {e}")
    return [{**s, "city": cfg["name"], "source": "mock"} for s in cfg["stations"]]


# kept for backwards compatibility with older callers
async def fetch_delhi_stations() -> List[Dict]:
    return await fetch_stations("delhi")


# ------------------------------------------------------------------
# Live
# ------------------------------------------------------------------

async def _latest_for(client: httpx.AsyncClient, station: Dict) -> Optional[Dict]:
    sid = station["id"]
    sensor_id = _SENSORS.get(sid)
    try:
        resp = await client.get(f"{OPENAQ_BASE}/locations/{sid}/latest", headers=_headers())
        if resp.status_code != 200:
            return None
        for item in resp.json().get("results", []):
            if sensor_id is not None and item.get("sensorsId") != sensor_id:
                continue
            val = item.get("value")
            if val is None or val < 0:
                continue
            coords = item.get("coordinates") or {}
            return {
                "station_id": sid, "station_name": station["name"], "parameter": "pm25",
                "value": val, "unit": "µg/m³",
                "timestamp": (item.get("datetime") or {}).get("utc", _now_iso()),
                "latitude": coords.get("latitude", station["latitude"]),
                "longitude": coords.get("longitude", station["longitude"]),
                "aqi": _pm25_to_aqi(val), "source": "openaq",
            }
    except Exception as e:
        logger.warning(f"OpenAQ latest failed for {sid}: {e}")
    return None


async def fetch_live_aqi(city: str = "delhi") -> List[Dict]:
    cfg = get_city(city)
    cached = cache_get(f"live:{cfg['id']}", 120)
    if cached:
        return cached
    if _has_key():
        stations = [s for s in await fetch_stations(city) if s.get("source") == "openaq"][:MAX_LIVE_STATIONS]
        if stations:
            async with httpx.AsyncClient(timeout=20) as client:
                results = await asyncio.gather(*[_latest_for(client, s) for s in stations])
            readings = [r for r in results if r]
            if readings:
                return cache_set(f"live:{cfg['id']}", readings)
    return _mock_live_aqi(cfg["id"])


# ------------------------------------------------------------------
# History
# ------------------------------------------------------------------

async def _openaq_history(station_id: str, days: int) -> List[Dict]:
    sensor_id = _SENSORS.get(station_id)
    if sensor_id is None:
        return []
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    out: List[Dict] = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for page in range(1, 6):  # up to 5000 hourly points (~200 days)
                resp = await client.get(
                    f"{OPENAQ_BASE}/sensors/{sensor_id}/hours",
                    params={"datetime_from": date_from, "limit": 1000, "page": page},
                    headers=_headers(),
                )
                if resp.status_code != 200:
                    break
                items = resp.json().get("results", [])
                for m in items:
                    v = m.get("value")
                    ts = ((m.get("period") or {}).get("datetimeFrom") or {}).get("utc")
                    if v is None or v < 0 or not ts:
                        continue
                    out.append({"timestamp": ts, "value": v, "aqi": _pm25_to_aqi(v),
                                "parameter": "pm25", "source": "openaq"})
                if len(items) < 1000:
                    break
    except Exception as e:
        logger.warning(f"OpenAQ history failed: {e}")
    return sorted(out, key=lambda r: r["timestamp"])


async def fetch_historical_aqi(station_id: str, days: int = 7, city: Optional[str] = None) -> List[Dict]:
    """OpenAQ -> Supabase -> seeded mock. Always returned oldest-first."""
    city = city or city_of_station(station_id)
    if _has_key():
        if station_id not in _SENSORS:
            await fetch_stations(city)
        data = await _openaq_history(station_id, days)
        if len(data) >= 24:
            return data
    from db.supabase_client import load_history
    stored = await load_history(station_id, days)
    if stored and len(stored) >= 24:
        return stored
    return _mock_historical_aqi(station_id, city, days)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _pm25_to_aqi(pm25: float) -> float:
    """US EPA linear interpolation formula for PM2.5 -> AQI."""
    pm25 = math.floor(pm25 * 10) / 10  # EPA truncates to 0.1
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


def _mock_pm25(rng: random.Random, base: float, ts: datetime, phase: float) -> float:
    """Diurnal curve (morning/evening peaks) + multi-day drift + noise."""
    h = ts.hour + ts.minute / 60
    diurnal = 1 + 0.25 * math.cos(2 * math.pi * (h - 9) / 24) + 0.15 * math.cos(2 * math.pi * (h - 20) / 12)
    drift = 1 + 0.2 * math.sin(2 * math.pi * (ts.timestamp() / 86400) / 4 + phase)
    return max(5.0, base * diurnal * drift * rng.uniform(0.92, 1.08))


def _mock_live_aqi(city: str) -> List[Dict]:
    cfg = get_city(city)
    now = datetime.now(timezone.utc)
    results = []
    for i, s in enumerate(cfg["stations"]):
        rng = random.Random(f"{s['id']}{now:%Y%m%d%H}")
        pm25 = _mock_pm25(rng, cfg["mock_base_pm25"] * (0.85 + 0.06 * i), now, i)
        results.append({
            "station_id": s["id"], "station_name": s["name"], "parameter": "pm25",
            "value": round(pm25, 1), "unit": "µg/m³", "timestamp": _now_iso(),
            "latitude": s["latitude"], "longitude": s["longitude"],
            "aqi": _pm25_to_aqi(pm25), "source": "mock",
        })
    return results


def _mock_historical_aqi(station_id: str, city: str, days: int) -> List[Dict]:
    cfg = get_city(city)
    idx = next((i for i, s in enumerate(cfg["stations"]) if s["id"] == station_id), 0)
    base = cfg["mock_base_pm25"] * (0.85 + 0.06 * idx)
    rng = random.Random(station_id)
    end = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    readings = []
    for i in range(days * 24, -1, -1):
        ts = end - timedelta(hours=i)
        pm25 = _mock_pm25(rng, base, ts, idx)
        readings.append({"timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"), "value": round(pm25, 1),
                         "aqi": _pm25_to_aqi(pm25), "parameter": "pm25", "source": "mock"})
    return readings
