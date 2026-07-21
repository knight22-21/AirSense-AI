import React, { useState } from 'react'
import ForecastChart from './ForecastChart'
import EnforcementPanel from './EnforcementPanel'
import AdvisoryCard from './AdvisoryCard'

const TABS = [
  { id: 'forecast',    label: '📈 Forecast' },
  { id: 'enforcement', label: '⚠ Enforcement' },
  { id: 'advisory',   label: '🏥 Advisory' },
]

export default function Sidebar({ selectedStation, liveReadings, city, cityHasData }) {
  const [tab, setTab] = useState('forecast')

  const aqiValues = liveReadings.map(r => r.aqi).filter(Boolean)
  const avgAQI = aqiValues.length
    ? (aqiValues.reduce((a, b) => a + b, 0) / aqiValues.length).toFixed(0)
    : '--'
  const maxAQI = aqiValues.length ? Math.max(...aqiValues).toFixed(0) : '--'
  const minAQI = aqiValues.length ? Math.min(...aqiValues).toFixed(0) : '--'

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-1 p-3 border-b border-slate-700 bg-slate-800/60">
        <div className="text-center">
          <p className="text-xs text-slate-400">Avg AQI</p>
          <p className="text-xl font-bold text-blue-400">{avgAQI}</p>
        </div>
        <div className="text-center border-x border-slate-700">
          <p className="text-xs text-slate-400">Peak AQI</p>
          <p className="text-xl font-bold text-red-400">{maxAQI}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-400">Best AQI</p>
          <p className="text-xl font-bold text-green-400">{minAQI}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-slate-700 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'border-b-2 border-blue-500 text-blue-400 bg-slate-800/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!cityHasData ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-3xl mb-3">🏙️</p>
            <p className="text-slate-300 font-semibold text-sm">Data coming soon</p>
            <p className="text-slate-500 text-xs mt-2">
              Switch to <span className="text-blue-400 font-medium">Delhi</span> to see live data and forecasts.
            </p>
          </div>
        ) : (
          <>
            {tab === 'forecast' && <ForecastChart station={selectedStation} />}
            {tab === 'enforcement' && <EnforcementPanel city={city} />}
            {tab === 'advisory' && <AdvisoryCard city={city} />}
          </>
        )}
      </div>
    </div>
  )
}
