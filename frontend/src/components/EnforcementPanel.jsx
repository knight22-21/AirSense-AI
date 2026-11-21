import React, { useEffect, useState } from 'react'
import { useEnforcement } from '../hooks/useAQI'

const SOURCE_LABELS = {
  traffic: 'Traffic',
  construction: 'Construction dust',
  industry: 'Industry',
  waste_burning: 'Waste burning',
  undetermined: 'Undetermined',
  fire_hotspot: 'Waste burning',
  industrial_emission: 'Industrial emission',
  industrial_cluster: 'Industrial cluster',
  traffic_corridor: 'Traffic corridor',
}

const ATTR_COLORS = {
  traffic: '#0b3d6b',
  construction: '#e08a00',
  industry: '#7e22ce',
  waste_burning: '#c2410c',
  background: '#94a3b8',
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
  high: 'bg-red-50 text-red-800 border-red-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

function ScoreBadge({ score }) {
  const color =
    score >= 75 ? '#b91c1c' :
    score >= 50 ? '#c2410c' :
    score >= 25 ? '#a16207' :
    '#15803d'
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ background: color + '1a', color }}
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
      <div className="flex h-2 overflow-hidden rounded bg-slate-200">
        {entries.map(([k, v]) => (
          <div
            key={k}
            title={`${k.replace('_', ' ')} ${v}%`}
            style={{ width: `${v}%`, background: ATTR_COLORS[k] || '#64748b' }}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {entries.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1 text-[10px] text-gov-muted">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: ATTR_COLORS[k] || '#64748b' }}
            />
            {k.replace('_', ' ')} {Math.round(v)}%
          </span>
        ))}
      </div>
    </div>
  )
}

export default function EnforcementPanel({
  city = 'delhi',
  hotspots: hotspotsProp,
  sourceMix: sourceMixProp,
  dataSource: dataSourceProp,
  loading: loadingProp,
}) {
  const hook = useEnforcement(city, hotspotsProp === undefined)
  const hotspots = hotspotsProp ?? hook.hotspots
  const sourceMix = sourceMixProp ?? hook.sourceMix
  const dataSource = dataSourceProp ?? hook.dataSource
  const loading = loadingProp ?? hook.loading
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    setFilter('all')
  }, [city])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-gov-muted">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-gov-navy" />
        Analysing enforcement hotspots…
      </div>
    )
  }

  if (!hotspots.length) {
    return (
      <div className="rounded-md border border-dashed border-gov-line bg-gov-mist px-4 py-8 text-center text-sm text-gov-muted">
        No hotspots detected for this city.
      </div>
    )
  }

  const types = [...new Set(hotspots.map(h => h.source_type))]
  const shown = filter === 'all' ? hotspots : hotspots.filter(h => h.source_type === filter)

  return (
    <div className="space-y-3">
      {dataSource === 'mock' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Demonstration data — satellite or OpenStreetMap feeds are unavailable.
        </div>
      )}

      {sourceMix && (
        <div className="rounded-md border border-gov-line bg-gov-mist p-3">
          <p className="gov-label mb-1">City source mix</p>
          <AttributionBar attribution={sourceMix} />
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {['all', ...types].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              filter === t
                ? 'border-gov-navy bg-gov-navy text-white'
                : 'border-gov-line bg-white text-gov-muted hover:border-gov-navy hover:text-gov-navy'
            }`}
          >
            {t === 'all' ? 'All sources' : SOURCE_LABELS[t] || t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {shown.map(h => (
        <div key={h.rank} className="rounded-md border border-gov-line bg-white p-3.5 transition-colors hover:border-gov-navy">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm font-bold text-gov-saffron">#{h.rank}</span>
              <span className="text-sm font-bold text-gov-navy">{h.location}</span>
            </div>
            <ScoreBadge score={h.score} />
          </div>

          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gov-muted">{SOURCE_LABELS[h.source_type] || h.source_type?.replace(/_/g, ' ')}</span>
            {h.priority && (
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                PRIORITY_STYLES[h.priority] || PRIORITY_STYLES.low
              }`}>
                {h.priority} priority
              </span>
            )}
            {h.confidence != null && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                {Math.round(h.confidence * 100)}% confidence
              </span>
            )}
          </div>

          {(h.receptor_station || h.distance_km != null) && (
            <p className="mb-2 text-[11px] text-gov-muted">
              {h.kind && `${KIND_LABELS[h.kind] || h.kind.replace(/_/g, ' ')} · `}
              {h.receptor_station && `affects ${h.receptor_station}`}
              {h.distance_km != null && ` (${h.distance_km} km)`}
              {h.upwind && ' · upwind'}
              {h.frp != null && h.frp > 0 && ` · FRP ${Number(h.frp).toFixed(0)}`}
            </p>
          )}

          <p className="mb-1 text-[10px] uppercase tracking-wide text-gov-muted">Local source mix</p>
          <AttributionBar attribution={h.attribution} />

          <div className="mb-2 flex flex-wrap gap-1">
            {(h.evidence_tags || []).map((tag, i) => (
              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                {tag}
              </span>
            ))}
          </div>

          {h.summary && (
            <p className="mt-1 border-t border-gov-line pt-2 text-xs italic leading-relaxed text-gov-muted">
              {h.summary}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
