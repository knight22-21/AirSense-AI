import React, { useState } from 'react'
import { useEnforcement } from '../hooks/useAQI'

const SOURCE_LABELS = {
  traffic:             '🚗 Traffic',
  construction:        '🏗 Construction Dust',
  industry:            '🏭 Industry',
  waste_burning:       '🔥 Waste Burning',
  undetermined:        '❔ Undetermined',
  fire_hotspot:        '🔥 Waste Burning',
  industrial_emission: '🏭 Industrial Emission',
  industrial_cluster:  '🏭 Industrial Cluster',
  traffic_corridor:    '🚗 Traffic Corridor',
}

const ATTR_COLORS = {
  traffic:       '#60a5fa',
  construction:  '#fbbf24',
  industry:      '#a78bfa',
  waste_burning: '#f97316',
  background:    '#475569',
}

const KIND_LABELS = {
  industrial: 'industrial cluster',
  construction: 'construction site',
  dump: 'waste site',
  fire: 'fire cluster',
  highway: 'traffic corridor',
  industrial_cluster: 'industrial cluster',
  fire_cluster: 'fire cluster',
  traffic_corridor: 'traffic corridor',
  waste_site: 'waste site',
}

const PRIORITY_STYLES = {
  high:   'bg-red-500/20 text-red-300',
  medium: 'bg-amber-500/20 text-amber-300',
  low:    'bg-slate-700 text-slate-300',
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

function AttributionBar({ attribution }) {
  const entries = Object.entries(attribution || {}).filter(([, v]) => v > 0)
  if (!entries.length) return null
  return (
    <div className="mb-2">
      <div className="flex h-2 rounded overflow-hidden bg-slate-700">
        {entries.map(([k, v]) => (
          <div
            key={k}
            title={`${k.replace('_', ' ')} ${v}%`}
            style={{ width: `${v}%`, background: ATTR_COLORS[k] || '#64748b' }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
        {entries.map(([k, v]) => (
          <span key={k} className="text-[10px] text-slate-400 flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: ATTR_COLORS[k] || '#64748b' }}
            />
            {k.replace('_', ' ')} {Math.round(v)}%
          </span>
        ))}
      </div>
    </div>
  )
}

export default function EnforcementPanel({ city = 'delhi' }) {
  const { hotspots, sourceMix, dataSource, loading } = useEnforcement(city)
  const [filter, setFilter] = useState('all')

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

  const types = [...new Set(hotspots.map(h => h.source_type))]
  const shown = filter === 'all' ? hotspots : hotspots.filter(h => h.source_type === filter)

  return (
    <div className="space-y-3">
      {dataSource === 'mock' && (
        <div className="text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-300">
          ⚠ Demo data — FIRMS / OSM feeds unavailable
        </div>
      )}

      {sourceMix && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1 font-medium">City source mix</p>
          <AttributionBar attribution={sourceMix} />
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {['all', ...types].map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-2.5 py-1.5 md:py-1 rounded-full text-xs font-medium transition-colors ${
              filter === t
                ? 'bg-orange-500/30 text-orange-300'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t === 'all' ? 'All' : SOURCE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {shown.map(h => (
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

          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="text-xs text-slate-400">
              {SOURCE_LABELS[h.source_type] || h.source_type}
            </span>
            {h.priority && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                PRIORITY_STYLES[h.priority] || PRIORITY_STYLES.low
              }`}>
                {h.priority} priority
              </span>
            )}
            {h.confidence != null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">
                {Math.round(h.confidence * 100)}% confidence
              </span>
            )}
          </div>

          {(h.receptor_station || h.distance_km != null) && (
            <p className="text-[11px] text-slate-500 mb-2">
              {h.kind && `${KIND_LABELS[h.kind] || h.kind.replace(/_/g, ' ')} · `}
              {h.receptor_station && `affects ${h.receptor_station}`}
              {h.distance_km != null && ` (${h.distance_km} km)`}
              {h.upwind && ' · upwind'}
              {h.frp != null && h.frp > 0 && ` · FRP ${Number(h.frp).toFixed(0)}`}
            </p>
          )}

          <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">
            Local source mix
          </p>
          <AttributionBar attribution={h.attribution} />

          <div className="flex flex-wrap gap-1 mb-2">
            {(h.evidence_tags || []).map((tag, i) => (
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
