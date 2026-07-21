from fastapi import APIRouter, HTTPException
from datetime import datetime
from services.openaq import fetch_historical_aqi, fetch_delhi_stations
from services.weather import fetch_weather_forecast
from models.forecaster import forecaster

router = APIRouter()


@router.get("/{station_id}")
async def get_forecast(station_id: str, hours: int = 72):
    if hours not in (24, 48, 72):
        raise HTTPException(status_code=400, detail="hours must be 24, 48, or 72")

    historical = await fetch_historical_aqi(station_id, days=7)
    weather = await fetch_weather_forecast(hours=hours)
    forecasts = forecaster.predict(historical, weather, hours=hours)

    stations = await fetch_delhi_stations()
    station_name = next((s["name"] for s in stations if s["id"] == station_id), station_id)

    return {
        "station_id": station_id,
        "station_name": station_name,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon_hours": hours,
        "forecasts": forecasts,
    }


@router.post("/train/{station_id}")
async def train_model(station_id: str):
    historical = await fetch_historical_aqi(station_id, days=30)
    if len(historical) < 48:
        raise HTTPException(status_code=400, detail="Insufficient data for training (need ≥ 48 points)")
    result = forecaster.train(historical)
    return result
