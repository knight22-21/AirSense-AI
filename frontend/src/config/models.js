const MODEL_LABELS = {
  xgboost: 'XGBoost',
  lightgbm: 'LightGBM',
  random_forest: 'Random Forest',
  ridge: 'Ridge Regression',
  statistical: 'Statistical fallback',
}

export function modelLabel(model) {
  return MODEL_LABELS[model] || 'ML model'
}
