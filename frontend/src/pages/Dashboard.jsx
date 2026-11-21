import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AQIMap, { aqiColor, aqiLabel } from '../components/Map'
import AQILegend from '../components/AQILegend'
import CitySelect from '../components/CitySelect'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { useAQIData, useAlerts, useEnforcement, useWards } from '../hooks/useAQI'
import { useCityParam } from '../hooks/useCityParam'
import { getCityById } from '../config/cities'

function StatusPill({ children, tone = 'slate' }) {
  const tones = {
    green: 'border-green-200 bg-green-50 text-green-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}

function formatTime(ts) {
  if (!ts) return '—'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard() {
  const [cityId, setCityId] = useCityParam()
  const city = getCityById(cityId)
  const navigate = useNavigate()
  const [selectedStation, setSelectedStation] = useState(null)

  const { stations, liveReadings, dataSource, dataAgeMinutes, loading, error, lastUpdated, refresh } = useAQIData(cityId)
  const { hotspots, dataSource: enforcementSource } = useEnforcement(cityId)
  const wards = useWards(cityId)
  const { alerts, threshold } = useAlerts(cityId, 200)

  useEffect(() => {
    setSelectedStation(null)
  }, [cityId])

  const isMock = dataSource === 'mock' || enforcementSource === 'mock'

  const mergedStations = useMemo(() => {
    const readings = new Map(liveReadings.map(r => [r.station_id, r]))
    const base = stations.length
      ? stations.map(s => ({ ...s, latest: readings.get(s.id) }))
      : liveReadings.map(r => ({
          id: r.station_id,
          name: r.station_name,
          latitude: r.latitude,
          longitude: r.longitude,
          latest: r,
        }))
    return base
      .map(s => ({
        ...s,
        aqi: s.latest?.aqi ?? null,
        timestamp: s.latest?.timestamp,
        source: s.latest?.source,
      }))
      .sort((a, b) => (b.aqi ?? -1) - (a.aqi ?? -1))
  }, [stations, liveReadings])

  const stats = useMemo(() => {
    const values = mergedStations.map(s => s.aqi).filter(v => Number.isFinite(v))
    return {
      count: values.length,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      peak: values.length ? Math.max(...values) : null,
      worst: mergedStations.find(s => Number.isFinite(s.aqi)) || null,
    }
  }, [mergedStations])

  const ageMinutes = dataAgeMinutes
  const ageLabel = ageMinutes == null
    ? 'No observation timestamp'
    : ageMinutes < 90 ? `${Math.round(ageMinutes)} minutes` : `${(ageMinutes / 60).toFixed(1)} hours`

  const forecastHref = (station) => {
    const id = station?.id || station?.station_id
    return `/forecast?city=${cityId}${id ? `&station=${encodeURIComponent(id)}` : ''}`
  }

  const focusTopAlert = () => {
    const alert = alerts[0]
    if (!alert) return
    const matched = mergedStations.find(s => (s.id || s.station_id) === alert.station_id)
    if (matched) setSelectedStation(matched)
  }

  return (
    <div>
      <PageHeader
        kicker="Live monitoring"
        title={`${city.fullName} air quality`}
        description="Station observations, interpolated ward conditions, threshold alerts, and enforcement hotspots. Use the map controls to switch layers."
        actions={
          <>
            <CitySelect value={cityId} onChange={setCityId} />
            <div className="flex flex-col items-start gap-1">
              <span className="gov-label">Data status</span>
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="gov-btn-secondary disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? 'Refreshing…' : 'Refresh data'}
              </button>
            </div>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isMock ? (
            <StatusPill tone="amber">Demonstration data — live sources unavailable</StatusPill>
          ) : (
            <StatusPill tone="green">Live source data</StatusPill>
          )}
          <StatusPill tone={ageMinutes != null && ageMinutes > 90 ? 'amber' : 'slate'}>
            Observation age: {ageLabel}
          </StatusPill>
          {lastUpdated && (
            <StatusPill tone="slate">Fetched {lastUpdated.toLocaleTimeString('en-IN')}</StatusPill>
          )}
        </div>
      </PageHeader>

      <div className="gov-container py-6">
        {error && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Backend warning: {error}. The page may be showing cached or demonstration data.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Average AQI" value={stats.avg == null ? '—' : stats.avg.toFixed(0)} helper={stats.avg == null ? 'No station reporting' : aqiLabel(stats.avg)} tone={stats.avg > 200 ? 'red' : stats.avg > 100 ? 'saffron' : 'green'} />
          <StatCard label="Peak station AQI" value={stats.peak == null ? '—' : stats.peak.toFixed(0)} helper={stats.worst ? stats.worst.name : 'No reading'} tone={stats.peak > 200 ? 'red' : 'navy'} />
          <StatCard label="Stations reporting" value={stats.count} helper={`${stations.length || liveReadings.length} configured`} tone="navy" />
          <StatCard label="Threshold alerts" value={alerts.length} helper={`Stations above AQI ${threshold ?? 200}`} tone={alerts.length ? 'red' : 'green'} />
          <StatCard label="Hotspots" value={hotspots.length} helper="Evidence-ranked locations" tone="saffron" />
        </div>

        {alerts.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-bold text-red-800">
                {alerts.length} station{alerts.length === 1 ? '' : 's'} above the AQI {threshold} threshold
              </p>
              <p className="mt-0.5 truncate text-sm text-red-700">{alerts[0].message}</p>
            </div>
            <button type="button" onClick={focusTopAlert} className="gov-btn flex-shrink-0 bg-red-700 hover:bg-red-800">
              Focus worst station
            </button>
          </div>
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_0.75fr]">
          <section className="gov-card overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-gov-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="gov-label">Station and ward map</p>
                <p className="text-sm font-semibold text-gov-navy">
                  {city.name} · {wards?.features?.length || 0} wards · {hotspots.length} hotspots
                </p>
              </div>
              <AQILegend compact />
            </div>
            <div className="relative h-[420px] sm:h-[520px]">
              {loading && !liveReadings.length ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gov-mist">
                  <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-gov-navy" />
                    <p className="mt-3 text-sm font-medium text-gov-muted">Fetching station observations…</p>
                  </div>
                </div>
              ) : (
                <AQIMap
                  liveReadings={liveReadings}
                  stations={stations}
                  hotspots={hotspots}
                  selectedStation={selectedStation}
                  onStationSelect={setSelectedStation}
                  onViewForecast={station => navigate(forecastHref(station))}
                  onViewEnforcement={() => navigate(`/enforcement?city=${cityId}`)}
                  cityCenter={[city.lat, city.lon]}
                  cityZoom={city.zoom}
                  wards={wards}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gov-line bg-slate-50 px-4 py-2 text-[11px] text-gov-muted">
              <span>Circle = station AQI · Orange pin = enforcement hotspot</span>
              <span>Base map: OpenStreetMap</span>
            </div>
          </section>

          <div className="space-y-4">
            <section className="gov-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="gov-label">Selected station</p>
                {selectedStation && (
                  <button type="button" onClick={() => setSelectedStation(null)} className="text-xs font-semibold text-gov-muted hover:text-gov-navy">
                    Clear
                  </button>
                )}
              </div>
              {selectedStation ? (
                <div className="mt-3">
                  <h2 className="font-serif text-lg font-bold text-gov-navy">{selectedStation.name}</h2>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="font-serif text-4xl font-bold" style={{ color: aqiColor(selectedStation.aqi) }}>
                      {selectedStation.aqi == null ? '—' : Number(selectedStation.aqi).toFixed(0)}
                    </span>
                    <span className="pb-1 text-sm font-semibold" style={{ color: aqiColor(selectedStation.aqi) }}>
                      {aqiLabel(selectedStation.aqi)}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-2 border-t border-gov-line pt-3 text-xs">
                    <div className="flex justify-between gap-3"><dt className="text-gov-muted">Observed</dt><dd className="font-semibold text-gov-ink">{formatTime(selectedStation.timestamp)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gov-muted">Source</dt><dd className="font-semibold text-gov-ink">{selectedStation.source || '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gov-muted">Coordinates</dt><dd className="font-mono text-[11px] text-gov-ink">{Number(selectedStation.latitude).toFixed(4)}, {Number(selectedStation.longitude).toFixed(4)}</dd></div>
                  </dl>
                  <Link to={forecastHref(selectedStation)} className="gov-btn mt-4 w-full">
                    View 72-hour forecast →
                  </Link>
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-gov-line bg-gov-mist p-4 text-sm text-gov-muted">
                  Select a station marker or a row in the station table below to see details and its forecast.
                </div>
              )}
            </section>

            <section className="gov-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="gov-label">Threshold alerts</p>
                <span className="text-xs font-semibold text-gov-muted">{alerts.length} active</span>
              </div>
              {alerts.length ? (
                <ul className="mt-3 divide-y divide-gov-line">
                  {alerts.slice(0, 5).map(alert => (
                    <li key={alert.station_id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gov-ink">{alert.station_name}</p>
                          <p className="mt-0.5 text-xs text-gov-muted">AQI {Number(alert.aqi).toFixed(0)} · threshold {threshold}</p>
                        </div>
                        <StatusPill tone="red">Alert</StatusPill>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                  No station is currently above the alert threshold.
                </p>
              )}
            </section>

            <section className="gov-card p-4">
              <p className="gov-label">Data notes</p>
              <ul className="mt-2 space-y-2 text-xs leading-relaxed text-gov-muted">
                <li>AQI is computed from available pollutants; missing pollutants reduce confidence.</li>
                <li>Ward colours use inverse-distance interpolation when the backend provides ward AQI.</li>
                <li>Hotspots are evidence-ranked candidates, not confirmed violations.</li>
              </ul>
            </section>
          </div>
        </div>

        <section className="gov-card mt-5 overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-gov-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="gov-label">Station register</p>
              <p className="text-sm font-semibold text-gov-navy">All reporting stations, ranked by AQI</p>
            </div>
            <span className="text-xs text-gov-muted">Click a row to inspect it on the map</span>
          </div>
          <div className="overflow-x-auto">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Station</th>
                  <th>AQI</th>
                  <th>Category</th>
                  <th>Observed</th>
                  <th>Source</th>
                  <th className="text-right">Forecast</th>
                </tr>
              </thead>
              <tbody>
                {mergedStations.map(station => (
                  <tr
                    key={station.id || station.station_id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setSelectedStation(station)}
                  >
                    <td>
                      <p className="font-semibold text-gov-navy">{station.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-gov-muted">{Number(station.latitude).toFixed(4)}, {Number(station.longitude).toFixed(4)}</p>
                    </td>
                    <td>
                      <span className="font-serif text-lg font-bold" style={{ color: aqiColor(station.aqi) }}>
                        {station.aqi == null ? '—' : Number(station.aqi).toFixed(0)}
                      </span>
                    </td>
                    <td><span className="text-sm font-semibold" style={{ color: aqiColor(station.aqi) }}>{aqiLabel(station.aqi)}</span></td>
                    <td className="text-xs text-gov-muted">{formatTime(station.timestamp)}</td>
                    <td className="text-xs text-gov-muted">{station.source || '—'}</td>
                    <td className="text-right">
                      <Link to={forecastHref(station)} className="gov-link text-xs">Open →</Link>
                    </td>
                  </tr>
                ))}
                {!mergedStations.length && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-sm text-gov-muted">No stations available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
