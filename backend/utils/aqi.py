"""Shared AQI risk categories (US EPA / CPCB scale)."""

RISK_LEVELS = [
    (50, "Good"),
    (100, "Moderate"),
    (150, "Unhealthy for Sensitive Groups"),
    (200, "Unhealthy"),
    (300, "Very Unhealthy"),
]


def risk_level(aqi: float) -> str:
    if aqi is None:
        return "No data"
    for limit, label in RISK_LEVELS:
        if aqi <= limit:
            return label
    return "Hazardous"
