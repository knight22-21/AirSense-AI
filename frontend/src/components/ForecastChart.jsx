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
  Legend,
} from 'recharts'
import { useForecast } from '../hooks/useAQI'

const AQI_THRESHOLDS = [
  { value: 50,  label: 'Good',       color: '#00e400' },
  { value: 100, label: 'Moderate',   color: '#ffff00' },
  { value: 150, label: 'Sensitive',  color: '#ff7e00' },
  { value: 200, label: 'Unhealthy',  color: '#ff0000' },
  { value: 300, label: 'Very',       color: '#8f3f97' },
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
    <div className="bg-surface-2 border border-slate-600 rounded p-2 text-xs">
      <p className="text-slate-300 mb-1">{label}</p>
      <p className="font-bold" style={{ color: payload[0]?.stroke }}>
        AQI: {aqi?.toFixed(1)}
      </p>
      {payload[1] && (
        <p className="text-slate-400">PM2.5: {payload[1].value?.toFixed(1)} µg/m³</p>
      )}
    </div>
  )
}

export default function ForecastChart({ station, city = 'delhi' }) {
  const { forecast, loading, error } = useForecast(station?.id, city)
  const drivers = useMemo(
    () => topDrivers(forecast?.metrics?.feature_importance),
    [forecast]
  )

  if (!station) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        Select a station on the map to view its 72-hour forecast
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm animate-pulse">
        Loading forecast…
      </div>
    )
  }

  if (error || !forecast) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        Forecast unavailable
      </div>
    )
  }

  // Downsample to every 2 hours to keep chart readable
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
      <h3 className="text-sm font-semibold text-slate-300 mb-2">
        72-Hour AQI Forecast — {forecast.station_name}
      </h3>
      <div className="flex flex-wrap gap-1 mb-3 text-xs">
        <span className={`px-2 py-0.5 rounded-full font-medium ${
          forecast.model === 'xgboost'
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-slate-700 text-slate-300'
        }`}>
          {forecast.model === 'xgboost' ? '🤖 XGBoost model' : '📊 Statistical fallback'}
        </span>
        {forecast.metrics?.rmse != null && (
          <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-300">
            RMSE {Number(forecast.metrics.rmse).toFixed(1)}
            {forecast.metrics.persistence_rmse != null &&
              ` vs ${Number(forecast.metrics.persistence_rmse).toFixed(1)} persistence`}
          </span>
        )}
        {forecast.metrics?.horizon_hours != null && forecast.metrics.horizon_hours < 72 && (
          <span
            className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300"
            title="Backtest horizon is limited by available history"
          >
            validated on {forecast.metrics.horizon_hours}h backtest
          </span>
        )}
        {forecast.data_source === 'mock' && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">⚠ Demo data</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={points} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            interval={5}
            angle={-35}
            textAnchor="end"
            height={40}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            domain={[0, 'auto']}
            label={{ value: 'AQI', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
          />
          <Tooltip content={<CustomTooltip />} />
          {AQI_THRESHOLDS.map(t => (
            <ReferenceLine
              key={t.value}
              y={t.value}
              stroke={t.color}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{ value: t.label, position: 'right', fill: t.color, fontSize: 9 }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="aqi"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={false}
            name="AQI"
          />
          <Line
            type="monotone"
            dataKey="pm25"
            stroke="#a78bfa"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            name="PM2.5"
          />
        </LineChart>
      </ResponsiveContainer>
      {drivers.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-700/60">
          <p className="text-xs font-medium text-slate-400 mb-1">Main forecast drivers</p>
          <div className="space-y-1">
            {drivers.map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 w-32 truncate">{label}</span>
                <div className="flex-1 h-1.5 bg-slate-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
                  />
                </div>
                <span className="text-slate-500 w-9 text-right">
                  {(value * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-1 text-right">
        Generated: {new Date(forecast.generated_at).toLocaleString()}
      </p>
    </div>
  )
}
