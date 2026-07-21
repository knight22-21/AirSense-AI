from fastapi import APIRouter, HTTPException
from datetime import datetime
from services.openaq import fetch_live_aqi
from services.llm import generate_citizen_advisory, _get_risk_level

router = APIRouter()


@router.get("/{city}")
async def get_city_advisory(city: str):
    if city.lower() != "delhi":
        raise HTTPException(status_code=404, detail="Only 'delhi' is supported in MVP")

    readings = await fetch_live_aqi()
    aqi_vals = [r["aqi"] for r in readings if r.get("aqi") is not None]
    avg_aqi = round(sum(aqi_vals) / len(aqi_vals), 1) if aqi_vals else 150.0

    advisory = await generate_citizen_advisory(avg_aqi, "Delhi")

    return {
        "city": "Delhi",
        "aqi_value": avg_aqi,
        "risk_level": advisory.get("risk_level", _get_risk_level(avg_aqi)),
        "advisory_en": advisory.get("advisory_en", ""),
        "advisory_hi": advisory.get("advisory_hi", ""),
        "vulnerable_groups": advisory.get("vulnerable_groups", []),
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
