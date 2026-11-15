import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException

from config import get_city
from services.attribution import compute_enforcement_hotspots
from services.llm import generate_enforcement_summary
from services.openaq import fetch_live_aqi

router = APIRouter()
SOURCE_TYPES = {"traffic", "construction", "industry", "waste_burning", "undetermined"}


@router.get("/{city}")
async def get_enforcement_hotspots(city: str, limit: int = 3, source_type: Optional[str] = None):
    try:
        cfg = get_city(city)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city}'")
    if not 1 <= limit <= 10:
        raise HTTPException(status_code=400, detail="limit must be 1-10")
    if source_type and source_type not in SOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"source_type must be one of {sorted(SOURCE_TYPES)}")

    result = await compute_enforcement_hotspots(cfg["id"], limit, source_type)
    hotspots = result["hotspots"]
    summaries = await asyncio.gather(
        *[generate_enforcement_summary(h, cfg["name"]) for h in hotspots]
    )  # parallel, cached LLM calls
    for h, s in zip(hotspots, summaries):
        h["summary"] = s
    live = await fetch_live_aqi(cfg["id"])
    return {"city": cfg["name"], "hotspots": hotspots, "count": len(hotspots),
            "source_mix": result["source_mix"],
            "attribution_method": "source-receptor evidence weighting (distance + upwind + mapped land-use)",
            "data_source": live[0].get("source", "mock") if live else "mock"}
