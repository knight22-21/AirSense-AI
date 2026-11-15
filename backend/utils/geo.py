import math


def dist_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine great-circle distance in km."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point 1 to point 2, degrees clockwise from north."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def idw_value(lat: float, lon: float, points, power: float = 2.0,
              smoothing_km: float = 0.25):
    """Inverse-distance-weighted AQI at (lat, lon) from nearby station readings."""
    num = den = 0.0
    for p in points:
        aqi = p.get("aqi")
        if aqi is None or p.get("latitude") is None or p.get("longitude") is None:
            continue
        d = dist_km(lat, lon, p["latitude"], p["longitude"])
        w = 1.0 / ((d + smoothing_km) ** power)
        num += w * float(aqi)
        den += w
    return num / den if den else None


def _coord_pairs(coords):
    if not coords:
        return
    first = coords[0]
    if isinstance(first, (int, float)) and len(coords) >= 2:
        yield (coords[0], coords[1])
        return
    for item in coords:
        yield from _coord_pairs(item)


def feature_centroid(feature):
    """Bounding-box centre of a GeoJSON Polygon/MultiPolygon feature."""
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates")
    if not coords:
        return None
    pairs = list(_coord_pairs(coords))
    if not pairs:
        return None
    lats = [p[1] for p in pairs]
    lons = [p[0] for p in pairs]
    return ((min(lats) + max(lats)) / 2.0, (min(lons) + max(lons)) / 2.0)
