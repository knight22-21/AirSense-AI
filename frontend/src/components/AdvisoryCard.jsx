import React, { useEffect, useState } from 'react'
import { useAdvisory, useWardAdvisories } from '../hooks/useAQI'

const RISK_CONFIG = {
  'Good': { color: '#15803d', bg: '#f0fdf4' },
  'Moderate': { color: '#a16207', bg: '#fefce8' },
  'Unhealthy for Sensitive Groups': { color: '#c2410c', bg: '#fff7ed' },
  'Unhealthy': { color: '#b91c1c', bg: '#fef2f2' },
  'Very Unhealthy': { color: '#7e22ce', bg: '#faf5ff' },
  'Hazardous': { color: '#7f1d1d', bg: '#fef2f2' },
}

const LANGS = [
  { id: 'en', label: 'English', field: 'advisory_en' },
  { id: 'hi', label: 'हिन्दी', field: 'advisory_hi' },
  { id: 'ta', label: 'தமிழ்', field: 'advisory_ta' },
  { id: 'kn', label: 'ಕನ್ನಡ', field: 'advisory_kn' },
]

function WardCards({ wards, selected, onSelect }) {
  if (!wards.length) return null
  const sorted = [...wards].sort((a, b) => (b.aqi || 0) - (a.aqi || 0))
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2">
        <p className="gov-label">Risk by ward</p>
        <span className="text-[11px] text-gov-muted">Select a ward for its advisory</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {sorted.map(w => {
          const cfg = RISK_CONFIG[w.risk_level] || RISK_CONFIG['Moderate']
          const active = selected === w.station_id
          return (
            <button
              key={w.station_id}
              type="button"
              onClick={() => onSelect(active ? null : w.station_id)}
              className={`rounded-md border p-2.5 text-left transition-colors hover:border-gov-navy ${
                active ? 'border-gov-navy ring-1 ring-gov-navy' : ''
              }`}
              style={{ background: cfg.bg, borderColor: active ? undefined : cfg.color + '55' }}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-semibold text-gov-navy">{w.name}</span>
                <span className="text-sm font-bold" style={{ color: cfg.color }}>
                  {w.aqi ? Math.round(w.aqi) : '--'}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] font-semibold" style={{ color: cfg.color }}>{w.risk_level}</p>
              {w.vulnerable_tags?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {w.vulnerable_tags.slice(0, 3).map((t, i) => (
                    <span key={i} className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-700">
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
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-gov-muted">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-gov-navy" />
          Generating advisory…
        </div>
        {wardList}
      </div>
    )
  }

  if (!advisory) {
    return (
      <div>
        <div className="rounded-md border border-dashed border-gov-line bg-gov-mist px-4 py-8 text-center text-sm text-gov-muted">
          Advisory unavailable for this city.
        </div>
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
        className="rounded-lg border p-4"
        style={{ background: cfg.bg, borderColor: cfg.color + '55' }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="gov-label">
              {advisory.station_name
                ? advisory.station_name
                : `${city.charAt(0).toUpperCase() + city.slice(1)} air quality`}
            </p>
            <p className="mt-1 font-serif text-lg font-bold" style={{ color: cfg.color }}>
              {advisory.risk_level}
            </p>
          </div>
          <div className="text-right">
            <p className="font-serif text-3xl font-bold" style={{ color: cfg.color }}>
              {advisory.aqi_value?.toFixed(0) ?? '—'}
            </p>
            <p className="text-[11px] font-semibold text-gov-muted">AQI</p>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1">
          {LANGS.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                lang === l.id
                  ? 'bg-gov-navy text-white'
                  : 'bg-white/70 text-gov-muted hover:bg-white hover:text-gov-navy'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <p className="mb-3 text-sm leading-relaxed text-gov-ink">{text}</p>

        {advisory.vulnerable_groups?.length > 0 && (
          <div className="mt-2 border-t border-black/10 pt-3">
            <p className="mb-1 text-xs font-bold text-gov-muted">Vulnerable groups</p>
            <div className="flex flex-wrap gap-1">
              {advisory.vulnerable_groups.map((g, i) => (
                <span
                  key={i}
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ background: cfg.color + '18', color: cfg.color }}
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-right text-[11px] text-gov-muted">
          Updated: {new Date(advisory.generated_at).toLocaleTimeString('en-IN')}
        </p>
      </div>

      {wardList}
    </div>
  )
}
