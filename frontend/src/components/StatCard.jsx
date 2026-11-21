import React from 'react'

const TONES = {
  navy: 'border-t-gov-navy text-gov-navy',
  green: 'border-t-gov-green text-gov-green',
  saffron: 'border-t-gov-saffron text-amber-700',
  red: 'border-t-red-600 text-red-700',
  slate: 'border-t-slate-400 text-slate-600',
}

export default function StatCard({ label, value, unit, helper, tone = 'navy' }) {
  return (
    <div className={`rounded-lg border border-gov-line border-t-4 bg-white p-4 shadow-sm ${TONES[tone] || TONES.navy}`}>
      <p className="gov-label">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-serif text-3xl font-bold leading-none">{value ?? '—'}</span>
        {unit && <span className="text-sm font-semibold">{unit}</span>}
      </div>
      {helper && <p className="mt-2 text-xs leading-relaxed text-gov-muted">{helper}</p>}
    </div>
  )
}
