"""Source-receptor attribution and enforcement prioritisation.

Two distinct steps are deliberately kept separate:

1. ``attribute_point`` estimates the *mix* of source categories affecting a receptor
   (monitoring station or arbitrary coordinate) from nearby mapped sources, distance
   decay and upwind alignment.
2. ``compute_enforcement_hotspots`` ranks *candidate sources* (industrial sites,
   construction sites, landfills, fire clusters and major-road cells) by how well they
   explain the AQI observed at nearby receptors. The returned coordinates are source
   locations, not monitoring stations.

The model is still an evidence-weighted heuristic rather than a chemical mass-balance
or dispersion model, so every hotspot exposes ``confidence`` and provenance tags.
"""
import math
import logging
from typing import List, Dict, Optional

from utils.geo import dist_km, bearing_deg
from services.openaq import fetch_live_aqi
from services.satellite import fetch_fire_hotspots, fetch_osm_layers
from services.weather import fetch_wind_direction

logger = logging.getLogger(__name__)

CATEGORIES = ["traffic", "construction", "industry", "waste_burning"]
# (OSM layer -> category, search radius km, unit weight)
_OSM_RULES = {
    "highway":      ("traffic",       1.5, 1.0),
    "construction": ("construction",  2.5, 1.5),
    "industrial":   ("industry",      3.0, 1.5),
    "dump":         ("waste_burning", 3.0, 1.5),
}
_FIRE_RADIUS_KM = 5.0
_BACKGROUND = 1.5  # weight of unattributable background pollution
_CONF_FACTOR = {"high": 1.0, "nominal": 0.7, "low": 0.3}
_CONF_RANK = {"low": 0, "nominal": 1, "high": 2}
_DECAY_KM = 2.5          # distance-decay scale for source-receptor influence
_MAX_SOURCE_RADIUS_KM = 12.0
_SOURCE_WEIGHT = {       # relative strength of each candidate source class
    "industry": 1.6,
    "construction": 1.4,
    "dump": 1.5,
    "fire": 1.7,
    "highway": 0.6,
}
_PRIORITY = [(75, "Immediate"), (50, "High"), (0, "Monitor")]


# ------------------------------------------------------------------
# Geometry helpers
# ------------------------------------------------------------------

def _upwind_factor(lat: float, lon: float, slat: float, slon: float, wind_from: float) -> float:
    """1.5 when the source sits directly upwind of the location, 0.5 when downwind."""
    delta = math.radians(bearing_deg(lat, lon, slat, slon) - wind_from)
    return 1.0 + 0.5 * math.cos(delta)


def _decay(distance_km: float) -> float:
    return 1.0 / (1.0 + (distance_km / _DECAY_KM) ** 1.5)


def _priority(score: float) -> str:
    return next(label for threshold, label in _PRIORITY if score >= threshold)


# ------------------------------------------------------------------
# Receptor-level source mix
# ------------------------------------------------------------------

def attribute_point(lat: float, lon: float, osm: Dict[str, List[Dict]], fires: List[Dict],
                    wind_from: float = 270.0) -> Dict:
    """Return {'pct': {category: %, 'background': %}, 'evidence': {category: [tags]}}."""
    raw = {c: 0.0 for c in CATEGORIES}
    found: Dict[str, List] = {c: [] for c in CATEGORIES}

    for layer, (cat, radius, w) in _OSM_RULES.items():
        for f in osm.get(layer, []):
            d = dist_km(lat, lon, f["latitude"], f["longitude"])
            if d <= radius:
                raw[cat] += w * _upwind_factor(lat, lon, f["latitude"], f["longitude"], wind_from) / (1 + d)
                found[cat].append((d, f"{f['name']} ({d:.1f} km)"))

    for fire in fires:
        d = dist_km(lat, lon, fire["latitude"], fire["longitude"])
        if d <= _FIRE_RADIUS_KM:
            strength = min(fire.get("frp", 0.0), 50.0) / 10 + 0.5
            raw["waste_burning"] += (strength * _CONF_FACTOR.get(fire.get("confidence", "low"), 0.3)
                                     * _upwind_factor(lat, lon, fire["latitude"], fire["longitude"], wind_from)
                                     / (1 + d))
            found["waste_burning"].append((d, f"Fire hotspot FRP {fire.get('frp', 0):.1f} MW ({d:.1f} km)"))

    total = sum(raw.values()) + _BACKGROUND
    pct = {c: round(raw[c] / total * 100, 1) for c in CATEGORIES}
    pct["background"] = round(100 - sum(pct.values()), 1)
    evidence = {c: [t for _, t in sorted(found[c])[:3]] for c in CATEGORIES}
    return {"pct": pct, "evidence": evidence}


# ------------------------------------------------------------------
# Candidate source construction
# ------------------------------------------------------------------

def _cluster_fires(fires: List[Dict], radius_km: float = 1.0) -> List[Dict]:
    """Collapse multiple VIIRS detections of the same fire into one source."""
    clusters: List[Dict] = []
    for fire in sorted(fires, key=lambda f: -(f.get("frp") or 0)):
        lat, lon = fire["latitude"], fire["longitude"]
        conf = fire.get("confidence", "low")
        for c in clusters:
            if dist_km(lat, lon, c["latitude"], c["longitude"]) <= radius_km:
                c["frp"] += float(fire.get("frp") or 0)
                c["detections"] += 1
                if _CONF_RANK.get(conf, 0) > _CONF_RANK.get(c["confidence"], 0):
                    c["confidence"] = conf
                break
        else:
            clusters.append({"latitude": lat, "longitude": lon,
                             "frp": float(fire.get("frp") or 0),
                             "confidence": conf, "detections": 1})
    return clusters


def _cluster_points(points: List[Dict], cell_deg: float = 0.03) -> List[Dict]:
    """Collapse dense major-road segments into ~3 km grid cells (traffic corridors)."""
    cells: Dict[tuple, Dict] = {}
    for p in points:
        lat, lon = p["latitude"], p["longitude"]
        key = (round(lat / cell_deg), round(lon / cell_deg))
        cell = cells.get(key)
        if cell is None:
            cells[key] = {"latitude": lat, "longitude": lon, "count": 1,
                          "name": p.get("name") or "Major road"}
        else:
            n = cell["count"]
            cell["latitude"] = (cell["latitude"] * n + lat) / (n + 1)
            cell["longitude"] = (cell["longitude"] * n + lon) / (n + 1)
            cell["count"] = n + 1
    return list(cells.values())


def _source_candidates(osm: Dict[str, List[Dict]], fires: List[Dict]) -> List[Dict]:
    """Build point-level candidate emitters from mapped land-use and satellite fires."""
    sources: List[Dict] = []
    for layer, category in (("industrial", "industry"),
                            ("construction", "construction"),
                            ("dump", "waste_burning")):
        for f in osm.get(layer, []):
            label = "Landfill / waste site" if layer == "dump" else f"{category.title()} site"
            sources.append({
                "latitude": f["latitude"], "longitude": f["longitude"],
                "name": f.get("name") or label, "category": category, "kind": layer,
                "weight": _SOURCE_WEIGHT["dump" if layer == "dump" else category], "frp": 0.0,
                "confidence": 0.72 if f.get("mock") else 0.9,
                "evidence": [f"Mapped {label}"],
            })

    for c in _cluster_fires(fires):
        sources.append({
            "latitude": c["latitude"], "longitude": c["longitude"],
            "name": None, "category": "waste_burning", "kind": "fire",
            "weight": _SOURCE_WEIGHT["fire"] * (1 + min(c["frp"], 50.0) / 50.0),
            "frp": c["frp"], "confidence": _CONF_FACTOR.get(c["confidence"], 0.3),
            "evidence": [f"NASA FIRMS fire cluster · {c['detections']} detection(s) · FRP {c['frp']:.1f} MW"],
        })

    for cell in _cluster_points(osm.get("highway", [])):
        sources.append({
            "latitude": cell["latitude"], "longitude": cell["longitude"],
            "name": None, "category": "traffic", "kind": "highway",
            "weight": _SOURCE_WEIGHT["highway"], "frp": 0.0, "confidence": 0.45,
            "evidence": [f"Major-road corridor · {cell['count']} mapped segment(s)"],
        })

    # Deduplicate exact duplicates while preserving the strongest confidence
    unique: Dict[tuple, Dict] = {}
    for s in sources:
        key = (round(s["latitude"], 5), round(s["longitude"], 5), s["category"])
        if key not in unique or s["confidence"] > unique[key]["confidence"]:
            unique[key] = s
    return list(unique.values())


def _receptor_name(station: Dict) -> str:
    return station.get("station_name") or station.get("station_id") or "monitoring station"


def _affected_receptors(source: Dict, readings: List[Dict], wind_from: float) -> List[Dict]:
    affected = []
    for station in readings:
        d = dist_km(source["latitude"], source["longitude"],
                    station["latitude"], station["longitude"])
        if d > _MAX_SOURCE_RADIUS_KM:
            continue
        upwind = _upwind_factor(station["latitude"], station["longitude"],
                                source["latitude"], source["longitude"], wind_from)
        affected.append({"station": station, "distance_km": d, "upwind_factor": upwind,
                         "influence": _decay(d) * upwind})
    affected.sort(key=lambda a: a["influence"], reverse=True)
    return affected


def _source_confidence(source: Dict, distance_km: float, upwind_factor: float) -> float:
    confidence = source["confidence"] * 0.7
    if distance_km <= 2.0:
        confidence += 0.15
    elif distance_km <= 5.0:
        confidence += 0.08
    if upwind_factor >= 1.0:
        confidence += 0.10
    if source["kind"] == "fire" and source["frp"] >= 10:
        confidence += 0.05
    return round(min(confidence, 0.98), 2)


# ------------------------------------------------------------------
# Enforcement ranking
# ------------------------------------------------------------------

def _station_attribution(readings: List[Dict], osm: Dict, fires: List[Dict],
                         wind_from: float) -> Dict[str, Dict]:
    return {r["station_id"]: attribute_point(r["latitude"], r["longitude"], osm, fires, wind_from)
            for r in readings}


def _city_source_mix(readings: List[Dict], station_attr: Dict[str, Dict]) -> Dict[str, float]:
    mix = {k: 0.0 for k in CATEGORIES + ["background"]}
    weights = {r["station_id"]: max(float(r.get("aqi") or 0), 1.0) for r in readings}
    wsum = sum(weights.values()) or 1.0
    for r in readings:
        pct = station_attr[r["station_id"]]["pct"]
        for k in mix:
            mix[k] += pct[k] * weights[r["station_id"]] / wsum
    return {k: round(v, 1) for k, v in mix.items()}


def _fallback_station_hotspots(readings: List[Dict], station_attr: Dict[str, Dict]) -> List[Dict]:
    """When no mapped source exists, expose high-AQI stations as 'undetermined' leads."""
    ranked = sorted(readings, key=lambda r: r.get("aqi") or 0, reverse=True)
    out = []
    for r in ranked:
        aqi = float(r.get("aqi") or 0)
        out.append({
            "latitude": r["latitude"], "longitude": r["longitude"],
            "location": f"{_receptor_name(r)} (monitoring station)",
            "score": round(min(aqi / 400.0, 1.0) * 100, 1),
            "evidence_tags": [f"AQI {aqi:.0f}", "No mapped source nearby — inspect locally"],
            "source_type": "undetermined", "kind": "station",
            "attribution": station_attr[r["station_id"]]["pct"],
            "aqi": aqi, "confidence": 0.2, "distance_km": 0.0,
            "receptor_station": _receptor_name(r), "upwind": None,
        })
    return out


def _rank_sources(sources: List[Dict], readings: List[Dict], osm: Dict, fires: List[Dict],
                  wind_from: float) -> List[Dict]:
    scored = []
    for source in sources:
        affected = _affected_receptors(source, readings, wind_from)
        if not affected:
            continue

        weighted_aqi = sum(a["influence"] * float(a["station"].get("aqi") or 0)
                           for a in affected)
        receptor = affected[0]
        station = receptor["station"]
        observed_aqi = float(station.get("aqi") or 0)
        severity = min(observed_aqi / 400.0, 1.0) * 100
        confidence = _source_confidence(source, receptor["distance_km"], receptor["upwind_factor"])

        local = attribute_point(source["latitude"], source["longitude"], osm, fires, wind_from)
        dominant = max(CATEGORIES, key=lambda c: local["pct"][c])

        scored.append({
            "raw": source["weight"] * weighted_aqi,
            "source": source,
            "receptor": receptor,
            "severity": severity,
            "confidence": confidence,
            "attribution": local["pct"],
            "dominant": dominant,
        })

    if not scored:
        return []

    max_raw = max(item["raw"] for item in scored) or 1.0
    hotspots = []
    for item in scored:
        source, receptor = item["source"], item["receptor"]
        station = receptor["station"]
        name = _receptor_name(station)
        influence_score = 100.0 * item["raw"] / max_raw
        score = round(0.45 * item["severity"] + 0.45 * influence_score + 0.10 * item["confidence"] * 100, 1)
        upwind = receptor["upwind_factor"] >= 1.0
        location = source["name"] or (
            f"Fire cluster near {name}" if source["kind"] == "fire"
            else f"Traffic corridor near {name}"
        )
        tags = [
            f"AQI {float(station.get('aqi') or 0):.0f} at {name}",
            f"{receptor['distance_km']:.1f} km from receptor",
            "Upwind of receptor" if upwind else "Downwind of receptor",
            *source["evidence"],
        ]
        if item["dominant"] != source["category"]:
            tags.append(f"Local mix dominated by {item['dominant'].replace('_', ' ')}")

        hotspots.append({
            "latitude": source["latitude"], "longitude": source["longitude"],
            "location": location,
            "score": score,
            "priority": _priority(score),
            "evidence_tags": tags[:6],
            "source_type": source["category"],
            "kind": source["kind"],
            "attribution": item["attribution"],
            "aqi": float(station.get("aqi") or 0),
            "confidence": item["confidence"],
            "distance_km": round(receptor["distance_km"], 1),
            "receptor_station": name,
            "upwind": upwind,
            "frp": source["frp"] or None,
        })

    hotspots.sort(key=lambda h: h["score"], reverse=True)
    return hotspots


async def compute_enforcement_hotspots(city: str = "delhi", limit: int = 3,
                                       source_type: Optional[str] = None) -> Dict:
    readings = [r for r in await fetch_live_aqi(city) if r.get("aqi") is not None]
    osm = await fetch_osm_layers(city)
    fires = await fetch_fire_hotspots(city)
    wind_from = await fetch_wind_direction(city)

    station_attr = _station_attribution(readings, osm, fires, wind_from)
    source_mix = _city_source_mix(readings, station_attr)

    sources = _source_candidates(osm, fires)
    hotspots = _rank_sources(sources, readings, osm, fires, wind_from)
    if not hotspots:
        hotspots = _fallback_station_hotspots(readings, station_attr)

    if source_type:
        hotspots = [h for h in hotspots if h["source_type"] == source_type]

    result = [{"rank": i + 1, **h, "summary": ""} for i, h in enumerate(hotspots[:limit])]
    return {"hotspots": result, "source_mix": source_mix}
