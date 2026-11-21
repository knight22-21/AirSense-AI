import asyncio
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone

from config import get_city, city_of_station
from services.openaq import fetch_historical_aqi, fetch_stations
from services.weather import fetch_weather_forecast
from models.forecaster import forecaster, train_city
from db.supabase_client import save_forecasts

router = APIRouter()


def _city(city: str) -> str:
    try:
        return get_city(city)["id"]
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city}'")


@router.get("/metrics/{city}")
async def get_metrics(city: str):
    m = forecaster.metrics(_city(city))
    if not m:
        raise HTTPException(status_code=404, detail="Model not trained yet — POST /forecast/train/{city}")
    return {"city": city, **m}


@router.post("/train/{city}")
async def train_model(city: str, days: int = 90):
    if not 3 <= days <= 180:
        raise HTTPException(status_code=400, detail="days must be 3-180")
    result = await train_city(_city(city), days)
    if not result.get("trained"):
        raise HTTPException(status_code=400, detail=result.get("error", "training failed"))
    return result


@router.get("/{station_id}")
async def get_forecast(station_id: str, hours: int = 72, city: str = ""):
    if hours not in (24, 48, 72):
        raise HTTPException(status_code=400, detail="hours must be 24, 48, or 72")
    city_id = _city(city) if city else city_of_station(station_id)

    # 14 days of history + matching weather (also used for lazy first-time training)
    historical, weather = await asyncio.gather(
        fetch_historical_aqi(station_id, days=14, city=city_id),
        fetch_weather_forecast(city_id, hours=hours, past_days=14),
    )
    forecasts, model, model_metrics = await asyncio.to_thread(
        forecaster.predict, city_id, historical, weather, hours
    )

    stations = await fetch_stations(city_id)
    station_name = next((s["name"] for s in stations if s["id"] == station_id), station_id)
    asyncio.create_task(save_forecasts(station_id, city_id, model, forecasts))

    return {
        "station_id": station_id, "station_name": station_name, "city": city_id,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon_hours": hours, "forecasts": forecasts, "model": model,
        "data_source": historical[0].get("source", "mock") if historical else "mock",
        "metrics": model_metrics,
    }
