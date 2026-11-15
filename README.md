# AirSense AI — Urban Air Quality Intelligence Platform

> AI-powered smart city platform that moves city administrators from *reactive dashboards* to *proactive, evidence-based interventions* on air pollution.

---

## What is AirSense AI doing?

Most city air-quality portals show you a number and a colour. AirSense AI goes three steps further:

| Layer | What it does |
|---|---|
| **Live monitoring** | Pulls real PM2.5 / AQI readings from certified CAAQMS stations every 30 minutes |
| **72-hour forecast** | Predicts how AQI will evolve per station so administrators act before air turns bad |
| **Source attribution** | Identifies *where* the pollution is coming from (industrial zones, waste burning, traffic corridors) and ranks locations by enforcement priority |
| **Citizen advisory** | Generates plain-language health guidance in English and Hindi, targeted at vulnerable groups |

---

## System Architecture

```
┌──────────────────── DATA INGESTION (every 30 min) ─────────────────────┐
│                                                                          │
│  OpenAQ v3 API          Open-Meteo API        NASA FIRMS API            │
│  (PM2.5, PM10, NO₂)     (wind, humidity,      (fire/thermal anomaly     │
│  Free key required       temp, boundary        hotspots near city)       │
│  (mock fallback)         layer height)          + OSM industrial zones   │
│              │                   │                      │                │
│              └───────────────────┴──────────────────────┘               │
│                                  │                                       │
│               APScheduler: AQI + weather every 30 min,                   │
│               daily model retrain, 6-hour retention purge                │
│                                  │                                       │
│                     Supabase PostgreSQL                                  │
│                (aqi_readings, forecasts, alerts, weather)                │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
┌──────────────────── FASTAPI BACKEND ──────────────────────────────────────┐
│                                                                            │
│  /aqi/*          /forecast/*         /enforcement/*      /advisory/*      │
│  Live + history  XGBoost forecast    Source-receptor     Groq LLaMA3      │
│  + ward IDW AQI  + backtest metrics  attribution         bilingual text    │
│  /alerts/* — threshold breaches from the same live station network         │
│                                                                            │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ REST/JSON
┌──────────────────── REACT FRONTEND ───────────────────────────────────────┐
│                                                                            │
│  City selector → Leaflet map → CircleMarker stations + hotspot pins       │
│  Sidebar: Recharts 72-hr forecast · Enforcement panel · Advisory card     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Techniques Used — In Detail

### 1. AQI Calculation — US EPA Breakpoint Formula

Raw sensor output is PM2.5 concentration in µg/m³. We convert it to the 0–500 AQI index using the US EPA piecewise linear interpolation formula:

```
AQI = (I_hi - I_lo) / (C_hi - C_lo) × (C_pm25 - C_lo) + I_lo
```

Where `[C_lo, C_hi]` are the PM2.5 concentration breakpoints and `[I_lo, I_hi]` are the corresponding AQI index breakpoints. This is applied in `services/openaq.py → _pm25_to_aqi()`.

**Why this formula?** The EPA formula is internationally recognised and matches the scale used by India's CPCB, making our numbers directly comparable to official government portals.

---

### 2. Data Ingestion — APScheduler + httpx

`scheduler.py` registers four jobs:

| Job | Schedule | Purpose |
|---|---|---|
| `_poll_aqi_data()` | every 30 min | OpenAQ v3 REST → PM2.5 → AQI → Supabase; also writes threshold alerts |
| `_poll_weather_data()` | every 30 min | Open-Meteo 72-hour hourly weather grid → Supabase |
| `_retrain_models()` | daily 03:00 | Retrains one XGBoost model per city from up to 90 days of history |
| `_purge_old_data()` | every 6 h | Deletes readings >30 days, forecasts >7 days, alerts >30 days |

All HTTP calls use `httpx.AsyncClient` (non-blocking) with a 15–20 second timeout. Every external call has a **static mock fallback** so the app works with zero internet connectivity — important for hackathon demos. `python scheduler.py --seed --days 7` backfills history into both Supabase and `data/training_data/*.csv`.

---

### 3. AQI Forecasting — XGBoost + Feature Engineering

**Model:** `XGBRegressor` from XGBoost (gradient-boosted decision trees)

**Features engineered per reading** (`models/forecaster.py`):

| Feature group | Features |
|---|---|
| Calendar | hour-of-day (sin/cos), day-of-week, month, is_weekend |
| Lag features | AQI at t−1h, t−2h, t−3h, t−6h, t−12h, t−24h |
| Rolling statistics | 6-hour mean, 6-hour std, 24-hour mean |
| Weather | temperature, humidity, wind speed, wind direction (sin/cos), boundary-layer height |

**Why lags + rolling stats?** Air quality has strong temporal autocorrelation — AQI at 3 AM tomorrow is heavily influenced by AQI at 3 AM today and the past 6-hour trend. Lags and rolling features capture this without needing an explicit time-series model.

**Training and validation:** an 80/20 chronological split, backtested over the full 72-hour product horizon when history allows (minimum 6 hours). We report **RMSE and MAE against a persistence baseline** and store the score **per horizon** so degradation with lead time is visible. Confidence intervals are empirical 10th/90th residual quantiles from the backtest; models trained before this change are treated as stale and rebuilt. The endpoint returns `model_metrics.feature_importance` so the UI can show forecast drivers.

**Fallback:** When the model hasn't been trained or there is too little history, a **diurnal statistical forecaster** is used: a damped 24-hour rolling mean with rush-hour peaks (7–10 AM × 1.2, 5–9 PM × 1.15) and pre-dawn lows (2–5 AM × 0.80). No random noise is added — the fallback is deterministic and clearly labelled.

**Honest limitation:** with only 7–14 days of history the backtest horizon is shorter than 72 hours and the persistence baseline is configured as same-hour-yesterday for the first 24 hours, then flat last-observation. The API reports the actual `horizon_hours`, `backtest_origins`, and sample count alongside every metric.

---

### 4. Source Attribution — Source–Receptor Model

`services/attribution.py` no longer ranks fires directly. It separates **receptors** (CAAQMS stations, where people breathe) from **candidate sources**, then estimates which sources plausibly explain each station's AQI.

**Candidate sources built from:**
- NASA FIRMS VIIRS-SNPP fire detections (last 7 days, 375m), clustered into fire complexes
- OSM Overpass industrial land-use polygons
- OSM construction sites and waste/dump sites
- Traffic corridors derived from station pairs and major road proximity

**Per receptor station:**
1. Compute distance and **upwind/downwind** position relative to each candidate source using station-level wind direction.
2. Keep sources within the city radius; weight by inverse distance, wind alignment, fire radiative power (FRP), and source kind.
3. Normalise to a local source mix: `traffic`, `construction`, `industry`, `waste_burning`, `background`.
4. Attach a **confidence score** from evidence density (distance, multiple corroborating sources, satellite detections) and a priority label (`high` / `medium` / `low`).

**Haversine distance** is used throughout (`utils/geo.py → dist_km`) for great-circle distance. The hotspot object also exposes `receptor_station`, `distance_km`, `upwind`, `kind`, `frp`, and `confidence`, so an officer can see *what* is affected and *why* the source is suspected. If no OSM/FIRMS data is available, the service falls back to station-centred hotspots with clearly labelled provenance.

---

### 5. LLM Integration — Groq + llama3-8b-8192

Two types of LLM-generated text via `services/llm.py`:

**Enforcement summaries** — for each hotspot, a targeted 2-sentence prompt:
```
"You are an air quality enforcement officer in <city>.
Location: <locality>, Source: <type>, Evidence: <tags>, Score: N/100, Confidence: X%
Write exactly 2 sentences: Sentence 1 = immediate action. Sentence 2 = expected impact."
```

**Citizen advisories** — structured JSON output prompt:
```
"Generate a public health advisory for Delhi, AQI N (Risk level X).
Respond ONLY with valid JSON: {advisory_en, advisory_hi, vulnerable_groups}"
```

The model is constrained to `max_tokens=120–300` and `temperature=0.3` to keep outputs short and factual. Generated text is cached in-process by a fingerprint of the hotspot evidence (and AQI/risk for advisories), so repeated dashboard loads do not burn quota. All LLM calls have static fallback text so the app works without a Groq key.

**Why llama3-8b-8192?** It's the fastest model on Groq's free tier (14,400 req/day) and handles structured JSON output reliably at this short context length.

---

### 6. Geocoding & Maps — Leaflet + react-leaflet

**Station markers:** `CircleMarker` components coloured by AQI severity using the US EPA colour scale. Radius increases to 22px when selected for clear visual focus.

**Enforcement hotspots:** Custom `L.divIcon` rendered as an orange teardrop pin (CSS `border-radius: 50% 50% 50% 0; transform: rotate(-45deg)`), matching Google Maps pin conventions.

**City navigation:** `FlyToCity` uses Leaflet's `map.flyTo()` with a 1.2-second animation when a new city is selected from the dropdown.

**OSM tiles** are used as the base map (free, no API key) at 60% opacity so the dark UI background shows through.

---

### 7. City Selector — Scalability Story

The UI has a city dropdown with 5 cities: **Delhi, Mumbai, Bengaluru, Chennai, Kolkata**. All five are wired through the same pipeline; each falls back to its own station-level mock network when OpenAQ is unavailable:

- Selecting a city flies the map to its coordinates and refetches stations, live AQI, wards, enforcement, advisories, and alerts
- All hooks (`useAQIData`, `useEnforcement`, `useAdvisory`, `useAlerts`) accept a `city` param
- Unknown city slugs return `404` and the frontend handles this without crashing

To extend to a new city: add its entry in `backend/config.py`, mirror it in `frontend/src/config/cities.js`, and (optionally) add station fallbacks. Both the API and UI pick it up automatically.

---

### 8. Weather Features — Open-Meteo Integration

`services/weather.py` fetches 72-hour hourly weather for the city centre from Open-Meteo (completely free, no key):

- `temperature_2m` — surface temperature (°C)
- `relative_humidity_2m` — humidity (%)
- `windspeed_10m` — wind speed at 10m height (km/h)
- `winddirection_10m` — wind direction (degrees)
- `boundary_layer_height` — planetary boundary layer height (m) — key predictor: when BLH is low (< 500m in winter mornings), pollutants are trapped near the surface, causing AQI spikes

---

## Data Folder Explained

```
data/
├── ward_boundaries/    ← GeoJSON ward polygons (not committed — download separately)
│   ├── README.md       ← Instructions for obtaining Delhi ward boundaries
│   └── delhi_wards.geojson  ← (you place this here manually)
│
└── training_data/      ← Cached AQI + weather CSVs for offline model training
    ├── README.md       ← Instructions for seeding data
    └── *.csv           ← (generated by running the seed script — not committed)
```

The `data/` folder is **intentionally empty** in the repository. Both subdirectories contain only README files explaining what to put there and how to get it. Large binary files (CSVs, GeoJSON) are git-ignored to keep the repo lightweight.

---

## Quick Start

### Backend
```bash
cd backend
python -m venv venv && venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env    # OPENAQ_API_KEY (v3 needs a free key), GROQ_API_KEY, NASA_FIRMS_MAP_KEY, SUPABASE_*
# Optional: run db/schema.sql in the Supabase SQL editor (PostGIS tables)
python scheduler.py --seed --days 7        # backfill history -> Supabase + data/training_data/*.csv
python models/forecaster.py --train --city delhi --days 90   # train + log RMSE vs persistence
uvicorn main:app --reload
# http://localhost:8000/docs  (Swagger UI)
pytest                                     # unit + API smoke tests
```
Without keys everything still runs on clearly-flagged mock data (`data_source: "mock"`).

### Frontend
```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:8000
npm run dev
# → http://localhost:5173
```

---

## API Reference

| Method | Endpoint | What it returns |
|---|---|---|
| GET | `/aqi/stations?city=` | Monitoring stations (delhi, mumbai, bengaluru, chennai, kolkata) |
| GET | `/aqi/live?city=` | Latest PM2.5 -> AQI readings + `data_age_minutes`; `data_source` = openaq / db / mock |
| GET | `/aqi/city/{city}` | City average + per-station breakdown + `data_age_minutes` |
| GET | `/aqi/history/{station_id}?city=&days=7` | Hourly history (OpenAQ -> Supabase -> mock) |
| GET | `/aqi/wards/{city}?with_aqi=true` | Ward boundary GeoJSON; optional IDW-interpolated AQI + `risk_level` per ward centroid |
| GET | `/forecast/{station_id}?city=&hours=72` | Weather-aware recursive XGBoost forecast + `metrics` (RMSE/MAE vs persistence, per-horizon, feature importance) |
| POST | `/forecast/train/{city}?days=90` | Train per-city model, 72-hour backtest, empirical quantile intervals |
| GET | `/forecast/metrics/{city}` | Stored metrics incl. per-horizon accuracy and drivers |
| GET | `/enforcement/{city}?limit=3&source_type=` | Ranked hotspots with source mix, `confidence`, `priority`, `receptor_station`, `distance_km`, `upwind` |
| GET | `/alerts/{city}?threshold=200&hours=24` | Stations breaching a threshold, with severity, exceedance, and observation age |
| GET | `/alerts?threshold=200&hours=24&limit=50` | Same alerts across all cities, sorted by AQI |
| GET | `/advisory/{city}?station_id=` | Health advisory in EN / HI / TA / KN |
| GET | `/advisory/{city}/wards` | Per-ward risk + vulnerable-population tags (schools, hospitals, workers) |
| GET | `/health` | Server health check |

---

## External APIs — All Free Tier

| API | Free Limit | Used For |
|---|---|---|
| **OpenAQ v3** | Free API key (rate-limited) | Live + historical PM2.5 from CAAQMS stations |
| **Open-Meteo** | Completely free | 72-hour hourly weather forecast grid |
| **NASA FIRMS** | Free with map key | VIIRS fire/thermal anomaly detections (375m) |
| **OSM Overpass** | Free, rate-limited | Industrial land-use polygons around Delhi |
| **Groq (llama3-8b)** | 14,400 req/day | Enforcement summaries + bilingual advisories |
| **Supabase** | 500 MB, 50k rows/month | PostgreSQL persistence |
| **Vercel** | 100 GB bandwidth | React frontend hosting |
| **Render.com** | 750 hrs/month | FastAPI backend hosting |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI 0.115, uvicorn, httpx (async HTTP) |
| Scheduling | APScheduler 3.10 (AsyncIOScheduler, interval jobs) |
| ML | XGBoost 2.1, scikit-learn 1.5, pandas 2.2, numpy 2.1 |
| LLM | Groq SDK, model: llama3-8b-8192 |
| Database | Supabase (supabase-py client), PostgreSQL |
| Frontend | React 18, Vite 8, Tailwind CSS 3 |
| Maps | Leaflet 1.9, react-leaflet 4 |
| Charts | Recharts 2 |
| HTTP client | Axios |

---

## Deployment

**Backend:**
1. Connect GitHub → select `backend/` as root
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add env vars: `OPENAQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `GROQ_API_KEY`, `NASA_FIRMS_MAP_KEY`

**Frontend:**
1. Connect GitHub → select `frontend/` as root
2. Framework: Vite (auto-detected)
3. Add env var: `VITE_API_URL=https://your-app.onrender.com`

---
