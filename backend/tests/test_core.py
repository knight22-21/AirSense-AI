import pytest
from fastapi.testclient import TestClient

from services.openaq import _pm25_to_aqi, _mock_historical_aqi
from services.weather import _mock_weather, _hourly_rows
from services.satellite import _mock_osm_layers, _mock_hotspots, _parse_firms_csv
from services.attribution import attribute_point
from services.wards import _stitch
from models.forecaster import AQIForecaster, _aqi_to_pm25


def test_pm25_to_aqi_breakpoints():
    assert _pm25_to_aqi(0) == 0
    assert _pm25_to_aqi(12.0) == 50
    assert _pm25_to_aqi(35.4) == 100
    assert _pm25_to_aqi(150.4) == 200
    assert _pm25_to_aqi(600) == 500


def test_aqi_pm25_roundtrip():
    for pm in (8, 30, 100, 200, 300):
        assert abs(_aqi_to_pm25(_pm25_to_aqi(pm)) - pm) < 1.0


def test_firms_confidence_letters_normalised():
    csv = "latitude,longitude,bright_ti4,confidence,acq_date,frp\n28.7,77.1,330,h,2026-01-01,12.5\n"
    assert _parse_firms_csv(csv)[0]["confidence"] == "high"


def test_stitch_joins_segments_into_ring():
    ways = [[[0, 0], [1, 0]], [[1, 1], [1, 0]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]]
    rings = _stitch(ways)
    assert len(rings) == 1 and rings[0][0] == rings[0][-1]


def test_attribution_sums_to_100_and_finds_industry():
    osm = _mock_osm_layers("delhi")
    # standing on Mayapuri industrial area
    a = attribute_point(28.6734, 77.1174, osm, [], wind_from=270)
    assert abs(sum(a["pct"].values()) - 100) < 0.2
    assert max(("traffic", "construction", "industry", "waste_burning"), key=a["pct"].get) == "industry"


def test_attribution_no_sources_is_all_background():
    a = attribute_point(0.0, 0.0, {}, [], 270)
    assert a["pct"]["background"] == 100


def test_upwind_source_counts_more():
    src = {"industrial": [{"latitude": 28.60, "longitude": 77.20, "name": "x"}]}
    # source is due north of the point; wind from north = upwind, wind from south = downwind
    up = attribute_point(28.58, 77.20, src, [], wind_from=0)["pct"]["industry"]
    down = attribute_point(28.58, 77.20, src, [], wind_from=180)["pct"]["industry"]
    assert up > down


def test_forecaster_beats_persistence_on_synthetic_series():
    hist = _mock_historical_aqi("anand-vihar", "delhi", 45)
    weather = _hourly_rows(_mock_weather(past_days=46, forecast_days=4)["hourly"])
    fc = AQIForecaster()
    fc.MODEL_DIR = "."  # avoid touching real model files
    fc._save = lambda city: None
    res = fc.train("delhi", {"a": hist}, weather)
    assert res["trained"] and res["rmse"] > 0 and res["persistence_rmse"] > 0
    assert res["mae"] > 0 and res["persistence_mae"] > 0
    assert res["horizon_hours"] == 72 and len(res["per_horizon"]) == 72
    assert res["feature_importance"] and "lag_1" in res["feature_importance"]
    preds, model, metrics = fc.predict("delhi", hist, weather, 72)
    assert model == "xgboost" and len(preds) == 72 and metrics is not None
    assert all(p["confidence_lower"] <= p["aqi"] <= p["confidence_upper"] for p in preds)


def test_forecaster_statistical_fallback_when_no_data():
    fc = AQIForecaster()
    fc._models = {}
    preds, model, metrics = fc.predict("nowhere", [], [], 24)
    assert model == "statistical" and len(preds) == 24 and metrics is None


# ---- API smoke tests (network calls patched out) ----

@pytest.fixture
def client(monkeypatch):
    import services.satellite as sat
    import services.weather as wx

    async def no_osm(city="delhi"):
        return _mock_osm_layers(city)

    async def no_fire(city="delhi", days=5):
        return _mock_hotspots(city)

    async def no_wx(city="delhi", hours=72, past_days=0):
        return _hourly_rows(_mock_weather(past_days, 4)["hourly"])

    async def wind(city="delhi"):
        return 270.0

    for mod in ("services.satellite", "services.attribution", "routers.advisory"):
        monkeypatch.setattr(f"{mod}.fetch_osm_layers", no_osm, raising=False)
    monkeypatch.setattr("services.attribution.fetch_fire_hotspots", no_fire)
    monkeypatch.setattr("services.attribution.fetch_wind_direction", wind)
    monkeypatch.setattr("routers.forecast.fetch_weather_forecast", no_wx)
    monkeypatch.setenv("OPENAQ_API_KEY", "")
    monkeypatch.setenv("GROQ_API_KEY", "")
    import main
    with TestClient(main.app) as c:
        yield c


@pytest.mark.parametrize("city", ["delhi", "mumbai", "bengaluru", "chennai", "kolkata"])
def test_all_cities_serve_live_data(client, city):
    r = client.get("/aqi/live", params={"city": city})
    assert r.status_code == 200 and r.json()["count"] >= 5
    assert client.get(f"/enforcement/{city}").status_code == 200
    assert client.get(f"/advisory/{city}").json()["advisory_ta"]


def test_unknown_city_404(client):
    assert client.get("/aqi/city/atlantis").status_code == 404
    assert client.get("/enforcement/atlantis").status_code == 404


def test_enforcement_filter_and_attribution(client):
    body = client.get("/enforcement/delhi", params={"limit": 5}).json()
    assert body["hotspots"] and abs(sum(body["hotspots"][0]["attribution"].values()) - 100) < 0.5
    assert abs(sum(body["source_mix"].values()) - 100) < 1.0
    assert all(h.get("confidence") is not None for h in body["hotspots"])
    assert all(h.get("receptor_station") for h in body["hotspots"])
    assert all(h.get("kind") != "station" for h in body["hotspots"])  # real source candidates
    only = client.get("/enforcement/delhi", params={"source_type": "industry", "limit": 10}).json()
    assert all(h["source_type"] == "industry" for h in only["hotspots"])
    assert client.get("/enforcement/delhi", params={"source_type": "bogus"}).status_code == 400


def test_forecast_endpoint(client):
    r = client.get("/forecast/anand-vihar", params={"hours": 24, "city": "delhi"})
    assert r.status_code == 200 and len(r.json()["forecasts"]) == 24
    metrics = r.json()["metrics"]
    assert metrics and metrics["feature_importance"] and metrics["per_horizon"]
    assert client.get("/forecast/anand-vihar", params={"hours": 5}).status_code == 400


def test_ward_advisories(client):
    w = client.get("/advisory/delhi/wards").json()
    assert w["wards"] and "risk_level" in w["wards"][0]


def test_wards_can_be_interpolated(client):
    body = client.get("/aqi/wards/delhi", params={"with_aqi": True}).json()
    assert body["interpolation"] == "idw"
    features = body["features"]
    assert features and any(f["properties"].get("aqi") for f in features)
    assert all("risk_level" in f["properties"] for f in features)
    raw = client.get("/aqi/wards/delhi").json()
    assert "interpolation" not in raw  # raw boundary request stays cached/lightweight


def test_alerts_endpoint(client):
    r = client.get("/alerts/delhi", params={"threshold": 1})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1 and body["alerts"][0]["aqi"] >= 1
    assert body["alerts"][0]["message"]
    assert client.get("/alerts/delhi", params={"threshold": 999}).status_code == 400
    assert client.get("/alerts/atlantis").status_code == 404
    all_cities = client.get("/alerts", params={"threshold": 1, "limit": 10})
    assert all_cities.status_code == 200 and all_cities.json()["count"] >= 1


def test_live_reports_data_age(client):
    body = client.get("/aqi/live", params={"city": "delhi"}).json()
    assert body["data_age_minutes"] is not None
    assert body["data_age_minutes"] >= 0
