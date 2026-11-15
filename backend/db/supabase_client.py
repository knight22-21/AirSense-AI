import os
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
_client = None


def is_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"))


def get_client():
    global _client
    if _client is None:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        _client = create_client(url, key)
    return _client


# ------------------------------------------------------------------
# Sync helpers (supabase-py is blocking) — wrapped for async callers
# ------------------------------------------------------------------

def _upsert(table: str, rows: List[Dict], conflict: str) -> int:
    if not rows:
        return 0
    get_client().table(table).upsert(rows, on_conflict=conflict).execute()
    return len(rows)


def _insert(table: str, rows: List[Dict]) -> int:
    if not rows:
        return 0
    get_client().table(table).insert(rows).execute()
    return len(rows)


async def _safe(fn, *args, default=None):
    """Run a blocking DB call off-loop; DB problems never break the API."""
    if not is_configured():
        return default
    try:
        return await asyncio.to_thread(fn, *args)
    except Exception as e:
        logger.warning(f"Supabase call failed: {e}")
        return default


async def save_stations(city: str, stations: List[Dict]) -> int:
    rows = [{"id": s["id"], "name": s["name"], "city": city,
             "latitude": s["latitude"], "longitude": s["longitude"]} for s in stations]
    return await _safe(_upsert, "stations", rows, "id", default=0)


async def save_readings(city: str, readings: List[Dict]) -> int:
    rows = [{
        "station_id": r["station_id"], "city": city, "timestamp": r["timestamp"],
        "pm25": r.get("value") if r.get("parameter", "pm25") == "pm25" else None,
        "aqi": r.get("aqi"), "latitude": r.get("latitude"), "longitude": r.get("longitude"),
    } for r in readings if r.get("timestamp") and r.get("source") != "mock"]
    return await _safe(_upsert, "aqi_readings", rows, "station_id,timestamp", default=0)


async def save_weather(city: str, hourly: List[Dict]) -> int:
    rows = [{
        "city": city, "timestamp": w["timestamp"], "temperature": w.get("temperature"),
        "humidity": w.get("humidity"), "wind_speed": w.get("wind_speed"),
        "wind_direction": w.get("wind_direction"),
        "boundary_layer_height": w.get("boundary_layer_height"),
    } for w in hourly if w.get("timestamp")]
    return await _safe(_upsert, "weather_readings", rows, "city,timestamp", default=0)


async def save_forecasts(station_id: str, city: str, model: str, forecasts: List[Dict]) -> int:
    # Floor to the hour so repeated dashboard loads upsert rather than append forever.
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0).isoformat()
    rows = [{
        "station_id": station_id, "city": city, "generated_at": now,
        "target_time": f["timestamp"], "horizon_hours": i + 1, "aqi": f["aqi"],
        "pm25": f.get("pm25"), "confidence_lower": f.get("confidence_lower"),
        "confidence_upper": f.get("confidence_upper"), "model": model,
    } for i, f in enumerate(forecasts)]
    return await _safe(_upsert, "forecasts", rows, "station_id,generated_at,target_time", default=0)


async def save_alerts(city: str, readings: List[Dict], threshold: float = 300) -> int:
    rows = [{
        "city": city, "station_id": r["station_id"], "timestamp": r["timestamp"], "aqi": r["aqi"],
        "level": "Hazardous" if r["aqi"] > 400 else "Very Unhealthy",
        "message": f"AQI {r['aqi']:.0f} at {r.get('station_name') or r['station_id']}",
    } for r in readings if r.get("aqi") and r["aqi"] >= threshold
        and r.get("timestamp") and r.get("source") != "mock"]
    return await _safe(_upsert, "alerts", rows, "station_id,timestamp", default=0)


async def save_metrics(city: str, metrics: Dict) -> int:
    row = {"city": city, "rmse": metrics.get("rmse"),
           "persistence_rmse": metrics.get("persistence_rmse"), "samples": metrics.get("samples")}
    return await _safe(_insert, "model_metrics", [row], default=0)


def _load_history(station_id: str, days: int) -> List[Dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    res = (get_client().table("aqi_readings").select("timestamp,pm25,aqi")
           .eq("station_id", station_id).gte("timestamp", since)
           .order("timestamp", desc=False).limit(5000).execute())
    return [{"timestamp": r["timestamp"], "value": r["pm25"], "aqi": r["aqi"],
             "parameter": "pm25", "source": "db"} for r in (res.data or []) if r.get("aqi") is not None]


async def load_history(station_id: str, days: int = 7) -> Optional[List[Dict]]:
    return await _safe(_load_history, station_id, days, default=None)


# ------------------------------------------------------------------
# Retention
# ------------------------------------------------------------------

def _purge(days_readings: int, days_forecasts: int, days_alerts: int) -> int:
    client = get_client()
    now = datetime.now(timezone.utc)
    cut_readings = (now - timedelta(days=days_readings)).isoformat()
    cut_forecasts = (now - timedelta(days=days_forecasts)).isoformat()
    cut_alerts = (now - timedelta(days=days_alerts)).isoformat()
    client.table("aqi_readings").delete().lt("timestamp", cut_readings).execute()
    client.table("forecasts").delete().lt("generated_at", cut_forecasts).execute()
    client.table("alerts").delete().lt("timestamp", cut_alerts).execute()
    return 1


async def purge_old_data(days_readings: int = 30, days_forecasts: int = 7,
                         days_alerts: int = 30) -> int:
    """Delete stale rows so the Supabase free tier does not fill up."""
    return await _safe(_purge, days_readings, days_forecasts, days_alerts, default=0)
