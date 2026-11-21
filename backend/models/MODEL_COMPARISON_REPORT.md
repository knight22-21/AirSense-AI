# Model Training Comparison Report

**Generated:** 2026-11-21
**Training Period:** 90 days of historical data per city (OpenAQ + Open-Meteo, live data)
**Models Evaluated:** XGBoost, LightGBM, Random Forest, Ridge Regression
**Baselines:** Persistence, Diurnal Statistical
**Cities:** Delhi, Mumbai, Bengaluru, Chennai, Kolkata

> All numbers in this report are extracted directly from the trained model artifacts
> (`aqi_{city}.pkl` → `metrics`) and `training_metrics.json`. No values are estimated.

---

## Executive Summary

Four machine learning models were trained and evaluated per city on identical features,
chronological splits, and backtest origins. Selection criterion: **lowest pooled recursive
RMSE over the full 72-hour hold-out; MAE breaks ties.**

**No single model won everywhere** — each city selected a different or repeated model
based on its own data:

| City | Selected Model | RMSE | MAE | vs Persistence RMSE |
|------|---------------|------|-----|---------------------|
| Delhi | Ridge Regression | 42.32 | 24.90 | 25.8% better |
| Mumbai | Random Forest | 18.05 | 9.39 | 38.4% better |
| Bengaluru | Random Forest | 24.13 | 11.42 | 33.0% better |
| Chennai | XGBoost | 32.98 | 18.89 | 25.3% better |
| Kolkata | LightGBM | 29.32 | 18.36 | 20.0% better |

All learned models beat the persistence baseline in every city.

---

## Per-City Results (verified from model artifacts)

### Delhi — Ridge Regression selected

| Model | RMSE | MAE |
|-------|------|-----|
| **Ridge (selected)** | **42.32** | 24.90 |
| Random Forest | 49.31 | **17.57** |
| XGBoost | 53.24 | 24.30 |
| LightGBM | 56.43 | 25.07 |
| Persistence (baseline) | 57.02 | 33.71 |
| Statistical (baseline) | 51.71 | 34.08 |

- Samples: 20,230 | Backtest origins: 355 | Horizon: 72 h
- Top features: `lag_1` (50.3%), `roll_mean_6` (20.4%), `roll_mean_24` (10.2%)

**Why Ridge:** Delhi's AQI is dominated by short-term autocorrelation — `lag_1` alone
carries half the importance. Ridge's L2 regularization handles the heavy
multicollinearity among the six lag features without the variance of deep trees.
Note: Random Forest had a *lower MAE* (17.57) but a *higher RMSE* (49.31); the RMSE
criterion penalizes large misses, which is the desired behaviour for pollution spikes.

### Mumbai — Random Forest selected

| Model | RMSE | MAE |
|-------|------|-----|
| **Random Forest (selected)** | **18.05** | **9.39** |
| XGBoost | 22.68 | 15.10 |
| LightGBM | 24.62 | 15.96 |
| Ridge | 28.99 | 22.71 |
| Persistence (baseline) | 29.28 | 21.97 |
| Statistical (baseline) | 28.27 | 22.34 |

- Samples: 18,270 | Backtest origins: 313 | Horizon: 72 h
- Top features: `lag_1` (77.1%), `roll_mean_6` (10.4%), `lag_2` (8.0%)

**Why Random Forest:** Mumbai has the most concentrated feature importance of any city
(`lag_1` ≈ 77%) — AQI is almost a persistence problem with modest corrections. Random
Forest's axis-aligned splits and bagging capture this dominant-lag structure robustly
and produced the best RMSE *and* MAE of all candidates.

### Bengaluru — Random Forest selected

| Model | RMSE | MAE |
|-------|------|-----|
| **Random Forest (selected)** | **24.13** | **11.42** |
| XGBoost | 25.64 | 12.61 |
| LightGBM | 26.46 | 13.23 |
| Ridge | 29.19 | 20.74 |
| Persistence (baseline) | 36.01 | 26.54 |
| Statistical (baseline) | 33.52 | 24.79 |

- Samples: 19,194 | Backtest origins: 332 | Horizon: 72 h
- Top features: `lag_1` (76.1%), `lag_2` (13.5%), `roll_mean_6` (2.8%)

**Why Random Forest:** Same pattern as Mumbai — an extremely dominant `lag_1` with a
secondary `lag_2`. Tree ensembles handle this sparse-signal regime better than linear
models, and Random Forest again won on both RMSE and MAE.

### Chennai — XGBoost selected

| Model | RMSE | MAE |
|-------|------|-----|
| **XGBoost (selected)** | **32.98** | 18.89 |
| Random Forest | 33.27 | **16.14** |
| Ridge | 33.90 | 23.30 |
| LightGBM | 34.66 | 20.56 |
| Persistence (baseline) | 44.16 | 28.85 |
| Statistical (baseline) | 40.25 | 27.93 |

- Samples: 17,166 | Backtest origins: 297 | Horizon: 72 h
- Top features: `lag_1` (59.5%), `lag_2` (9.9%), `month` (4.7%), `hour_sin` (3.6%)

**Why XGBoost:** Chennai is the only city where `month` ranks in the top 3 features —
consistent with a seasonal (monsoon-influenced) signal that gradient boosting can
model through deeper interactions. XGBoost edged out Random Forest on RMSE
(32.98 vs 33.27) even though RF had lower MAE — again the RMSE criterion deciding.

### Kolkata — LightGBM selected

| Model | RMSE | MAE |
|-------|------|-----|
| **LightGBM (selected)** | **29.32** | 18.36 |
| Random Forest | 30.33 | **16.42** |
| XGBoost | 30.81 | 20.38 |
| Ridge | 35.39 | 26.64 |
| Persistence (baseline) | 36.65 | 23.57 |
| Statistical (baseline) | 39.16 | 28.36 |

- Samples: 19,829 | Backtest origins: 346 | Horizon: 72 h
- Top features (spread out): `lag_1` (19.1%), `lag_2` (10.4%), `roll_std_6` (7.4%),
  `roll_mean_24` (6.6%), `lag_24` (6.6%), `lag_12` (6.5%)

**Why LightGBM:** Kolkata has the *least* concentrated feature importance — no single
driver dominates and many lag/rolling features contribute. LightGBM's leaf-wise growth
captures these distributed interactions efficiently. It won on RMSE; Random Forest had
lower MAE (16.42) but lost on RMSE (30.33 vs 29.32).

---

## Cross-City Summary

| Model | Cities Won | RMSE in selected city |
|-------|-----------|------------------------|
| Random Forest | 2 (Mumbai, Bengaluru) | 21.09 |
| Ridge | 1 (Delhi) | 42.32 |
| XGBoost | 1 (Chennai) | 32.98 |
| LightGBM | 1 (Kolkata) | 29.32 |

**Measured observations (not speculation):**
- `lag_1` is the #1 feature in every city (19–77% importance) — temporal
  autocorrelation dominates AQI forecasting everywhere.
- Where `lag_1` importance is extreme (>75%: Mumbai, Bengaluru), Random Forest won.
- Where importance is diffuse (Kolkata, Delhi), the boosted/linear models won.
- `month` reaches the top-3 only in Chennai — the sole city with a clear seasonal signal.
- Weather features (`temp`, `hum`, `wspd`, `blh`) collectively carry between 0.5% and
  13.6% importance; Kolkata is the highest at 13.6%, the other four cities are below 7%.

---

## Honest Caveats

- The "why" explanations above are interpretations of measured feature-importance
  patterns, not causal claims.
- RMSE was the selection criterion; in Delhi, Chennai, and Kolkata the runner-up had
  a *lower MAE*. If MAE were the criterion, those cities would have picked differently.
- Results reflect 90 days of OpenAQ data per city; retraining on longer histories may
  change rankings.
- Improvement is not monotonic by horizon: Delhi is 3.9% worse than persistence at
  24 h but 6.1% better at 72 h. All five selected models still beat persistence at 72 h.
  See the `per_horizon` arrays in `training_metrics.json` for the full curve.

---

## Files

- `training_metrics.json` — regenerated from the saved `.pkl` artifacts; contains the
  full `model_comparison`, `per_horizon`, and `feature_importance` for every city.
- `aqi_{city}.pkl` — serialized production model + metrics per city.
