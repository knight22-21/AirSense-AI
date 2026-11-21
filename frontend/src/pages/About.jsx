import React from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { CITIES } from '../config/cities'

const DATA_SOURCES = [
  {
    source: 'OpenAQ v3',
    use: 'Station observations, station metadata',
    cadence: 'Refresh on request and every 5 minutes in the UI',
    caveat: 'Coverage varies by city; falls back to labelled demo data.',
  },
  {
    source: 'Open-Meteo',
    use: 'Temperature, humidity, wind, boundary-layer inputs',
    cadence: 'Hourly weather forecast',
    caveat: 'Weather is a model forecast, not a local sensor reading.',
  },
  {
    source: 'NASA FIRMS',
    use: 'Thermal anomalies for waste and fire candidates',
    cadence: 'Daily satellite passes, cached',
    caveat: 'A detection is a candidate, not a confirmed source.',
  },
  {
    source: 'OpenStreetMap / Overpass',
    use: 'Industrial, construction, road, and waste-site context',
    cadence: 'Cached lookup',
    caveat: 'Map completeness and tagging vary by neighbourhood.',
  },
  {
    source: 'Supabase',
    use: 'Optional persistence for readings and alerts',
    cadence: 'On write, when configured',
    caveat: 'The prototype runs without it; DB helpers no-op.',
  },
  {
    source: 'Groq language model',
    use: 'Optional multilingual advisory generation',
    cadence: 'On demand, cached',
    caveat: 'Falls back to deterministic templates when unavailable.',
  },
]

const METHODOLOGY = [
  {
    title: 'AQI calculation',
    text: 'Pollutant sub-indices are combined into a station AQI. Missing pollutants reduce the available evidence and are labelled in the interface.',
  },
  {
    title: 'Forecasting',
    text: 'Lag, rolling-window, calendar, and weather features feed a city-specific ML model. XGBoost, LightGBM, Random Forest, and Ridge are compared, and a persistence baseline is reported alongside hold-out RMSE.',
  },
  {
    title: 'Ward interpolation',
    text: 'Ward AQI uses inverse-distance weighting from nearby stations. When the backend supplies ward values, the frontend uses them directly.',
  },
  {
    title: 'Source attribution',
    text: 'Candidate sources are scored using distance, wind alignment, source type, and satellite evidence. Confidence reflects evidence completeness, not legal proof.',
  },
  {
    title: 'Advisories',
    text: 'Risk levels and vulnerable-group tags are turned into short public messages. The backend prefers a cached language-model response and falls back to templates.',
  },
]

const STACK = [
  'Python 3.11', 'FastAPI', 'Uvicorn', 'XGBoost', 'LightGBM', 'Random Forest', 'pandas', 'NumPy',
  'React 18', 'Vite', 'Tailwind CSS', 'Leaflet', 'Recharts', 'React Router',
  'OpenAQ', 'Open-Meteo', 'NASA FIRMS', 'OpenStreetMap', 'Supabase', 'Groq',
]

export default function About() {
  return (
    <div>
      <PageHeader
        kicker="About the platform"
        title="AirSense AI — data, method, and limits"
        description="This page explains what the prototype does, where the data comes from, how the analysis works, and what it must not be used for."
      />

      <div className="gov-container py-6">
        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="gov-card p-6">
            <p className="gov-kicker">Purpose</p>
            <h2 className="gov-heading mt-1 text-2xl">A decision-support layer for urban air quality</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-gov-muted">
              <p>
                AirSense AI is an academic minor-project prototype. It connects four tasks that are often handled in
                separate systems: monitoring current air quality, forecasting the next 72 hours, ranking likely source
                locations for inspection, and communicating health guidance to residents.
              </p>
              <p>
                The design goal is not to replace official monitoring or enforcement systems. It is to show how open
                data, a small forecasting model, and transparent evidence can support a municipal workflow end to end.
              </p>
              <p>
                The demonstration covers five Indian cities: Delhi, Mumbai, Bengaluru, Chennai, and Kolkata. Each city
                has a station fallback, a forecast path, enforcement analysis, and multilingual advisories.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/dashboard?city=delhi" className="gov-btn">Open live dashboard</Link>
              <a href="https://github.com/knight22-21/AirSense-AI" target="_blank" rel="noreferrer" className="gov-btn-secondary">
                View source repository ↗
              </a>
            </div>
          </section>

          <aside className="gov-card p-5">
            <p className="gov-label">Project snapshot</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3 border-b border-gov-line pb-2">
                <dt className="text-gov-muted">Type</dt>
                <dd className="font-semibold text-gov-ink">Academic minor project</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-gov-line pb-2">
                <dt className="text-gov-muted">Cities</dt>
                <dd className="font-semibold text-gov-ink">5</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-gov-line pb-2">
                <dt className="text-gov-muted">Forecast horizon</dt>
                <dd className="font-semibold text-gov-ink">72 hours</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-gov-line pb-2">
                <dt className="text-gov-muted">Languages</dt>
                <dd className="font-semibold text-gov-ink">4</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gov-muted">Backend tests</dt>
                <dd className="font-semibold text-gov-ink">21 passing</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              This is not an official government portal. It is a prototype for demonstration and evaluation.
            </div>
          </aside>
        </div>

        <section className="gov-card mt-5 p-6">
          <p className="gov-kicker">Architecture</p>
          <h2 className="gov-heading mt-1 text-2xl">How the system fits together</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              { step: '01', title: 'Open data', text: 'Stations, weather, satellite fire detections, and mapped land uses.' },
              { step: '02', title: 'FastAPI services', text: 'Normalisation, caching, fallback data, health checks, and scheduled jobs.' },
              { step: '03', title: 'Analysis', text: 'AQI, 72-hour forecast, ward IDW, evidence-ranked attribution, alerts, and advisories.' },
              { step: '04', title: 'Public interface', text: 'Separate monitoring, forecast, enforcement, advisory, and data pages.' },
            ].map(item => (
              <div key={item.step} className="rounded-md border border-gov-line bg-gov-mist p-4">
                <span className="font-serif text-xl font-bold text-slate-300">{item.step}</span>
                <h3 className="mt-1 font-serif text-base font-bold text-gov-navy">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gov-muted">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-gov-line bg-white p-4 font-mono text-[11px] leading-relaxed text-gov-muted">
            OpenAQ + Open-Meteo + NASA FIRMS + OSM → FastAPI (cache / fallback / models) → REST API → React pages
          </div>
        </section>

        <section className="gov-card mt-5 overflow-hidden">
          <div className="border-b border-gov-line px-5 py-4">
            <p className="gov-kicker">Data sources</p>
            <h2 className="gov-heading mt-1 text-xl">What feeds the platform</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Used for</th>
                  <th>Cadence</th>
                  <th>Caveat</th>
                </tr>
              </thead>
              <tbody>
                {DATA_SOURCES.map(row => (
                  <tr key={row.source}>
                    <td className="font-semibold text-gov-navy">{row.source}</td>
                    <td className="text-gov-muted">{row.use}</td>
                    <td className="text-xs text-gov-muted">{row.cadence}</td>
                    <td className="text-xs text-gov-muted">{row.caveat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="gov-card p-5">
            <p className="gov-kicker">Methodology</p>
            <h2 className="gov-heading mt-1 text-xl">How the analysis is produced</h2>
            <div className="mt-4 space-y-3">
              {METHODOLOGY.map(item => (
                <div key={item.title} className="border-b border-gov-line pb-3 last:border-0 last:pb-0">
                  <h3 className="text-sm font-bold text-gov-navy">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gov-muted">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <section className="gov-card p-5">
              <p className="gov-kicker">Validation</p>
              <h2 className="gov-heading mt-1 text-xl">What is tested</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gov-muted">
                <li>The backend test suite covers health, city registry, AQI, forecasting, wards, enforcement, advisories, and fallback paths.</li>
                <li>Forecast pages report hold-out RMSE against a persistence baseline and disclose the validation horizon.</li>
                <li>The interface labels demonstration data whenever live feeds are unavailable.</li>
                <li>The production frontend build and API health endpoint are checked during deployment.</li>
              </ul>
            </section>

            <section className="rounded-lg border border-red-200 bg-red-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-800">Limitations</p>
              <h2 className="mt-1 font-serif text-xl font-bold text-red-950">Known gaps</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-red-900">
                <li>Station coverage is sparse and uneven; interpolation is indicative.</li>
                <li>Models trained before the current metrics schema are ignored; the loader retries or uses statistical fallback.</li>
                <li>Attribution is evidence-weighted and cannot establish legal responsibility.</li>
                <li>The free-tier deployment sleeps, so scheduled jobs do not run continuously.</li>
                <li>Advisory translations can fall back to English if a model response is missing.</li>
              </ul>
            </section>
          </div>
        </section>

        <section className="gov-card mt-5 p-5">
          <p className="gov-kicker">Coverage</p>
          <h2 className="gov-heading mt-1 text-xl">Demonstration cities</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Registry name</th>
                  <th>Region</th>
                  <th>Dashboard</th>
                </tr>
              </thead>
              <tbody>
                {CITIES.map(city => (
                  <tr key={city.id}>
                    <td className="font-semibold text-gov-navy">{city.name}</td>
                    <td className="text-gov-muted">{city.fullName}</td>
                    <td className="text-gov-muted">India</td>
                    <td><Link to={`/dashboard?city=${city.id}`} className="gov-link text-sm">Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="gov-card p-5">
            <p className="gov-kicker">Technology</p>
            <h2 className="gov-heading mt-1 text-xl">Built with</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {STACK.map(tech => (
                <span key={tech} className="rounded-full border border-gov-line bg-gov-mist px-2.5 py-1 text-xs font-semibold text-gov-muted">
                  {tech}
                </span>
              ))}
            </div>
          </section>

          <section className="gov-card p-5">
            <p className="gov-kicker">Responsible use</p>
            <h2 className="gov-heading mt-1 text-xl">Privacy and disclaimer</h2>
            <p className="mt-2 text-sm leading-relaxed text-gov-muted">
              The prototype handles public environmental and map data. It does not collect personal health information or
              user accounts. Location data is used only to place stations and candidate sources on the map.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gov-muted">
              Do not use this prototype as the sole basis for enforcement, medical, or emergency decisions. Verify all
              findings with the relevant authority and current official guidance.
            </p>
          </section>
        </section>
      </div>
    </div>
  )
}
