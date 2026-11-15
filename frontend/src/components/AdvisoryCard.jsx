import React, { useEffect, useState } from 'react'
import { useAdvisory, useWardAdvisories } from '../hooks/useAQI'

const RISK_CONFIG = {
  'Good':                        { color: '#00e400', bg: '#00e40018', icon: '😊' },
  'Moderate':                    { color: '#ffff00', bg: '#ffff0018', icon: '😐' },
  'Unhealthy for Sensitive Groups': { color: '#ff7e00', bg: '#ff7e0018', icon: '😷' },
  'Unhealthy':                   { color: '#ff0000', bg: '#ff000018', icon: '🚨' },
  'Very Unhealthy':              { color: '#8f3f97', bg: '#8f3f9718', icon: '⛔' },
  'Hazardous':                   { color: '#7e0023', bg: '#7e002318', icon: '☠️' },
}

const LANGS = [
  { id: 'en', label: 'English', field: 'advisory_en' },
  { id: 'hi', label: 'हिन्दी',   field: 'advisory_hi' },
  { id: 'ta', label: 'தமிழ்',    field: 'advisory_ta' },
  { id: 'kn', label: 'ಕನ್ನಡ',    field: 'advisory_kn' },
]

function WardCards({ wards, selected, onSelect }) {
  if (!wards.length) return null
  const sorted = [...wards].sort((a, b) => (b.aqi || 0) - (a.aqi || 0))
  return (
    <div className="mt-4">
      <p className="text-xs text-slate-400 mb-2 font-medium">Risk by ward — tap for advisory</p>
      <div className="grid grid-cols-2 gap-2">
        {sorted.map(w => {
          const cfg = RISK_CONFIG[w.risk_level] || RISK_CONFIG['Moderate']
          const active = selected === w.station_id
          return (
            <button
              key={w.station_id}
              onClick={() => onSelect(active ? null : w.station_id)}
              className="text-left rounded-lg p-2 border transition-colors"
              style={{
                background: cfg.bg,
                borderColor: active ? '#fff' : cfg.color + '55',
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-slate-200 font-medium truncate">{w.name}</span>
                <span className="text-sm font-black" style={{ color: cfg.color }}>
                  {w.aqi ? Math.round(w.aqi) : '--'}
                </span>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: cfg.color }}>{w.risk_level}</p>
              {w.vulnerable_tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {w.vulnerable_tags.slice(0, 3).map((t, i) => (
                    <span key={i} className="text-[10px] px-1.5 rounded-full bg-slate-800 text-slate-300">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AdvisoryCard({ city = 'delhi' }) {
  const [stationId, setStationId] = useState(null)
  const { advisory, loading } = useAdvisory(city, stationId)
  const { wards } = useWardAdvisories(city)
  const [lang, setLang] = useState('en')

  useEffect(() => { setStationId(null) }, [city])

  const wardList = <WardCards wards={wards} selected={stationId} onSelect={setStationId} />

  if (loading) {
    return (
      <div>
        <div className="text-slate-400 text-sm animate-pulse py-4 text-center">
          Generating advisory…
        </div>
        {wardList}
      </div>
    )
  }

  if (!advisory) {
    return (
      <div>
        <div className="text-slate-500 text-sm py-4 text-center">Advisory unavailable</div>
        {wardList}
      </div>
    )
  }

  const cfg = RISK_CONFIG[advisory.risk_level] || RISK_CONFIG['Moderate']
  const langDef = LANGS.find(l => l.id === lang) || LANGS[0]
  const text = advisory[langDef.field] || advisory.advisory_en

  return (
    <div>
      <div
        className="rounded-lg p-4 border"
        style={{ background: cfg.bg, borderColor: cfg.color + '55' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{cfg.icon}</span>
            <div>
              <p className="text-xs text-slate-400">
                {advisory.station_name
                  ? advisory.station_name
                  : `${city.charAt(0).toUpperCase() + city.slice(1)} Air Quality`}
              </p>
              <p className="font-bold text-sm" style={{ color: cfg.color }}>
                {advisory.risk_level}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black" style={{ color: cfg.color }}>
              {advisory.aqi_value?.toFixed(0)}
            </p>
            <p className="text-xs text-slate-400">AQI</p>
          </div>
        </div>

        {/* Language toggle */}
        <div className="flex flex-wrap gap-1 mb-3">
          {LANGS.map(l => (
            <button
              key={l.id}
              onClick={() => setLang(l.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                lang === l.id
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Advisory text */}
        <p className="text-sm text-slate-200 leading-relaxed mb-3">{text}</p>

        {/* Vulnerable groups */}
        {advisory.vulnerable_groups?.length > 0 && (
          <div className="border-t border-slate-700 pt-2 mt-2">
            <p className="text-xs text-slate-400 mb-1 font-medium">⚠ Vulnerable Groups</p>
            <div className="flex flex-wrap gap-1">
              {advisory.vulnerable_groups.map((g, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: cfg.color + '22', color: cfg.color }}
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-slate-500 mt-2 text-right">
          Updated: {new Date(advisory.generated_at).toLocaleTimeString()}
        </p>
      </div>

      {wardList}
    </div>
  )
}
