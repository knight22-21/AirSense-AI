import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def _poll_aqi_data():
    """Fetch live AQI and persist to Supabase."""
    try:
        from services.openaq import fetch_live_aqi
        data = await fetch_live_aqi()
        logger.info(f"AQI poll: {len(data)} readings fetched")

        try:
            from db.supabase_client import get_client
            client = get_client()
            for r in data:
                client.table("aqi_readings").upsert({
                    "station_id": r.get("station_id"),
                    "timestamp": r.get("timestamp"),
                    "pm25": r.get("value") if r.get("parameter") == "pm25" else None,
                    "aqi": r.get("aqi"),
                    "latitude": r.get("latitude"),
                    "longitude": r.get("longitude"),
                }).execute()
        except Exception as db_err:
            logger.warning(f"Supabase write skipped: {db_err}")

    except Exception as e:
        logger.error(f"AQI poll failed: {e}")


async def _poll_weather_data():
    """Fetch weather and log."""
    try:
        from services.weather import fetch_current_weather
        await fetch_current_weather()
        logger.info("Weather data refreshed")
    except Exception as e:
        logger.error(f"Weather poll failed: {e}")


def start_scheduler():
    """Register and start APScheduler jobs."""
    scheduler.add_job(
        _poll_aqi_data, "interval", minutes=30, id="aqi_poll", replace_existing=True
    )
    scheduler.add_job(
        _poll_weather_data, "interval", minutes=30, id="weather_poll", replace_existing=True
    )
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started — polling every 30 minutes")
