import math
import logging
from typing import List, Dict
from services.satellite import fetch_fire_hotspots, fetch_industrial_zones

logger = logging.getLogger(__name__)


def _dist_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _nearest_area(lat: float, lon: float) -> str:
    """Map a coordinate to a known Delhi locality name."""
    known = [
        (28.6469, 77.3164, "Anand Vihar, East Delhi"),
        (28.6734, 77.1174, "Mayapuri, West Delhi"),
        (28.7041, 77.1025, "Mundka, West Delhi"),
        (28.6304, 77.4135, "Okhla, South Delhi"),
        (28.8200, 77.2200, "Alipur, North Delhi"),
        (28.5800, 77.3000, "Badarpur, South Delhi"),
        (28.7500, 76.9500, "Tikri Border, West Delhi"),
        (28.5947, 77.1456, "Dwarka, SW Delhi"),
        (28.7207, 77.1025, "Nangloi, West Delhi"),
        (28.7494, 77.0647, "Rohini, NW Delhi"),
    ]
    best, best_name = float("inf"), "Delhi NCR"
    for alat, alon, name in known:
        d = _dist_km(lat, lon, alat, alon)
        if d < best:
            best, best_name = d, name
    return best_name


async def compute_enforcement_hotspots(city: str = "Delhi") -> List[Dict]:
    """
    Score candidate hotspot locations using:
      - NASA FIRMS fire detections (FRP + confidence)
      - OSM industrial zone proximity
    Returns top-3 ranked locations.
    """
    fire_spots = await fetch_fire_hotspots(days=7)
    industrial_zones = await fetch_industrial_zones()

    candidates: List[Dict] = []

    # --- Score fire detections ---
    for spot in fire_spots:
        score = 0.0
        tags: List[str] = []

        frp = spot.get("frp", 0.0)
        conf = spot.get("confidence", "low")
        score += min(frp * 2.5, 40)
        tags.append(f"Fire hotspot (FRP {frp:.1f} MW)")

        conf_bonus = {"high": 25, "nominal": 12, "low": 0}.get(conf, 0)
        score += conf_bonus
        if conf_bonus:
            tags.append(f"{conf.capitalize()} confidence thermal anomaly")

        nearby = sorted(
            [(z, _dist_km(spot["latitude"], spot["longitude"], z["latitude"], z["longitude"]))
             for z in industrial_zones],
            key=lambda x: x[1],
        )
        close = [(z, d) for z, d in nearby if d < 4.0]
        if close:
            score += 20
            z0, d0 = close[0]
            tags.append(f"Near {z0['name']} ({d0:.1f} km)")

        source_type = "industrial_emission" if close else "waste_burning"
        candidates.append({
            "latitude": spot["latitude"],
            "longitude": spot["longitude"],
            "score": min(round(score, 1), 100),
            "evidence_tags": tags,
            "source_type": source_type,
        })

    # --- Score known high-pollution corridors ---
    corridors = [
        {"lat": 28.6469, "lon": 77.3164, "label": "Anand Vihar traffic corridor"},
        {"lat": 28.7234, "lon": 77.1520, "label": "Rohini industrial belt"},
        {"lat": 28.6304, "lon": 77.4135, "label": "Okhla industrial cluster"},
    ]
    for c in corridors:
        nearby = [(z, _dist_km(c["lat"], c["lon"], z["latitude"], z["longitude"]))
                  for z in industrial_zones if _dist_km(c["lat"], c["lon"], z["latitude"], z["longitude"]) < 5.0]
        if not nearby:
            continue
        score = 45 + len(nearby) * 6
        tags = [c["label"]] + [f"{z['name']} ({d:.1f} km)" for z, d in sorted(nearby, key=lambda x: x[1])[:2]]
        candidates.append({
            "latitude": c["lat"],
            "longitude": c["lon"],
            "score": min(round(score, 1), 100),
            "evidence_tags": tags,
            "source_type": "industrial_cluster",
        })

    candidates.sort(key=lambda x: x["score"], reverse=True)
    result = []
    for i, c in enumerate(candidates[:3]):
        result.append({
            "rank": i + 1,
            "latitude": c["latitude"],
            "longitude": c["longitude"],
            "score": c["score"],
            "evidence_tags": c["evidence_tags"],
            "source_type": c["source_type"],
            "location": _nearest_area(c["latitude"], c["longitude"]),
            "summary": "",  # filled by LLM in router
        })
    return result
