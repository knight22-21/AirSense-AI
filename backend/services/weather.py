import httpx
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from config import get_city
from utils.cache import cache_get, cache_set

logger = logging.getLogger(__name__)
OPEN_METEO_BASE = "https://api.open-meteo.com/v1"
HOURLY = "temperature_2m,relative_humidity_2m,windspeed_10m,winddirection_10m,boundary_layer_height"


async def fetch_current_weather(city: str = "delhi", past_days: int = 0, forecast_days: int = 3) -> Dict:
    """Raw Open-Meteo payload (UTC timestamps, no key required). past_days max is 92."""
    cfg = get_city(city)
    key = f"weather:{cfg['id']}:{past_days}:{forecast_days}"
    cached = cache_get(key, 900)
    if cached:
        return cached
    async with httpx.AsyncClient(timeout=25) as client:
        try:
            resp = await client.get(
                f"{OPEN_METEO_BASE}/forecast",
                params={
                    "latitude": cfg["lat"], "longitude": cfg["lon"],
                    "current": "temperature_2m,relative_humidity_2m,windspeed_10m,winddirection_10m,precipitation",
                    "hourly": HOURLY, "past_days": min(past_days, 92),
                    "forecast_days": forecast_days, "timezone": "UTC",
                },
            )
            if resp.status_code == 200:
                return cache_set(key, resp.json())
        except Exception as e:
            logger.warning(f"Open-Meteo fetch failed: {e}")
    return _mock_weather(past_days, forecast_days)


async def fetch_weather_forecast(city: str = "delhi", hours: int = 72,
                                 past_days: int = 0) -> List[Dict]:
    """Hourly weather feature rows. With past_days>0 the list starts in the past
    (used for training/lazy-training); otherwise it starts at the current hour."""
    data = await fetch_current_weather(city, past_days=past_days, forecast_days=max(1, (hours + 23) // 24 + 1))
    rows = _hourly_rows(data.get("hourly", {}))
    if past_days == 0:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
        rows = [r for r in rows if r["timestamp"][:16] >= now] or rows
        rows = rows[:hours]
    return rows


def _hourly_rows(hourly: Dict) -> List[Dict]:
    times = hourly.get("time", [])

    def col(name, default):
        vals = hourly.get(name, [])
        return [vals[i] if i < len(vals) and vals[i] is not None else default for i in range(len(times))]

    t, h, ws, wd, blh = (col("temperature_2m", 30.0), col("relative_humidity_2m", 50.0),
                         col("windspeed_10m", 5.0), col("winddirection_10m", 180.0),
                         col("boundary_layer_height", 1000.0))
    return [{
        "timestamp": times[i] + ":00Z",  # Open-Meteo returns "YYYY-MM-DDTHH:MM" in UTC
        "temperature": t[i], "humidity": h[i], "wind_speed": ws[i],
        "wind_direction": wd[i], "boundary_layer_height": blh[i],
    } for i in range(len(times))]


async def fetch_wind_direction(city: str = "delhi") -> float:
    data = await fetch_current_weather(city)
    return float((data.get("current") or {}).get("winddirection_10m", 270.0))


def _mock_weather(past_days: int = 0, forecast_days: int = 3) -> Dict:
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(days=past_days)
    n = (past_days + forecast_days) * 24
    ts = [start + timedelta(hours=i) for i in range(n)]
    return {
        "current": {"temperature_2m": 33.0, "relative_humidity_2m": 42, "windspeed_10m": 7.5,
                    "winddirection_10m": 290, "precipitation": 0.0},
        "hourly": {
            "time": [t.strftime("%Y-%m-%dT%H:%M") for t in ts],
            "temperature_2m": [28 + 6 * max(0, 1 - abs(t.hour - 14) / 8) for t in ts],
            "relative_humidity_2m": [70 - 30 * max(0, 1 - abs(t.hour - 14) / 8) for t in ts],
            "windspeed_10m": [4 + 3 * max(0, 1 - abs(t.hour - 15) / 7) for t in ts],
            "winddirection_10m": [280 + (i % 40) for i in range(n)],
            "boundary_layer_height": [300 + 1200 * max(0, 1 - abs(t.hour - 14) / 8) for t in ts],
        },
    }
