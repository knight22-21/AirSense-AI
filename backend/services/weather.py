import httpx
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)
OPEN_METEO_BASE = "https://api.open-meteo.com/v1"

DELHI_LAT = 28.6139
DELHI_LON = 77.2090


async def fetch_current_weather() -> Dict:
    """Fetch 3-day hourly weather for Delhi from Open-Meteo (no key required)."""
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.get(
                f"{OPEN_METEO_BASE}/forecast",
                params={
                    "latitude": DELHI_LAT,
                    "longitude": DELHI_LON,
                    "current": "temperature_2m,relative_humidity_2m,windspeed_10m,winddirection_10m,precipitation",
                    "hourly": "temperature_2m,relative_humidity_2m,windspeed_10m,winddirection_10m,boundary_layer_height",
                    "forecast_days": 3,
                    "timezone": "Asia/Kolkata",
                },
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning(f"Open-Meteo fetch failed: {e}")
    return _mock_weather()


async def fetch_weather_forecast(hours: int = 72) -> List[Dict]:
    """Return hourly weather feature list for the forecast engine."""
    data = await fetch_current_weather()
    hourly = data.get("hourly", {})
    times   = hourly.get("time", [])
    temps   = hourly.get("temperature_2m", [])
    humid   = hourly.get("relative_humidity_2m", [])
    wspeed  = hourly.get("windspeed_10m", [])
    wdir    = hourly.get("winddirection_10m", [])
    blh     = hourly.get("boundary_layer_height", [])

    result = []
    for i in range(min(hours, len(times))):
        result.append({
            "timestamp": times[i] if i < len(times) else "",
            "temperature": temps[i] if i < len(temps) else 30.0,
            "humidity": humid[i] if i < len(humid) else 50.0,
            "wind_speed": wspeed[i] if i < len(wspeed) else 5.0,
            "wind_direction": wdir[i] if i < len(wdir) else 180.0,
            "boundary_layer_height": blh[i] if i < len(blh) else 1000.0,
        })
    return result


def _mock_weather() -> Dict:
    return {
        "current": {
            "temperature_2m": 33.0,
            "relative_humidity_2m": 42,
            "windspeed_10m": 7.5,
            "winddirection_10m": 200,
            "precipitation": 0.0,
        },
        "hourly": {
            "time": [f"2024-01-{(i // 24) + 1:02d}T{i % 24:02d}:00" for i in range(72)],
            "temperature_2m": [28 + (i % 24) * 0.3 for i in range(72)],
            "relative_humidity_2m": [55 - (i % 24) * 0.5 for i in range(72)],
            "windspeed_10m": [4 + (i % 12) * 0.4 for i in range(72)],
            "winddirection_10m": [180 + i % 45 for i in range(72)],
            "boundary_layer_height": [600 + (i % 24) * 30 for i in range(72)],
        },
    }
