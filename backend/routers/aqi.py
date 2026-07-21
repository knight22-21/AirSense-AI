from fastapi import APIRouter, HTTPException
from datetime import datetime
from services.openaq import fetch_delhi_stations, fetch_live_aqi, fetch_historical_aqi

router = APIRouter()


@router.get("/stations")
async def get_stations():
    stations = await fetch_delhi_stations()
    return {"stations": stations, "count": len(stations)}


@router.get("/live")
async def get_live_aqi():
    readings = await fetch_live_aqi()
    return {
        "readings": readings,
        "count": len(readings),
        "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@router.get("/city/{city}")
async def get_city_aqi(city: str):
    if city.lower() != "delhi":
        raise HTTPException(status_code=404, detail="Only 'delhi' is supported in MVP")
    readings = await fetch_live_aqi()
    if not readings:
        raise HTTPException(status_code=503, detail="AQI data unavailable")
    aqi_values = [r["aqi"] for r in readings if r.get("aqi") is not None]
    avg = round(sum(aqi_values) / len(aqi_values), 1) if aqi_values else 0.0
    return {
        "city": "Delhi",
        "average_aqi": avg,
        "station_count": len(readings),
        "stations": readings,
        "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


@router.get("/history/{station_id}")
async def get_history(station_id: str, days: int = 7):
    if days > 30:
        raise HTTPException(status_code=400, detail="Maximum 30 days")
    history = await fetch_historical_aqi(station_id, days)
    return {"station_id": station_id, "days": days, "readings": history, "count": len(history)}
