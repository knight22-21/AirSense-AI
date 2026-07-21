import React, { useState } from 'react'
import { useAdvisory } from '../hooks/useAQI'

const RISK_CONFIG = {
  'Good':                        { color: '#00e400', bg: '#00e40018', icon: '😊' },
  'Moderate':                    { color: '#ffff00', bg: '#ffff0018', icon: '😐' },
  'Unhealthy for Sensitive Groups': { color: '#ff7e00', bg: '#ff7e0018', icon: '😷' },
  'Unhealthy':                   { color: '#ff0000', bg: '#ff000018', icon: '🚨' },
  'Very Unhealthy':              { color: '#8f3f97', bg: '#8f3f9718', icon: '⛔' },
  'Hazardous':                   { color: '#7e0023', bg: '#7e002318', icon: '☠️' },
}

export default function AdvisoryCard({ city = 'delhi' }) {
  const { advisory, loading } = useAdvisory(city)
  const [lang, setLang] = useState('en')

  if (loading) {
    return (
      <div className="text-slate-400 text-sm animate-pulse py-4 text-center">
        Generating advisory…
      </div>
    )
  }

  if (!advisory) {
    return (
      <div className="text-slate-500 text-sm py-4 text-center">
        Advisory unavailable
      </div>
    )
  }

  const cfg = RISK_CONFIG[advisory.risk_level] || RISK_CONFIG['Moderate']

  return (
    <div
      className="rounded-lg p-4 border"
      style={{ background: cfg.bg, borderColor: cfg.color + '55' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{cfg.icon}</span>
          <div>
            <p className="text-xs text-slate-400">{city.charAt(0).toUpperCase() + city.slice(1)} Air Quality</p>
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
      <div className="flex gap-1 mb-3">
        {['en', 'hi'].map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              lang === l
                ? 'bg-slate-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {l === 'en' ? 'English' : 'हिंदी'}
          </button>
        ))}
      </div>

      {/* Advisory text */}
      <p className="text-sm text-slate-200 leading-relaxed mb-3">
        {lang === 'en' ? advisory.advisory_en : advisory.advisory_hi}
      </p>

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
  )
}
