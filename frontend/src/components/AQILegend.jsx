import React from 'react'

const ITEMS = [
  { range: '0–50', label: 'Good', color: '#15803d' },
  { range: '51–100', label: 'Moderate', color: '#a16207' },
  { range: '101–150', label: 'Sensitive', color: '#c2410c' },
  { range: '151–200', label: 'Unhealthy', color: '#b91c1c' },
  { range: '201–300', label: 'Very Unhealthy', color: '#7e22ce' },
  { range: '301–500', label: 'Hazardous', color: '#7f1d1d' },
]

export default function AQILegend({ compact = false }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      {ITEMS.map(item => (
        <span key={item.range} className="inline-flex items-center gap-1.5 text-gov-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
          <span className="font-semibold text-gov-ink">{item.range}</span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  )
}
