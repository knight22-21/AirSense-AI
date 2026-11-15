"""APScheduler jobs: 30-minute polling, daily model refresh and retention.

Seed the DB with history:  python scheduler.py --seed --days 7
"""
import os
import sys
import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import CITIES

logger = logging.getLogger(__name__)

scheduler = None


async def _poll_city_aqi(city: str):
    from services.openaq import fetch_live_aqi, fetch_stations
    from utils.cache import _store
    from db.supabase_client import save_readings, save_alerts, save_stations

    _store.pop(f"live:{city}", None)  # force a fresh fetch
    stations = await fetch_stations(city)
    readings = await fetch_live_aqi(city)
    n = await save_readings(city, readings)
    await save_stations(city, stations)
    await save_alerts(city, readings)
    logger.info(f"[{city}] AQI poll: {len(readings)} readings, {n} stored")


async def _poll_aqi_data():
    for city in CITIES:
        try:
            await _poll_city_aqi(city)
        except Exception as e:
            logger.error(f"AQI poll failed for {city}: {e}")


async def _poll_weather_data():
    from services.weather import fetch_weather_forecast
    from utils.cache import _store
    from db.supabase_client import save_weather

    for city in CITIES:
        try:
            _store.pop(f"weather:{city}:0:3", None)
            rows = await fetch_weather_forecast(city, hours=72)
            await save_weather(city, rows)
            logger.info(f"[{city}] weather refreshed ({len(rows)} hourly rows)")
        except Exception as e:
            logger.error(f"Weather poll failed for {city}: {e}")


async def _retrain_models(days: int = 90):
    """Refresh one XGBoost model per city; failures are isolated per city."""
    from models.forecaster import train_city

    for city in CITIES:
        try:
            result = await train_city(city, days)
            if result.get("trained"):
                logger.info(f"[{city}] retrained: RMSE {result.get('rmse')} vs "
                            f"persistence {result.get('persistence_rmse')}")
            else:
                logger.warning(f"[{city}] retrain skipped: {result.get('error')}")
        except Exception as e:
            logger.error(f"Retrain failed for {city}: {e}")


async def _purge_old_data():
    from db.supabase_client import purge_old_data

    try:
        await purge_old_data()
        logger.info("Retention purge complete")
    except Exception as e:
        logger.error(f"Retention purge failed: {e}")


async def seed(days: int = 7):
    """Backfill history for every station into Supabase and data/training_data/*.csv."""
    import csv
    from services.openaq import fetch_stations, fetch_historical_aqi
    from db.supabase_client import save_readings, is_configured

    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "data", "training_data")
    os.makedirs(out_dir, exist_ok=True)

    for city in CITIES:
        rows = []
        for s in (await fetch_stations(city))[:12]:
            hist = await fetch_historical_aqi(s["id"], days, city)
            rows += [{**h, "station_id": s["id"], "latitude": s["latitude"],
                      "longitude": s["longitude"]} for h in hist]
        if is_configured():
            await save_readings(city, rows)

        path = os.path.join(out_dir, f"{city}_aqi.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["station_id", "timestamp", "value", "aqi", "source"],
                               extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        logger.info(f"[{city}] seeded {len(rows)} rows -> {path}")

    await _poll_weather_data()


def start_scheduler():
    global scheduler
    scheduler = AsyncIOScheduler()  # fresh instance per app startup (bound to the running loop)
    scheduler.add_job(_poll_aqi_data, "interval", minutes=30, id="aqi_poll")
    scheduler.add_job(_poll_weather_data, "interval", minutes=30, id="weather_poll")
    scheduler.add_job(_retrain_models, "cron", hour=3, minute=0, id="model_retrain")
    scheduler.add_job(_purge_old_data, "interval", hours=6, id="retention")
    scheduler.start()
    logger.info("Scheduler started — AQI/weather every 30 min, retrain daily, retention every 6 h")


def stop_scheduler():
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", action="store_true")
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()
    if args.seed:
        asyncio.run(seed(args.days))
        asyncio.run(_poll_aqi_data())
    else:
        ap.print_help()
