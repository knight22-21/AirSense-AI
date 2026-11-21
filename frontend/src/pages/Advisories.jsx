import React, { useMemo } from 'react'
import AdvisoryCard from '../components/AdvisoryCard'
import AQILegend from '../components/AQILegend'
import CitySelect from '../components/CitySelect'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { aqiColor, aqiLabel } from '../components/Map'
import { useAQIData, useWardAdvisories } from '../hooks/useAQI'
import { useCityParam } from '../hooks/useCityParam'
import { getCityById } from '../config/cities'

const GUIDANCE = [
  { range: '0–50', category: 'Good', message: 'Ordinary outdoor activity is appropriate for most people.' },
  { range: '51–100', category: 'Moderate', message: 'Unusually sensitive people should consider reducing prolonged outdoor exertion.' },
  { range: '101–150', category: 'Unhealthy (Sensitive)', message: 'Children, older adults, and people with heart or lung conditions should reduce prolonged outdoor exertion.' },
  { range: '151–200', category: 'Unhealthy', message: 'Everyone should reduce prolonged outdoor exertion; sensitive groups should avoid it.' },
  { range: '201–300', category: 'Very Unhealthy', message: 'Avoid outdoor exertion; keep windows closed and follow local health guidance.' },
  { range: '301–500', category: 'Hazardous', message: 'Remain indoors where possible and follow emergency guidance from local authorities.' },
]

export default function Advisories() {
  const [cityId, setCityId] = useCityParam()
  const city = getCityById(cityId)
  const { liveReadings, dataSource, loading } = useAQIData(cityId)
  const { wards, loading: wardsLoading } = useWardAdvisories(cityId)

  const summary = useMemo(() => {
    const wardAqis = wards.map(w => w.aqi).filter(Number.isFinite)
    const liveAqis = liveReadings.map(r => r.aqi).filter(Number.isFinite)
    const all = wardAqis.length ? wardAqis : liveAqis
    const highest = wards.reduce((best, w) => ((w.aqi ?? -1) > (best?.aqi ?? -1) ? w : best), null)
    const tags = new Set(wards.flatMap(w => w.vulnerable_tags || []))
    return {
      avg: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null,
      highest,
      wardCount: wards.length,
      tagCount: tags.size,
    }
  }, [wards, liveReadings])

  return (
    <div>
      <PageHeader
        kicker="Public communication"
        title="Citizen health advisories"
        description="Plain-language guidance generated from the current ward or station risk level. Switch language without leaving the page, and select a ward to see its local advisory."
        actions={<CitySelect value={cityId} onChange={setCityId} />}
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-gov-line bg-white px-2.5 py-1 text-xs font-semibold text-gov-muted">
            {city.fullName}
          </span>
          {dataSource === 'mock' && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Demonstration data
            </span>
          )}
          <span className="rounded-full border border-gov-line bg-white px-2.5 py-1 text-xs font-semibold text-gov-muted">
            English · हिन्दी · தமிழ் · ಕನ್ನಡ
          </span>
        </div>
      </PageHeader>

      <div className="gov-container py-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="City average AQI"
            value={summary.avg == null ? '—' : summary.avg.toFixed(0)}
            helper={summary.avg == null ? 'No current reading' : aqiLabel(summary.avg)}
            tone={summary.avg > 100 ? 'saffron' : 'green'}
          />
          <StatCard
            label="Highest ward"
            value={summary.highest?.aqi == null ? '—' : Number(summary.highest.aqi).toFixed(0)}
            helper={summary.highest?.name || 'No ward data'}
            tone={summary.highest?.aqi > 150 ? 'red' : 'navy'}
          />
          <StatCard label="Wards with advisory" value={summary.wardCount} helper={wardsLoading ? 'Loading…' : 'Ward-level risk cards'} tone="navy" />
          <StatCard label="Vulnerable tags in use" value={summary.tagCount} helper="Across ward advisories" tone="saffron" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="gov-card p-5">
            <div className="flex flex-col gap-1 border-b border-gov-line pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="gov-label">Current advisory</p>
                <h2 className="mt-1 font-serif text-xl font-bold text-gov-navy">What should residents do?</h2>
              </div>
              {loading && <span className="text-xs text-gov-muted">Updating…</span>}
            </div>
            <div className="mt-4">
              <AdvisoryCard city={cityId} />
            </div>
          </section>

          <div className="space-y-4">
            <section className="gov-card p-5">
              <p className="gov-kicker">Health guidance</p>
              <h2 className="gov-heading mt-1 text-lg">Category meanings</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th>AQI</th>
                      <th>Category</th>
                      <th>Public message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GUIDANCE.map(row => (
                      <tr key={row.range}>
                        <td className="whitespace-nowrap text-xs font-semibold">{row.range}</td>
                        <td className="whitespace-nowrap text-xs font-semibold" style={{ color: aqiColor(Number(row.range.split('–')[0]) + 25) }}>
                          {row.category}
                        </td>
                        <td className="text-xs text-gov-muted">{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <AQILegend compact />
              </div>
            </section>

            <section className="gov-card p-5">
              <p className="gov-kicker">Translation</p>
              <h2 className="gov-heading mt-1 text-lg">Language coverage</h2>
              <p className="mt-2 text-sm leading-relaxed text-gov-muted">
                Advisories are generated in four languages. When the language model is unavailable, the backend uses a
                deterministic template so guidance remains readable.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {['English', 'हिन्दी', 'தமிழ்', 'ಕನ್ನಡ'].map(lang => (
                  <div key={lang} className="rounded-md border border-gov-line bg-gov-mist px-3 py-2 font-semibold text-gov-navy">
                    {lang}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Important</p>
              <p className="mt-2 text-sm leading-relaxed text-amber-900">
                These advisories are prototype decision support, not official health warnings. Residents should follow
                guidance from local health and municipal authorities.
              </p>
            </section>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <section className="gov-card p-5">
            <p className="gov-kicker">Vulnerable groups</p>
            <h2 className="gov-heading mt-1 text-lg">Who needs extra protection</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gov-muted">
              <li>Children and older adults.</li>
              <li>People with asthma, COPD, heart disease, or other chronic conditions.</li>
              <li>Outdoor workers and people exercising for long periods.</li>
              <li>Pregnant people and anyone advised by a clinician to limit exposure.</li>
            </ul>
          </section>

          <section className="gov-card p-5">
            <p className="gov-kicker">How it is generated</p>
            <h2 className="gov-heading mt-1 text-lg">From AQI to plain language</h2>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-gov-muted">
              <li><strong className="text-gov-ink">1.</strong> The backend reads the ward or station AQI.</li>
              <li><strong className="text-gov-ink">2.</strong> A risk level and vulnerable-group tags are assigned.</li>
              <li><strong className="text-gov-ink">3.</strong> A cached multilingual template or language model writes the advisory.</li>
              <li><strong className="text-gov-ink">4.</strong> The page falls back to English if a translation is missing.</li>
            </ol>
          </section>

          <section className="gov-card p-5">
            <p className="gov-kicker">Use in a demo</p>
            <h2 className="gov-heading mt-1 text-lg">Suggested talking points</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gov-muted">
              <li>Show the live AQI, then the corresponding advisory.</li>
              <li>Switch language to demonstrate reach.</li>
              <li>Select a high-risk ward to show local targeting.</li>
              <li>Point out the disclaimer and the fallback path.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
