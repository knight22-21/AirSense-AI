import React from 'react'
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

export default function ForecastChart({ station }) {
  const { forecast, loading, error } = useForecast(station?.id)

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
      <h3 className="text-sm font-semibold text-slate-300 mb-3">
        72-Hour AQI Forecast — {forecast.station_name}
      </h3>
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
      <p className="text-xs text-slate-500 mt-1 text-right">
        Generated: {new Date(forecast.generated_at).toLocaleString()}
      </p>
    </div>
  )
}
