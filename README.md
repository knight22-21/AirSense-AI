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
│  No key required         temp, boundary        hotspots near Delhi)      │
│                          layer height)                                   │
│              │                   │                      │                │
│              └───────────────────┴──────────────────────┘               │
│                                  │                                       │
│                          APScheduler (30-min)                            │
│                          polls all three APIs                            │
│                                  │                                       │
│                     Supabase PostgreSQL                                  │
│                     (aqi_readings, forecasts tables)                     │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
┌──────────────────── FASTAPI BACKEND ──────────────────────────────────────┐
│                                                                            │
│  /aqi/*          /forecast/*         /enforcement/*      /advisory/*      │
│  Live + history  XGBoost forecast    Source attribution  Groq LLaMA3      │
│  OpenAQ data     engine              (FIRMS + OSM)       bilingual text    │
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

`scheduler.py` registers two async jobs that fire every 30 minutes:
- `_poll_aqi_data()` — calls OpenAQ v3 REST API, converts PM2.5 → AQI, upserts to Supabase
- `_poll_weather_data()` — calls Open-Meteo for 72-hour hourly weather grid

All HTTP calls use `httpx.AsyncClient` (non-blocking) with a 15–20 second timeout. Every external call has a **static mock fallback** so the app works with zero internet connectivity — important for hackathon demos.

---

### 3. AQI Forecasting — XGBoost + Feature Engineering

**Model:** `XGBRegressor` from XGBoost (gradient-boosted decision trees)

**Features engineered per reading** (`models/forecaster.py`):

| Feature group | Features |
|---|---|
| Calendar | hour-of-day, day-of-week, month, is_weekend |
| Lag features | AQI at t−1h, t−3h, t−6h, t−12h, t−24h |
| Rolling statistics | 6-hour rolling mean, 6-hour rolling std, 24-hour rolling mean |

**Why lags + rolling stats?** Air quality has strong temporal autocorrelation — AQI at 3 AM tomorrow is heavily influenced by AQI at 3 AM today and the past 6-hour trend. Lags and rolling features capture this without needing an explicit time-series model.

**Training:** 80/20 train-test split on station's last 30 days. RMSE is logged alongside a **persistence baseline** (predict tomorrow = today) to show real uplift.

**Fallback:** When the model hasn't been trained yet, a **diurnal statistical forecaster** is used. It applies empirically observed Delhi patterns: rush-hour peaks (7–10 AM × 1.2, 5–9 PM × 1.15) and pre-dawn lows (2–5 AM × 0.80) on top of the 24-hour rolling average, with Gaussian noise for realism.

---

### 4. Source Attribution — Spatial Scoring Engine

`services/attribution.py` builds a ranked list of enforcement hotspots by scoring candidate locations:

**Inputs:**
- NASA FIRMS VIIRS-SNPP fire detections (last 7 days, 375m resolution)
- OSM Overpass API industrial land-use polygons around Delhi

**Scoring algorithm per candidate:**

```
score = 0

# Fire radiative power (higher FRP = bigger burn)
score += min(frp × 2.5, 40)

# Detection confidence (FIRMS reports high / nominal / low)
score += {high: 25, nominal: 12, low: 0}[confidence]

# Industrial zone proximity (within 4 km → likely industrial emission, not just burning)
if nearest_industrial_zone < 4 km:
    score += 20

# High-AQI corridor bonus (pre-known hotspots get +45 base)
if location overlaps known high-pollution corridor:
    score += 45 + (count of nearby industrial zones × 6)

score = min(score, 100)  # cap at 100
```

**Haversine distance** is used throughout for precise great-circle distance between coordinates:

```python
def _dist_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
    return 2R·arcsin(√a)
```

Top 3 hotspots by score are returned with evidence tags and a source type label (`waste_burning`, `industrial_emission`, `industrial_cluster`).

---

### 5. LLM Integration — Groq + llama3-8b-8192

Two types of LLM-generated text via `services/llm.py`:

**Enforcement summaries** — for each hotspot, a targeted 2-sentence prompt:
```
"You are an air quality enforcement officer in Delhi.
Location: <locality>, Source: <type>, Evidence: <tags>, Score: N/100
Write exactly 2 sentences: Sentence 1 = immediate action. Sentence 2 = expected impact."
```

**Citizen advisories** — structured JSON output prompt:
```
"Generate a public health advisory for Delhi, AQI N (Risk level X).
Respond ONLY with valid JSON: {advisory_en, advisory_hi, vulnerable_groups}"
```

The model is constrained to `max_tokens=120–300` and `temperature=0.3` to keep outputs short and factual. All LLM calls have static fallback text so the app works without a Groq key.

**Why llama3-8b-8192?** It's the fastest model on Groq's free tier (14,400 req/day) and handles structured JSON output reliably at this short context length.

---

### 6. Geocoding & Maps — Leaflet + react-leaflet

**Station markers:** `CircleMarker` components coloured by AQI severity using the US EPA colour scale. Radius increases to 22px when selected for clear visual focus.

**Enforcement hotspots:** Custom `L.divIcon` rendered as an orange teardrop pin (CSS `border-radius: 50% 50% 50% 0; transform: rotate(-45deg)`), matching Google Maps pin conventions.

**City navigation:** `FlyToCity` uses Leaflet's `map.flyTo()` with a 1.2-second animation when a new city is selected from the dropdown.

**OSM tiles** are used as the base map (free, no API key) at 60% opacity so the dark UI background shows through.

---

### 7. City Selector — Scalability Story

The UI has a city dropdown with 5 cities: **Delhi** (live/mock data) and Mumbai, Bengaluru, Chennai, Kolkata (map renders, "Coming soon" overlay). This demonstrates the platform's multi-city architecture even though only Delhi has data in the MVP:

- Selecting any city flies the map to that city's coordinates
- Non-Delhi cities show a "data coming soon" overlay on the map and sidebar
- All hooks (`useAQIData`, `useEnforcement`, `useAdvisory`) accept a `city` param and re-fetch on change
- Backend returns a `404` for non-Delhi cities — frontend handles this gracefully without crashing

To extend to a new city: add its entry in `frontend/src/config/cities.js`, add its mock stations in `backend/services/openaq.py`, and update the backend router city allow-list.

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
cp .env.example .env    # Add SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY
uvicorn main:app --reload
# → http://localhost:8000/docs  (Swagger UI)
```

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
| GET | `/aqi/stations` | All monitoring stations for the city |
| GET | `/aqi/live` | Latest PM2.5 → AQI readings (all stations) |
| GET | `/aqi/city/delhi` | City-level average + per-station breakdown |
| GET | `/aqi/history/{station_id}?days=7` | Hourly historical readings (up to 30 days) |
| GET | `/forecast/{station_id}?hours=72` | XGBoost AQI forecast (24 / 48 / 72 hours) |
| POST | `/forecast/train/{station_id}` | Train / retrain XGBoost for a station |
| GET | `/enforcement/delhi` | Top-3 hotspots with evidence + Groq summaries |
| GET | `/advisory/delhi` | Bilingual (EN + HI) citizen health advisory |
| GET | `/health` | Server health check |

---

## External APIs — All Free Tier

| API | Free Limit | Used For |
|---|---|---|
| **OpenAQ v3** | No key needed | Live + historical PM2.5 from CAAQMS stations |
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
| Frontend | React 18, Vite 5, Tailwind CSS 3 |
| Maps | Leaflet 1.9, react-leaflet 4 |
| Charts | Recharts 2 |
| HTTP client | Axios |

---

## Deployment

**Backend:**
1. Connect GitHub → select `backend/` as root
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add env vars: `SUPABASE_URL`, `SUPABASE_KEY`, `GROQ_API_KEY`, `NASA_FIRMS_MAP_KEY`

**Frontend:**
1. Connect GitHub → select `frontend/` as root
2. Framework: Vite (auto-detected)
3. Add env var: `VITE_API_URL=https://your-app.onrender.com`

---
