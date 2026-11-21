import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { useForecast } from '../hooks/useAQI'

const AQI_THRESHOLDS = [
  { value: 50, label: 'Good', color: '#15803d' },
  { value: 100, label: 'Moderate', color: '#a16207' },
  { value: 150, label: 'Sensitive', color: '#c2410c' },
  { value: 200, label: 'Unhealthy', color: '#b91c1c' },
  { value: 300, label: 'Very', color: '#7e22ce' },
]

const DRIVER_LABELS = {
  hour_sin: 'Time of day', hour_cos: 'Time of day',
  dow: 'Day of week', month: 'Season', is_weekend: 'Weekend',
  roll_mean_6: 'Recent average (6h)', roll_mean_24: 'Recent average (24h)',
  roll_std_6: 'Recent volatility',
  temp: 'Temperature', hum: 'Humidity', wspd: 'Wind speed',
  wsin: 'Wind direction', wcos: 'Wind direction', blh: 'Boundary layer',
}

function driverLabel(key) {
  if (DRIVER_LABELS[key]) return DRIVER_LABELS[key]
  const lag = key.match(/^lag_(\d+)$/)
  return lag ? `AQI ${lag[1]}h ago` : key.replace(/_/g, ' ')
}

function topDrivers(importance, n = 4) {
  const merged = {}
  Object.entries(importance || {}).forEach(([key, value]) => {
    const label = driverLabel(key)
    merged[label] = (merged[label] || 0) + Number(value || 0)
  })
  return Object.entries(merged).sort((a, b) => b[1] - a[1]).slice(0, n)
}

function formatHour(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:00`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const aqi = payload[0]?.value
  return (
    <div className="rounded-md border border-gov-line bg-white p-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-gov-muted">{label}</p>
      <p className="font-bold" style={{ color: payload[0]?.stroke }}>
        AQI: {aqi?.toFixed(1)}
      </p>
      {payload[1] && (
        <p className="text-gov-muted">PM2.5: {payload[1].value?.toFixed(1)} µg/m³</p>
      )}
    </div>
  )
}

export default function ForecastChart({
  station,
  city = 'delhi',
  forecast: forecastProp,
  loading: loadingProp,
  error: errorProp,
}) {
  const isControlled = forecastProp !== undefined
  const hook = useForecast(station?.id, city, !isControlled)
  const forecast = isControlled ? forecastProp : hook.forecast
  const loading = loadingProp !== undefined ? loadingProp : hook.loading
  const error = errorProp !== undefined ? errorProp : hook.error

  const drivers = useMemo(
    () => topDrivers(forecast?.metrics?.feature_importance),
    [forecast]
  )

  if (!station) {
    return (
      <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-gov-line bg-gov-mist px-4 text-center text-sm text-gov-muted">
        Select a station to view its 72-hour forecast.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-52 flex-col items-center justify-center gap-3 text-sm text-gov-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-gov-navy" />
        Loading forecast…
      </div>
    )
  }

  if (error || !forecast) {
    return (
      <div className="flex h-52 items-center justify-center rounded-md border border-red-200 bg-red-50 px-4 text-center text-sm text-red-700">
        Forecast unavailable for this station. Retry after the next scheduled refresh.
      </div>
    )
  }

  const points = (forecast.forecasts || [])
    .filter((_, i) => i % 2 === 0)
    .map(f => ({
      time: formatHour(f.timestamp),
      aqi: f.aqi,
      pm25: f.pm25,
      lo: f.confidence_lower,
      hi: f.confidence_upper,
    }))

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="gov-label">72-hour AQI forecast</p>
          <h2 className="mt-1 font-serif text-xl font-bold text-gov-navy">{forecast.station_name}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            forecast.model === 'xgboost'
              ? 'bg-blue-50 text-blue-800'
              : 'bg-slate-100 text-slate-700'
          }`}>
            {forecast.model === 'xgboost' ? 'XGBoost model' : 'Statistical fallback'}
          </span>
          {forecast.metrics?.rmse != null && (
            <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-800">
              RMSE {Number(forecast.metrics.rmse).toFixed(1)}
              {forecast.metrics.persistence_rmse != null &&
                ` vs ${Number(forecast.metrics.persistence_rmse).toFixed(1)} persistence`}
            </span>
          )}
          {forecast.metrics?.horizon_hours != null && forecast.metrics.horizon_hours < 72 && (
            <span
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
              title="Backtest horizon is limited by available history"
            >
              validated on {forecast.metrics.horizon_hours}h backtest
            </span>
          )}
          {forecast.data_source === 'mock' && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Demo data</span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points} margin={{ top: 8, right: 18, left: -8, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#5b6b7f', fontSize: 10 }}
              interval={5}
              angle={-35}
              textAnchor="end"
              height={45}
            />
            <YAxis
              tick={{ fill: '#5b6b7f', fontSize: 10 }}
              domain={[0, 'auto']}
              label={{ value: 'AQI', angle: -90, position: 'insideLeft', fill: '#5b6b7f', fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            {AQI_THRESHOLDS.map(t => (
              <ReferenceLine
                key={t.value}
                y={t.value}
                stroke={t.color}
                strokeDasharray="4 4"
                strokeOpacity={0.45}
                label={{ value: t.label, position: 'right', fill: t.color, fontSize: 9 }}
              />
            ))}
            <Line type="monotone" dataKey="aqi" stroke="#0b3d6b" strokeWidth={2.5} dot={false} name="AQI" />
            <Line
              type="monotone"
              dataKey="pm25"
              stroke="#e08a00"
              strokeWidth={1.7}
              dot={false}
              strokeDasharray="4 2"
              name="PM2.5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {drivers.length > 0 && (
        <div className="mt-4 border-t border-gov-line pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gov-muted">Main forecast drivers</p>
          <div className="mt-2 space-y-2">
            {drivers.map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-36 truncate text-gov-muted">{label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                  <div
                    className="h-full rounded bg-gov-navy"
                    style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
                  />
                </div>
                <span className="w-10 text-right font-semibold text-gov-ink">
                  {(value * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-right text-[11px] text-gov-muted">
        Generated: {new Date(forecast.generated_at).toLocaleString('en-IN')}
      </p>
    </div>
  )
}
