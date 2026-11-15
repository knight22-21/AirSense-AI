"""XGBoost AQI forecaster (per-city model, recursive multi-step, weather-aware).

Train:   python models/forecaster.py --train [--city delhi] [--days 90]
Predict: AQIForecaster.predict(...) — falls back to a diurnal statistical forecast
         only when there is not enough data to train/use a model.
"""
import os
import sys
import pickle
import logging
import asyncio
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import xgboost as xgb
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    logger.warning("XGBoost not available — using statistical fallback")

LAGS = [1, 2, 3, 6, 12, 24]
WEATHER_COLS = ["temp", "hum", "wspd", "wsin", "wcos", "blh"]
FEATURES = (["hour_sin", "hour_cos", "dow", "month", "is_weekend"]
            + [f"lag_{l}" for l in LAGS]
            + ["roll_mean_6", "roll_std_6", "roll_mean_24"] + WEATHER_COLS)
_W_DEFAULT = {"temp": 28.0, "hum": 50.0, "wspd": 5.0, "wsin": 0.0, "wcos": -1.0, "blh": 800.0}
MIN_TRAIN_ROWS = 72
MAX_BACKTEST_H = 72   # evaluate the full 72-hour product horizon when data allows
MIN_BACKTEST_H = 6
Z80 = 1.28  # fallback 80% interval when empirical quantiles are unavailable


# ------------------------------------------------------------------
# Data prep
# ------------------------------------------------------------------

def prepare_series(readings: List[Dict]) -> pd.Series:
    """Raw readings -> regular hourly UTC AQI series (short gaps interpolated)."""
    df = pd.DataFrame(readings)
    if df.empty or "aqi" not in df.columns:
        return pd.Series(dtype=float)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df["aqi"] = pd.to_numeric(df["aqi"], errors="coerce")
    df = df.dropna(subset=["timestamp", "aqi"])
    s = df.groupby(df["timestamp"].dt.floor("h"))["aqi"].mean().sort_index()
    if s.empty:
        return s
    return s.asfreq("h").interpolate(limit=6).dropna()


def weather_frame(weather: List[Dict]) -> pd.DataFrame:
    if not weather:
        return pd.DataFrame(columns=WEATHER_COLS)
    df = pd.DataFrame(weather)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["timestamp"]).drop_duplicates("timestamp").set_index("timestamp").sort_index()
    rad = np.radians(df["wind_direction"].astype(float))
    return pd.DataFrame({
        "temp": df["temperature"].astype(float), "hum": df["humidity"].astype(float),
        "wspd": df["wind_speed"].astype(float), "wsin": np.sin(rad), "wcos": np.cos(rad),
        "blh": df["boundary_layer_height"].astype(float),
    })


def _align_weather(wdf: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    if wdf.empty:
        return pd.DataFrame({c: _W_DEFAULT[c] for c in WEATHER_COLS}, index=index)
    out = wdf.reindex(wdf.index.union(index)).sort_index().interpolate(limit_direction="both").reindex(index)
    return out.fillna(pd.Series(_W_DEFAULT))


def _training_frame(s: pd.Series, wdf: pd.DataFrame) -> pd.DataFrame:
    df = pd.DataFrame({"aqi": s})
    idx = df.index
    df["hour_sin"] = np.sin(2 * np.pi * idx.hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * idx.hour / 24)
    df["dow"], df["month"] = idx.dayofweek, idx.month
    df["is_weekend"] = (idx.dayofweek >= 5).astype(int)
    for l in LAGS:
        df[f"lag_{l}"] = s.shift(l)
    past = s.shift(1)  # features may only use data strictly before the target hour
    df["roll_mean_6"] = past.rolling(6, min_periods=3).mean()
    df["roll_std_6"] = past.rolling(6, min_periods=3).std().fillna(0)
    df["roll_mean_24"] = past.rolling(24, min_periods=6).mean()
    df = df.join(_align_weather(wdf, idx))
    return df.dropna()


def _feature_row(ts: pd.Timestamp, vals: List[float], w: Dict[str, float]) -> List[float]:
    """Mirror of _training_frame for one step; `vals` ends at ts-1h."""
    a = np.asarray(vals, dtype=float)
    r6, r24 = a[-6:], a[-24:]
    row = {
        "hour_sin": np.sin(2 * np.pi * ts.hour / 24), "hour_cos": np.cos(2 * np.pi * ts.hour / 24),
        "dow": ts.dayofweek, "month": ts.month, "is_weekend": int(ts.dayofweek >= 5),
        "roll_mean_6": r6.mean(), "roll_std_6": r6.std(ddof=1) if len(r6) > 1 else 0.0,
        "roll_mean_24": r24.mean(), **w,
    }
    for l in LAGS:
        row[f"lag_{l}"] = a[-l]
    return [row[f] for f in FEATURES]


def _roll(model, vals: List[float], last_ts: pd.Timestamp, wdf: pd.DataFrame, steps: int) -> List[float]:
    """Recursive multi-step prediction from the hour after last_ts."""
    vals = list(vals)
    future = pd.date_range(last_ts + pd.Timedelta(hours=1), periods=steps, freq="h")
    w_al = _align_weather(wdf, future)
    preds = []
    for ts, (_, wrow) in zip(future, w_al.iterrows()):
        p = float(np.clip(model.predict(np.array([_feature_row(ts, vals, wrow.to_dict())]))[0], 0, 500))
        preds.append(p)
        vals.append(p)
    return preds


# ------------------------------------------------------------------
# Forecaster
# ------------------------------------------------------------------

class AQIForecaster:
    MODEL_DIR = os.path.dirname(__file__)

    def __init__(self):
        self._models: Dict[str, Dict] = {}

    def _path(self, city: str) -> str:
        return os.path.join(self.MODEL_DIR, f"aqi_{city}.pkl")

    def get_bundle(self, city: str) -> Optional[Dict]:
        if city in self._models:
            return self._models[city]
        if ML_AVAILABLE and os.path.exists(self._path(city)):
            try:
                with open(self._path(city), "rb") as f:
                    bundle = pickle.load(f)
                # Models trained before empirical quantiles/metrics were added are stale:
                # ignore them so the next request bootstraps a fresh in-memory model.
                if "q_low" not in bundle or "feature_importance" not in bundle.get("metrics", {}):
                    logger.warning(f"Ignoring stale model for {city}; retrain to refresh metrics")
                    return None
                self._models[city] = bundle
                return bundle
            except Exception as e:
                logger.warning(f"Model load failed for {city}: {e}")
        return None

    def metrics(self, city: str) -> Optional[Dict]:
        b = self.get_bundle(city)
        return b["metrics"] if b else None

    # -- training ----------------------------------------------------

    def _fit(self, station_readings: Dict[str, List[Dict]], weather: List[Dict]) -> Optional[Dict]:
        """Fit a model and backtest it over the product horizon. Returns a bundle or None."""
        if not ML_AVAILABLE:
            return None
        wdf = weather_frame(weather)
        train_parts, test_series = [], []
        for sid, readings in station_readings.items():
            s = prepare_series(readings)
            frame = _training_frame(s, wdf)
            if len(frame) < MIN_TRAIN_ROWS:
                continue
            split = int(len(frame) * 0.8)
            train_parts.append(frame.iloc[:split])
            test_series.append((sid, s, frame.index[split]))
        if not train_parts:
            return None

        train = pd.concat(train_parts)
        model = xgb.XGBRegressor(n_estimators=300, learning_rate=0.05, max_depth=5,
                                 subsample=0.8, colsample_bytree=0.8, random_state=42)
        model.fit(train[FEATURES].values, train["aqi"].values)

        # Use the largest horizon that fits every held-out segment at least twice. For a
        # 90-day history this is the full 72 h; for a 14-day lazy bootstrap it is shorter.
        eligible = []
        for sid, s, test_start in test_series:
            pos = s.index.get_loc(test_start)
            span = len(s) - pos
            horizon = min(MAX_BACKTEST_H, span // 2)
            if horizon >= MIN_BACKTEST_H:
                eligible.append((sid, s, pos, horizon))
        if not eligible:
            return None
        horizon = min(item[3] for item in eligible)

        err_m, err_p = [], []  # shape (origins, horizon)
        for sid, s, pos, _ in eligible:
            for i in range(pos, len(s) - horizon, 12):
                if i < 24:
                    continue
                preds = _roll(model, s.iloc[:i + 1].tolist(), s.index[i], wdf, horizon)
                actual = s.iloc[i + 1:i + 1 + horizon].values
                # Same hour yesterday for h <= 24; flat last observation beyond that
                # (a fair baseline cannot peek at future observations).
                persist = np.array([
                    s.iloc[i + h - 24] if h <= 24 else s.iloc[i]
                    for h in range(1, horizon + 1)
                ])
                err_m.append(np.array(preds) - actual)
                err_p.append(persist - actual)
        if not err_m:
            return None

        em, ep = np.vstack(err_m), np.vstack(err_p)
        max_h = em.shape[1]
        sigma = em.std(axis=0).tolist()
        q_low = np.quantile(em, 0.1, axis=0).tolist()    # empirical 80% residual interval
        q_high = np.quantile(em, 0.9, axis=0).tolist()

        per_horizon = []
        for h in range(max_h):
            e, p = em[:, h], ep[:, h]
            per_horizon.append({
                "horizon": h + 1,
                "rmse": round(float(np.sqrt((e ** 2).mean())), 2),
                "persistence_rmse": round(float(np.sqrt((p ** 2).mean())), 2),
                "mae": round(float(np.abs(e).mean()), 2),
                "persistence_mae": round(float(np.abs(p).mean()), 2),
                "samples": int(e.shape[0]),
            })

        feature_importance = {name: round(float(value), 4)
                              for name, value in zip(FEATURES, model.feature_importances_)}
        metrics = {
            "rmse": round(float(np.sqrt((em ** 2).mean())), 2),
            "persistence_rmse": round(float(np.sqrt((ep ** 2).mean())), 2),
            "mae": round(float(np.abs(em).mean()), 2),
            "persistence_mae": round(float(np.abs(ep).mean()), 2),
            "samples": int(len(train)), "backtest_origins": int(len(em)),
            "horizon_hours": int(max_h), "per_horizon": per_horizon,
            "feature_importance": feature_importance,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }
        metrics["improvement_pct"] = round(100 * (1 - metrics["rmse"] / metrics["persistence_rmse"]), 1) \
            if metrics["persistence_rmse"] else None
        return {"model": model, "sigma": sigma, "q_low": q_low, "q_high": q_high,
                "metrics": metrics}

    def train(self, city: str, station_readings: Dict[str, List[Dict]], weather: List[Dict],
              persist: bool = True) -> Dict:
        """Pool all stations of a city, backtest vs persistence and optionally persist."""
        bundle = self._fit(station_readings, weather)
        if bundle is None:
            return {"trained": False,
                    "error": f"Need >= {MIN_TRAIN_ROWS} hourly points per station and enough "
                             "held-out data to backtest"}
        metrics = bundle["metrics"]
        if persist:
            self._models[city] = bundle
            self._save(city)
            logger.info(f"[{city}] trained: RMSE={metrics['rmse']} vs persistence {metrics['persistence_rmse']}")
        return {"trained": True, "city": city, **metrics}

    # -- prediction --------------------------------------------------

    def predict(self, city: str, readings: List[Dict], weather: List[Dict],
                hours: int = 72) -> Tuple[List[Dict], str, Optional[Dict]]:
        """Returns (forecast points, model_name, model_metrics)."""
        s = prepare_series(readings)
        now = pd.Timestamp.now(tz="UTC").floor("h")
        bundle = self.get_bundle(city)
        if bundle is None and ML_AVAILABLE and len(s) >= MIN_TRAIN_ROWS + 24:
            # Bootstrap an in-memory model from this station's history without overwriting
            # a persisted city model or writing a new pickle from a read request.
            bundle = self._fit({"_lazy": readings}, weather)
        if bundle is None or len(s) < 24 or now - s.index[-1] > pd.Timedelta(hours=48):
            base = float(s.tail(48).mean()) if len(s) else 150.0
            return self._statistical_forecast(base, hours), "statistical", None

        gap = max(0, int((now - s.index[-1]) / pd.Timedelta(hours=1)))
        preds = _roll(bundle["model"], s.tolist(), s.index[-1], weather_frame(weather), gap + hours)[gap:]
        sigma = bundle["sigma"]
        q_low, q_high = bundle.get("q_low"), bundle.get("q_high")
        out = []
        for h, p in enumerate(preds, start=1):
            if q_low and q_high and h <= len(q_low):
                lo, hi = p + q_low[h - 1], p + q_high[h - 1]
            else:
                sd = sigma[h - 1] if h <= len(sigma) else sigma[-1] * np.sqrt(h / len(sigma))
                ci = Z80 * max(sd, 5.0)
                lo, hi = p - ci, p + ci
            lo, hi = max(0.0, min(lo, p)), min(500.0, max(hi, p))
            ts = now + pd.Timedelta(hours=h)
            out.append({"timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"), "aqi": round(p, 1),
                        "pm25": round(_aqi_to_pm25(p), 1),
                        "confidence_lower": round(lo, 1),
                        "confidence_upper": round(hi, 1)})
        return out, "xgboost", bundle["metrics"]

    def _statistical_forecast(self, base_aqi: float, hours: int) -> List[Dict]:
        """Diurnal-pattern forecast used when there is not enough data for the model."""
        results = []
        start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        for h in range(hours):
            ts = start + timedelta(hours=h + 1)
            hod = ts.hour
            factor = 1.20 if 7 <= hod <= 10 else 1.15 if 17 <= hod <= 21 else 0.80 if 2 <= hod <= 5 else 1.0
            pred = max(10.0, base_aqi * factor)
            ci = 20 + h * 0.2
            results.append({"timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"), "aqi": round(pred, 1),
                            "pm25": round(_aqi_to_pm25(pred), 1),
                            "confidence_lower": round(max(0, pred - ci), 1),
                            "confidence_upper": round(pred + ci, 1)})
        return results

    def _save(self, city: str):
        try:
            with open(self._path(city), "wb") as f:
                pickle.dump(self._models[city], f)
        except Exception as e:
            logger.warning(f"Model save failed: {e}")


def _aqi_to_pm25(aqi: float) -> float:
    """Inverse of the EPA PM2.5 breakpoint table."""
    bp = [(0.0, 12.0, 0, 50), (12.1, 35.4, 51, 100), (35.5, 55.4, 101, 150), (55.5, 150.4, 151, 200),
          (150.5, 250.4, 201, 300), (250.5, 350.4, 301, 400), (350.5, 500.4, 401, 500)]
    for c_lo, c_hi, i_lo, i_hi in bp:
        if i_lo <= aqi <= i_hi:
            return (aqi - i_lo) * (c_hi - c_lo) / (i_hi - i_lo) + c_lo
    return 500.4 if aqi > 500 else 0.0


forecaster = AQIForecaster()


async def train_city(city: str, days: int = 90) -> Dict:
    """Fetch history + weather for every station of a city and train its model."""
    from services.openaq import fetch_stations, fetch_historical_aqi
    from services.weather import fetch_weather_forecast
    stations = (await fetch_stations(city))[:12]
    hist = await asyncio.gather(*[fetch_historical_aqi(s["id"], days, city) for s in stations])
    data = {s["id"]: h for s, h in zip(stations, hist)}
    weather = await fetch_weather_forecast(city, hours=24, past_days=min(days, 92))
    result = await asyncio.to_thread(forecaster.train, city, data, weather)
    if result.get("trained"):
        from db.supabase_client import save_metrics
        await save_metrics(city, result)
        result["data_source"] = "mock" if all(r.get("source") == "mock" for h in hist for r in h[:1]) else "live"
    return result


if __name__ == "__main__":
    import argparse
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", action="store_true")
    ap.add_argument("--city", default="delhi")
    ap.add_argument("--days", type=int, default=90)
    args = ap.parse_args()
    if args.train:
        print(asyncio.run(train_city(args.city, args.days)))
    else:
        ap.print_help()
