import React from 'react'
import { useEnforcement } from '../hooks/useAQI'

const SOURCE_LABELS = {
  fire_hotspot:         '🔥 Waste Burning',
  waste_burning:        '🔥 Waste Burning',
  industrial_emission:  '🏭 Industrial Emission',
  industrial_cluster:   '🏭 Industrial Cluster',
  traffic_corridor:     '🚗 Traffic Corridor',
}

function ScoreBadge({ score }) {
  const color =
    score >= 75 ? '#ff0000' :
    score >= 50 ? '#ff7e00' :
    score >= 25 ? '#ffff00' :
    '#00e400'
  return (
    <span
      className="text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: color + '33', color }}
    >
      {score}/100
    </span>
  )
}

export default function EnforcementPanel({ city = 'delhi' }) {
  const { hotspots, loading } = useEnforcement(city)

  if (loading) {
    return (
      <div className="text-slate-400 text-sm animate-pulse py-4 text-center">
        Analysing enforcement hotspots…
      </div>
    )
  }

  if (!hotspots.length) {
    return (
      <div className="text-slate-500 text-sm py-4 text-center">
        No hotspots detected
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {hotspots.map(h => (
        <div
          key={h.rank}
          className="bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-orange-500 transition-colors"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <span className="text-orange-400 font-bold text-sm">#{h.rank}</span>
              <span className="text-slate-200 font-semibold text-sm">{h.location}</span>
            </div>
            <ScoreBadge score={h.score} />
          </div>

          <p className="text-xs text-slate-400 mb-2">
            {SOURCE_LABELS[h.source_type] || h.source_type}
          </p>

          <div className="flex flex-wrap gap-1 mb-2">
            {h.evidence_tags.map((tag, i) => (
              <span
                key={i}
                className="text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>

          {h.summary && (
            <p className="text-xs text-slate-400 italic border-t border-slate-700 pt-2 mt-1">
              {h.summary}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
