"""Ward boundary GeoJSON: data/ward_boundaries/{city}.geojson if present, otherwise built
once from OSM administrative boundaries (admin_level 9/10) and cached to that path."""
import os
import json
import logging
import httpx
from typing import Dict, List

from config import get_city

logger = logging.getLogger(__name__)
WARD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                        "data", "ward_boundaries")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_HEADERS = {"User-Agent": "AirSenseAI/1.1 (hackathon project)", "Accept": "application/json"}
EMPTY = {"type": "FeatureCollection", "features": []}


def _stitch(ways: List[List[List[float]]]) -> List[List[List[float]]]:
    """Join way segments (lists of [lon, lat]) into closed rings by matching endpoints."""
    rings, segs = [], [list(w) for w in ways if len(w) > 1]
    while segs:
        ring = segs.pop()
        progress = True
        while progress and ring[0] != ring[-1]:
            progress = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring = ring + s[1:]
                elif s[-1] == ring[-1]:
                    ring = ring + s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                progress = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def _to_geojson(elements: List[Dict]) -> Dict:
    feats = []
    for el in elements:
        outers = [[[p["lon"], p["lat"]] for p in m["geometry"]]
                  for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        rings = _stitch(outers)
        if not rings:
            continue
        feats.append({
            "type": "Feature",
            "properties": {"name": el.get("tags", {}).get("name", f"Ward {el['id']}"),
                           "admin_level": el.get("tags", {}).get("admin_level")},
            "geometry": {"type": "MultiPolygon", "coordinates": [[r] for r in rings]},
        })
    return {"type": "FeatureCollection", "features": feats}


async def get_ward_geojson(city: str) -> Dict:
    cfg = get_city(city)
    path = os.path.join(WARD_DIR, f"{cfg['id']}.geojson")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Ward file unreadable: {e}")
    w, s, e, n = cfg["bbox"]
    query = (f'[out:json][timeout:90];relation["boundary"="administrative"]["admin_level"~"^(9|10)$"]'
             f'({s},{w},{n},{e});out geom 400;')
    try:
        async with httpx.AsyncClient(timeout=100) as client:
            resp = await client.post(OVERPASS_URL, headers=OVERPASS_HEADERS, data={"data": query})
        if resp.status_code == 200:
            gj = _to_geojson(resp.json().get("elements", []))
            if gj["features"]:
                os.makedirs(WARD_DIR, exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(gj, f)
                return gj
    except Exception as e:
        logger.warning(f"Ward boundary fetch failed: {e}")
    return EMPTY
