import React, { useMemo, useState } from 'react'
import AQIMap, { aqiColor, aqiLabel } from '../components/Map'
import Sidebar from '../components/Sidebar'
import { useAQIData, useEnforcement, useWards, useAlerts } from '../hooks/useAQI'
import { CITIES, getCityById } from '../config/cities'

function AQIBadge({ aqi }) {
  const color = aqiColor(aqi)
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '33', color }}
    >
      AQI {aqi ? aqi.toFixed(0) : 'N/A'} · {aqiLabel(aqi)}
    </span>
  )
}

function CitySelector({ selectedCity, onChange }) {
  const [open, setOpen] = useState(false)
  const city = getCityById(selectedCity)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm font-medium text-white transition-colors"
      >
        <span className="text-blue-400">🏙</span>
        <span>{city.name}</span>
        <span className="text-xs text-green-400 font-normal">● Live</span>
        <span className="text-slate-400 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl z-[9999] overflow-hidden">
          <p className="text-xs text-slate-500 px-3 pt-2 pb-1 font-medium uppercase tracking-wider">
            Select City
          </p>
          {CITIES.map(c => (
            <button
              key={c.id}
              onClick={() => { onChange(c.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors hover:bg-slate-700 ${
                c.id === selectedCity ? 'bg-slate-700/70' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{c.name}</span>
                  <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                    ● Live data
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{c.description}</p>
              </div>
              {c.id === selectedCity && (
                <span className="text-blue-400 text-sm flex-shrink-0 mt-0.5">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [selectedCityId, setSelectedCityId] = useState('delhi')
  const [selectedStation, setSelectedStation] = useState(null)

  const city = getCityById(selectedCityId)

  const { stations, liveReadings, dataSource, dataAgeMinutes, loading, error, lastUpdated, refresh } = useAQIData(selectedCityId)
  const { hotspots, dataSource: enfSource } = useEnforcement(selectedCityId)
  const wards = useWards(selectedCityId)
  const { alerts, threshold: alertThreshold } = useAlerts(selectedCityId, 200)
  const isMock = dataSource === 'mock' || enfSource === 'mock'

  const ageMinutes = useMemo(() => {
    if (dataAgeMinutes != null) return dataAgeMinutes
    const ages = liveReadings
      .map(r => (Date.now() - new Date(r.timestamp).getTime()) / 60000)
      .filter(Number.isFinite)
    return ages.length ? Math.max(0, Math.min(...ages)) : null
  }, [dataAgeMinutes, liveReadings])

  const ageLabel = ageMinutes == null
    ? null
    : ageMinutes < 90 ? `${Math.round(ageMinutes)}m ago` : `${(ageMinutes / 60).toFixed(1)}h ago`

  // When city changes, clear station selection
  const handleCityChange = (id) => {
    setSelectedCityId(id)
    setSelectedStation(null)
  }

  const focusTopAlert = () => {
    const a = alerts[0]
    if (!a) return
    const st = stations.find(s => s.id === a.station_id)
    const reading = liveReadings.find(r => r.station_id === a.station_id)
    const base = st || reading
    if (base) {
      setSelectedStation({
        ...base,
        id: base.id || base.station_id,
        name: base.name || base.station_name,
        latitude: base.latitude,
        longitude: base.longitude,
        aqi: a.aqi,
      })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">

      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex-shrink-0 gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div>
            <h1 className="text-base font-bold text-white leading-none tracking-tight">
              AirSense AI
            </h1>
            <p className="text-xs text-slate-500">Urban Air Quality Intelligence</p>
          </div>
        </div>

        {/* City selector */}
        <CitySelector selectedCity={selectedCityId} onChange={handleCityChange} />

        {/* Right side info */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isMock && (
            <span
              title="Live sources unavailable — showing demo data"
              className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40"
            >
              ⚠ Demo data
            </span>
          )}
          {selectedStation && city.hasData && (
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-slate-400 text-xs">Station:</span>
              <span className="text-white font-medium text-xs">{selectedStation.name}</span>
              <AQIBadge aqi={selectedStation.aqi} />
            </div>
          )}
          {lastUpdated && (
            <p
              className={`text-xs hidden lg:block ${
                ageMinutes != null && ageMinutes > 60 ? 'text-amber-400' : 'text-slate-500'
              }`}
              title={`Fetched at ${lastUpdated.toLocaleTimeString()}`}
            >
              {ageLabel ? `Data ${ageLabel}` : lastUpdated.toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors font-medium flex-shrink-0"
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && city.hasData && (
        <div className="bg-red-900/40 border-b border-red-800 px-4 py-1.5 text-red-300 text-xs flex-shrink-0">
          ⚠ Backend issue: {error} — showing cached/mock data.
        </div>
      )}

      {/* ── AQI Legend ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-800/40 border-b border-slate-700/60 text-xs overflow-x-auto flex-shrink-0">
        <span className="text-slate-500 font-medium flex-shrink-0">AQI:</span>
        {[
          ['≤50',  '#00e400', 'Good'],
          ['≤100', '#ffff00', 'Moderate'],
          ['≤150', '#ff7e00', 'Sensitive'],
          ['≤200', '#ff0000', 'Unhealthy'],
          ['≤300', '#8f3f97', 'Very Unhealthy'],
          ['>300',  '#7e0023', 'Hazardous'],
        ].map(([range, color, label]) => (
          <div key={range} className="flex items-center gap-1 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
            <span style={{ color }} className="font-semibold">{range}</span>
            <span className="text-slate-600">{label}</span>
          </div>
        ))}
        <span className="text-slate-600 flex-shrink-0 ml-1 border-l border-slate-700 pl-3">
          ⬥ Orange pin = enforcement hotspot
        </span>
      </div>

      {/* ── Threshold alerts ── */}
      {alerts.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-900/30 border-b border-red-800/70 text-xs flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-red-300 font-semibold flex-shrink-0">
              🚨 {alerts.length} station{alerts.length > 1 ? 's' : ''} above AQI {alertThreshold}
            </span>
            <span className="text-red-200/80 truncate">{alerts[0].message}</span>
          </div>
          <button
            onClick={focusTopAlert}
            className="flex-shrink-0 px-2 py-1 rounded bg-red-700/50 hover:bg-red-700 text-red-100 transition-colors"
          >
            Focus worst →
          </button>
        </div>
      )}

      {/* ── Main layout: map + sidebar ── */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">

        {/* Map */}
        <div className="h-[48vh] md:h-auto md:flex-1 flex-shrink-0 relative min-w-0">
          {loading && !liveReadings.length ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
              <div className="text-center">
                <div className="text-4xl mb-3 animate-pulse">🌫️</div>
                <p className="text-slate-400 text-sm">
                  Fetching AQI data…
                </p>
              </div>
            </div>
          ) : (
            <AQIMap
              liveReadings={liveReadings}
              stations={stations}
              hotspots={hotspots}
              selectedStation={selectedStation}
              onStationSelect={setSelectedStation}
              cityCenter={[city.lat, city.lon]}
              cityZoom={city.zoom}
              wards={wards}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-80 xl:w-96 flex-1 md:flex-none min-h-0 border-t md:border-t-0 md:border-l border-slate-700 overflow-hidden">
          <Sidebar
            selectedStation={selectedStation}
            liveReadings={liveReadings}
            city={selectedCityId}
            cityHasData={city.hasData}
            dataSource={dataSource}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="hidden sm:flex items-center justify-between px-4 py-1.5 bg-slate-800 border-t border-slate-700 text-xs text-slate-500 flex-shrink-0">
        <span>
          {`${liveReadings.length} stations · ${hotspots.length} enforcement hotspots · ${city.fullName}`}
        </span>
        <span className="hidden sm:block">
          OpenAQ · Open-Meteo · NASA FIRMS · OSM · Groq LLaMA3-8b
        </span>
      </footer>
    </div>
  )
}
