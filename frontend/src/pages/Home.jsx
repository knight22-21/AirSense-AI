import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import AQILegend from '../components/AQILegend'
import CitySelect from '../components/CitySelect'
import { aqiColor, aqiLabel } from '../components/Map'
import { useCityParam } from '../hooks/useCityParam'
import { useAQIData, useAlerts } from '../hooks/useAQI'
import { CITIES, getCityById } from '../config/cities'

const SERVICES = [
  {
    no: '01',
    title: 'Live air-quality dashboard',
    text: 'Station observations, AQI categories, data freshness, ward interpolation, and threshold alerts on one map.',
    to: '/dashboard',
    action: 'Open live dashboard',
  },
  {
    no: '02',
    title: '72-hour station forecast',
    text: 'City-specific ML forecasts with per-horizon validation against a persistence baseline and empirical uncertainty bands.',
    to: '/forecast',
    action: 'View forecasts',
  },
  {
    no: '03',
    title: 'Enforcement intelligence',
    text: 'Evidence-ranked source locations with confidence, wind alignment, receptor station, and distance provenance.',
    to: '/enforcement',
    action: 'Review priorities',
  },
  {
    no: '04',
    title: 'Citizen health advisories',
    text: 'Plain-language guidance in English, Hindi, Tamil, and Kannada, with ward-level risk and vulnerable-group tags.',
    to: '/advisories',
    action: 'Read advisories',
  },
]

const STEPS = [
  { no: '1', title: 'Observe', text: 'Collect CAAQMS station readings and weather every 30 minutes.' },
  { no: '2', title: 'Forecast', text: 'Engineer lag, calendar, and weather features and predict the next 72 hours.' },
  { no: '3', title: 'Attribute', text: 'Score candidate sources against each station using distance, wind, and satellite evidence.' },
  { no: '4', title: 'Act', text: 'Publish enforcement priorities, threshold alerts, and multilingual public guidance.' },
]

export default function Home() {
  const [cityId, setCityId] = useCityParam()
  const city = getCityById(cityId)
  const { liveReadings, loading, dataAgeMinutes } = useAQIData(cityId)
  const { alerts } = useAlerts(cityId, 200)

  const stats = useMemo(() => {
    const values = liveReadings.map(r => r.aqi).filter(v => Number.isFinite(v))
    if (!values.length) return { avg: null, peak: null, count: 0 }
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      peak: Math.max(...values),
      count: values.length,
    }
  }, [liveReadings])

  const ageLabel = dataAgeMinutes == null
    ? 'Awaiting live reading'
    : dataAgeMinutes < 90
      ? `${Math.round(dataAgeMinutes)} minutes ago`
      : `${(dataAgeMinutes / 60).toFixed(1)} hours ago`

  const withCity = (to) => `${to}?city=${cityId}`

  return (
    <div>
      <section className="border-b border-gov-line bg-gradient-to-br from-white via-white to-slate-100">
        <div className="gov-container grid gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-14">
          <div className="max-w-3xl">
            <p className="gov-kicker">Urban air quality · decision support</p>
            <h1 className="gov-heading mt-3 text-3xl leading-tight sm:text-4xl lg:text-5xl">
              Cleaner air starts with better decisions.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-gov-muted">
              AirSense AI brings air-quality monitoring, 72-hour forecasting, source evidence, enforcement priorities,
              and citizen advisories into one public-service workflow. It is designed for municipal air-quality teams,
              not just for dashboards.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={withCity('/dashboard')} className="gov-btn">
                Open live dashboard
                <span aria-hidden="true">→</span>
              </Link>
              <Link to={withCity('/about')} className="gov-btn-secondary">
                Data & methodology
              </Link>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-relaxed text-gov-muted">
              Academic minor-project prototype. AQI values are indicative, and source attribution is an evidence-weighted
              ranking rather than a legal finding.
            </p>
          </div>

          <aside className="gov-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-gov-line bg-slate-50 px-5 py-3">
              <div>
                <p className="gov-label">City air-quality bulletin</p>
                <p className="mt-0.5 text-sm font-semibold text-gov-navy">{city.fullName}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gov-muted">
                Prototype
              </span>
            </div>
            <div className="p-5">
              <CitySelect value={cityId} onChange={setCityId} label="Bulletin city" />
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="gov-label">Average AQI</p>
                  <p className="mt-1 font-serif text-4xl font-bold" style={{ color: aqiColor(stats.avg) }}>
                    {loading && stats.avg == null ? '—' : stats.avg == null ? 'N/A' : stats.avg.toFixed(0)}
                  </p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: aqiColor(stats.avg) }}>
                    {stats.avg == null ? 'No reading' : aqiLabel(stats.avg)}
                  </p>
                </div>
                <div>
                  <p className="gov-label">Peak station</p>
                  <p className="mt-1 font-serif text-4xl font-bold text-red-700">
                    {stats.peak == null ? '—' : stats.peak.toFixed(0)}
                  </p>
                  <p className="mt-1 text-xs text-gov-muted">Highest station AQI</p>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-gov-line pt-4 text-xs">
                <div>
                  <dt className="gov-label">Stations reporting</dt>
                  <dd className="mt-1 font-semibold text-gov-ink">{stats.count || '—'}</dd>
                </div>
                <div>
                  <dt className="gov-label">Observation age</dt>
                  <dd className="mt-1 font-semibold text-gov-ink">{ageLabel}</dd>
                </div>
                <div>
                  <dt className="gov-label">Threshold alerts</dt>
                  <dd className="mt-1 font-semibold text-gov-ink">{alerts.length}</dd>
                </div>
                <div>
                  <dt className="gov-label">Forecast horizon</dt>
                  <dd className="mt-1 font-semibold text-gov-ink">24 / 48 / 72 h</dd>
                </div>
              </dl>
              <div className="mt-5 border-t border-gov-line pt-4">
                <AQILegend compact />
              </div>
              <Link
                to={withCity('/dashboard')}
                className="mt-5 inline-flex text-sm font-semibold text-gov-navy underline-offset-4 hover:underline"
              >
                View station-level details →
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="gov-container py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="gov-kicker">Platform services</p>
            <h2 className="gov-heading mt-1 text-2xl">What you can do here</h2>
          </div>
          <p className="max-w-xl text-sm text-gov-muted">
            Each service is a separate page so that monitoring, analysis, enforcement, and public communication can be
            reviewed independently.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SERVICES.map(service => (
            <Link key={service.no} to={withCity(service.to)} className="gov-card group flex flex-col p-5 transition hover:border-gov-navy hover:shadow-md">
              <span className="font-serif text-2xl font-bold text-slate-300">{service.no}</span>
              <h3 className="mt-2 font-serif text-lg font-bold text-gov-navy">{service.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-gov-muted">{service.text}</p>
              <span className="mt-4 text-sm font-semibold text-gov-navy group-hover:underline">{service.action} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-gov-line bg-white">
        <div className="gov-container py-10">
          <div className="max-w-2xl">
            <p className="gov-kicker">Workflow</p>
            <h2 className="gov-heading mt-1 text-2xl">From observation to action</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {STEPS.map(step => (
              <div key={step.no} className="relative rounded-lg border border-gov-line bg-gov-mist p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gov-navy text-sm font-bold text-white">
                  {step.no}
                </span>
                <h3 className="mt-3 font-serif text-lg font-bold text-gov-navy">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gov-muted">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="gov-container py-10">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="gov-card overflow-hidden">
            <div className="border-b border-gov-line px-5 py-4">
              <p className="gov-kicker">Coverage</p>
              <h2 className="gov-heading mt-1 text-xl">Five-city demonstration</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Region</th>
                    <th>Station fallback</th>
                    <th>Status</th>
                    <th className="text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {CITIES.map(c => (
                    <tr key={c.id}>
                      <td className="font-semibold text-gov-navy">{c.name}</td>
                      <td className="text-gov-muted">{c.fullName.split(',')[1]?.trim() || 'India'}</td>
                      <td>{c.id === 'delhi' ? '8 stations' : '5 stations'}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gov-green">
                          <span className="h-1.5 w-1.5 rounded-full bg-gov-green" />
                          Wired
                        </span>
                      </td>
                      <td className="text-right">
                        <Link to={`/dashboard?city=${c.id}`} className="gov-link text-sm">Dashboard</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="gov-card p-5">
              <p className="gov-kicker">Transparency</p>
              <h2 className="gov-heading mt-1 text-lg">How we report uncertainty</h2>
              <p className="mt-2 text-sm leading-relaxed text-gov-muted">
                Forecast accuracy is reported per horizon against a persistence baseline. When history is short or the
                demo is using fallback data, the interface labels that instead of presenting false precision.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Public disclaimer</p>
              <p className="mt-2 text-sm leading-relaxed text-amber-900">
                This prototype is not an official government portal. Do not use it as the sole basis for enforcement or
                medical decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="gov-container pb-4">
        <div className="flex flex-col items-start justify-between gap-4 rounded-lg bg-gov-navy px-6 py-6 text-white sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gov-saffron">Start with the live picture</p>
            <p className="mt-1 font-serif text-xl font-bold">See what is happening in {city.name} right now.</p>
          </div>
          <Link to={withCity('/dashboard')} className="inline-flex rounded-md bg-white px-4 py-2.5 text-sm font-bold text-gov-navy hover:bg-slate-100">
            Open dashboard →
          </Link>
        </div>
      </section>
    </div>
  )
}
