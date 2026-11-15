"""City registry — adding a city to the platform is a single entry here."""
from typing import Dict

# bbox = (west, south, east, north)
CITIES: Dict[str, Dict] = {
    "delhi": {
        "name": "Delhi", "lat": 28.6139, "lon": 77.2090, "radius_m": 25000,
        "bbox": (76.8, 28.4, 77.4, 28.9),
        "stations": [
            {"id": "anand-vihar",  "name": "Anand Vihar",   "latitude": 28.6469, "longitude": 77.3164},
            {"id": "rk-puram",     "name": "RK Puram",      "latitude": 28.5640, "longitude": 77.1742},
            {"id": "punjabi-bagh", "name": "Punjabi Bagh",  "latitude": 28.6667, "longitude": 77.1167},
            {"id": "mandir-marg",  "name": "Mandir Marg",   "latitude": 28.6363, "longitude": 77.2008},
            {"id": "igi-airport",  "name": "IGI Airport T3", "latitude": 28.5665, "longitude": 77.1031},
            {"id": "shadipur",     "name": "Shadipur",      "latitude": 28.6518, "longitude": 77.1427},
            {"id": "okhla-phase2", "name": "Okhla Phase-II", "latitude": 28.5355, "longitude": 77.2710},
            {"id": "rohini",       "name": "Rohini",        "latitude": 28.7494, "longitude": 77.0647},
        ],
        "mock_base_pm25": 140,
    },
    "mumbai": {
        "name": "Mumbai", "lat": 19.0760, "lon": 72.8777, "radius_m": 25000,
        "bbox": (72.77, 18.89, 73.05, 19.30),
        "stations": [
            {"id": "bandra-kurla", "name": "Bandra Kurla Complex", "latitude": 19.0653, "longitude": 72.8691},
            {"id": "worli",        "name": "Worli",                "latitude": 19.0176, "longitude": 72.8156},
            {"id": "andheri",      "name": "Andheri",              "latitude": 19.1136, "longitude": 72.8697},
            {"id": "borivali",     "name": "Borivali East",        "latitude": 19.2307, "longitude": 72.8567},
            {"id": "chembur",      "name": "Chembur",              "latitude": 19.0522, "longitude": 72.9005},
        ],
        "mock_base_pm25": 70,
    },
    "bengaluru": {
        "name": "Bengaluru", "lat": 12.9716, "lon": 77.5946, "radius_m": 25000,
        "bbox": (77.45, 12.82, 77.78, 13.14),
        "stations": [
            {"id": "silk-board",  "name": "Silk Board",        "latitude": 12.9177, "longitude": 77.6233},
            {"id": "hebbal",      "name": "Hebbal",            "latitude": 13.0358, "longitude": 77.5970},
            {"id": "jayanagar",   "name": "Jayanagar 5th Block", "latitude": 12.9250, "longitude": 77.5938},
            {"id": "btm-layout",  "name": "BTM Layout",        "latitude": 12.9166, "longitude": 77.6101},
            {"id": "peenya",      "name": "Peenya",            "latitude": 13.0285, "longitude": 77.5197},
        ],
        "mock_base_pm25": 45,
    },
    "chennai": {
        "name": "Chennai", "lat": 13.0827, "lon": 80.2707, "radius_m": 25000,
        "bbox": (80.12, 12.90, 80.33, 13.24),
        "stations": [
            {"id": "manali",     "name": "Manali",     "latitude": 13.1650, "longitude": 80.2610},
            {"id": "alandur",    "name": "Alandur",    "latitude": 13.0030, "longitude": 80.2010},
            {"id": "velachery",  "name": "Velachery",  "latitude": 12.9800, "longitude": 80.2200},
            {"id": "royapuram",  "name": "Royapuram",  "latitude": 13.1130, "longitude": 80.2940},
            {"id": "kodungaiyur", "name": "Kodungaiyur", "latitude": 13.1380, "longitude": 80.2530},
        ],
        "mock_base_pm25": 50,
    },
    "kolkata": {
        "name": "Kolkata", "lat": 22.5726, "lon": 88.3639, "radius_m": 25000,
        "bbox": (88.22, 22.45, 88.50, 22.68),
        "stations": [
            {"id": "victoria",   "name": "Victoria Memorial", "latitude": 22.5448, "longitude": 88.3426},
            {"id": "jadavpur",   "name": "Jadavpur",          "latitude": 22.4991, "longitude": 88.3710},
            {"id": "ballygunge", "name": "Ballygunge",        "latitude": 22.5268, "longitude": 88.3640},
            {"id": "rabindra-sarobar", "name": "Rabindra Sarobar", "latitude": 22.5100, "longitude": 88.3500},
            {"id": "fort-william", "name": "Fort William",    "latitude": 22.5545, "longitude": 88.3379},
        ],
        "mock_base_pm25": 90,
    },
}


def get_city(city: str) -> Dict:
    """Return the city config or raise KeyError (routers map this to a 404)."""
    key = (city or "").lower()
    if key not in CITIES:
        raise KeyError(key)
    return {**CITIES[key], "id": key}


def city_of_station(station_id: str) -> str:
    """Resolve a static-fallback station slug to its city (defaults to delhi)."""
    for cid, c in CITIES.items():
        if any(s["id"] == station_id for s in c["stations"]):
            return cid
    return "delhi"
