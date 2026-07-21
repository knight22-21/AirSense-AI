# Training Data Cache

Cached AQI + weather CSVs used to train the XGBoost forecasting model offline.

## Why cache?

The OpenAQ API has rate limits and latency. Pre-downloading 30–90 days of data
lets you retrain the model instantly without hitting the API each time.

## Expected files

| File | Columns | Description |
|---|---|---|
| `delhi_pm25_30d.csv` | timestamp, station_id, station_name, value, aqi | 30 days of PM2.5 from OpenAQ |
| `delhi_weather_30d.csv` | timestamp, temp, humidity, wind_speed, wind_dir, blh | 30 days from Open-Meteo |
| `delhi_merged_features.csv` | All of the above merged + lag features | Ready-to-train feature set |

## How to generate

```bash
# From the backend directory:
python -c "
import asyncio
from services.openaq import fetch_historical_aqi
import pandas as pd

async def seed():
    for station_id in ['anand-vihar', 'rk-puram', 'punjabi-bagh']:
        data = await fetch_historical_aqi(station_id, days=30)
        df = pd.DataFrame(data)
        df.to_csv(f'../data/training_data/{station_id}_30d.csv', index=False)
        print(f'Saved {len(df)} rows for {station_id}')

asyncio.run(seed())
"
```

## Training the model

```bash
# POST to the train endpoint once data is available:
curl -X POST http://localhost:8000/forecast/train/anand-vihar
# Returns: {"trained": true, "rmse": 18.4, "persistence_rmse": 22.1, "samples": 680}
```

The RMSE vs persistence baseline shows how much better the XGBoost model is
compared to simply predicting "tomorrow = today".

## Note

These files are git-ignored (can be 10–50 MB each). Generate them locally.
