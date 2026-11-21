import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AQIMap from '../components/Map'
import CitySelect from '../components/CitySelect'
import EnforcementPanel from '../components/EnforcementPanel'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { useAQIData, useEnforcement, useWards } from '../hooks/useAQI'
import { useCityParam } from '../hooks/useCityParam'
import { getCityById } from '../config/cities'

export default function Enforcement() {
  const [cityId, setCityId] = useCityParam()
  const city = getCityById(cityId)
  const navigate = useNavigate()
  const [selectedStation, setSelectedStation] = useState(null)

  const { stations, liveReadings, dataSource, loading, error } = useAQIData(cityId)
  const { hotspots, sourceMix, dataSource: enforcementSource, loading: hotspotsLoading } = useEnforcement(cityId)
  const wards = useWards(cityId)

  const summary = useMemo(() => {
    const high = hotspots.filter(h => h.priority === 'high' || h.score >= 75)
    const confidence = hotspots.map(h => h.confidence).filter(Number.isFinite)
    const sourceEntries = Object.entries(sourceMix || {}).sort((a, b) => b[1] - a[1])
    return {
      high: high.length,
      avgConfidence: confidence.length ? confidence.reduce((a, b) => a + b, 0) / confidence.length : null,
      topSource: sourceEntries[0]?.[0] || null,
    }
  }, [hotspots, sourceMix])

  const isMock = dataSource === 'mock' || enforcementSource === 'mock'

  return (
    <div>
      <PageHeader
        kicker="Enforcement intelligence"
        title={`Source priorities for ${city.name}`}
        description="Candidate source locations are ranked from satellite fire detections, mapped land uses, wind alignment, and nearby station readings. The output supports inspection planning; it is not proof of a violation."
        actions={<CitySelect value={cityId} onChange={setCityId} />}
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-gov-line bg-white px-2.5 py-1 text-xs font-semibold text-gov-muted">
            {hotspots.length} ranked locations
          </span>
          {isMock ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Demonstration data
            </span>
          ) : (
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800">
              Live evidence feeds
            </span>
          )}
          <Link to={`/dashboard?city=${cityId}`} className="rounded-full border border-gov-line bg-white px-2.5 py-1 text-xs font-semibold text-gov-navy hover:underline">
            Back to monitoring
          </Link>
        </div>
      </PageHeader>

      <div className="gov-container py-6">
        {error && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Backend warning: {error}. Rankings may be based on cached or demonstration inputs.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Ranked hotspots" value={hotspots.length} helper="Candidate source locations" tone="saffron" />
          <StatCard label="High priority" value={summary.high} helper="Score ≥ 75 or high priority" tone={summary.high ? 'red' : 'green'} />
          <StatCard label="Mean confidence" value={summary.avgConfidence == null ? '—' : `${Math.round(summary.avgConfidence * 100)}%`} helper="Evidence completeness" tone="navy" />
          <StatCard label="Leading source" value={summary.topSource ? summary.topSource.replace(/_/g, ' ') : '—'} helper="City source mix" tone="navy" />
          <StatCard label="Wards on map" value={wards?.features?.length || 0} helper="Overlay available" tone="slate" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
          <section className="gov-card overflow-hidden">
            <div className="flex flex-col gap-1 border-b border-gov-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="gov-label">Evidence map</p>
                <p className="text-sm font-semibold text-gov-navy">Hotspots, wards, and receptor stations</p>
              </div>
              <span className="text-[11px] text-gov-muted">Orange pins = ranked candidate sources</span>
            </div>
            <div className="relative h-[500px] sm:h-[560px]">
              {loading && !liveReadings.length ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gov-mist">
                  <p className="text-sm text-gov-muted">Loading map data…</p>
                </div>
              ) : (
                <AQIMap
                  liveReadings={liveReadings}
                  stations={stations}
                  hotspots={hotspots}
                  selectedStation={selectedStation}
                  onStationSelect={setSelectedStation}
                  onViewForecast={station => navigate(`/forecast?city=${cityId}&station=${encodeURIComponent(station.id)}`)}
                  cityCenter={[city.lat, city.lon]}
                  cityZoom={city.zoom}
                  wards={wards}
                />
              )}
            </div>
            <div className="border-t border-gov-line bg-slate-50 px-4 py-2.5 text-[11px] leading-relaxed text-gov-muted">
              Distance, wind alignment, and receptor station are shown in each hotspot popup. Confidence reflects how much
              evidence supports the candidate, not the probability of a legal violation.
            </div>
          </section>

          <section className="gov-card p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="gov-label">Priority register</p>
                <h2 className="mt-1 font-serif text-lg font-bold text-gov-navy">Ranked source candidates</h2>
              </div>
              {enforcementSource && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gov-muted">
                  {enforcementSource}
                </span>
              )}
            </div>
            <div className="max-h-[640px] overflow-y-auto pr-1">
              <EnforcementPanel
                city={cityId}
                hotspots={hotspots}
                sourceMix={sourceMix}
                dataSource={enforcementSource}
                loading={hotspotsLoading}
              />
            </div>
          </section>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <section className="gov-card p-5">
            <p className="gov-kicker">Method</p>
            <h2 className="gov-heading mt-1 text-lg">How the ranking works</h2>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed text-gov-muted">
              <li><strong className="text-gov-ink">1. Candidate generation.</strong> Satellite fire detections and mapped industrial, construction, traffic, and waste sites become candidate locations.</li>
              <li><strong className="text-gov-ink">2. Evidence scoring.</strong> Distance to the affected station, wind alignment, source type, and satellite intensity contribute to a risk score.</li>
              <li><strong className="text-gov-ink">3. Confidence.</strong> Confidence summarises evidence completeness and agreement, not legal culpability.</li>
            </ol>
          </section>

          <section className="gov-card p-5">
            <p className="gov-kicker">Field use</p>
            <h2 className="gov-heading mt-1 text-lg">Before an inspection</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gov-muted">
              <li>Check the latest station and wind observations.</li>
              <li>Confirm the site name and access point on the map.</li>
              <li>Review the evidence tags and confidence before prioritising.</li>
              <li>Record the inspection outcome so future rankings can be reviewed.</li>
            </ul>
          </section>

          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Important limitation</p>
            <h2 className="mt-1 font-serif text-lg font-bold text-amber-950">Not a legal finding</h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">
              A high rank means the location deserves review. It does not establish that the operator caused the observed
              pollution. Field verification and due process remain necessary.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
