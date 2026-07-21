from fastapi import APIRouter, HTTPException
from services.attribution import compute_enforcement_hotspots
from services.llm import generate_enforcement_summary

router = APIRouter()


@router.get("/{city}")
async def get_enforcement_hotspots(city: str):
    if city.lower() != "delhi":
        raise HTTPException(status_code=404, detail="Only 'delhi' is supported in MVP")

    hotspots = await compute_enforcement_hotspots(city)
    for h in hotspots:
        h["summary"] = await generate_enforcement_summary(h)

    return {"city": "Delhi", "hotspots": hotspots, "count": len(hotspots)}
