import React, { useState } from 'react'
import AQIMap, { aqiColor, aqiLabel } from '../components/Map'
import Sidebar from '../components/Sidebar'
import { useAQIData, useEnforcement } from '../hooks/useAQI'
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
        {city.hasData
          ? <span className="text-xs text-green-400 font-normal">● Live</span>
          : <span className="text-xs text-slate-400 font-normal">Coming soon</span>
        }
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
                  {c.hasData ? (
                    <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                      ● Live data
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">
                      Coming soon
                    </span>
                  )}
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

  const { stations, liveReadings, loading, error, lastUpdated, refresh } = useAQIData(selectedCityId)
  const { hotspots } = useEnforcement(selectedCityId)

  // When city changes, clear station selection
  const handleCityChange = (id) => {
    setSelectedCityId(id)
    setSelectedStation(null)
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex-shrink-0 gap-3">
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
          {selectedStation && city.hasData && (
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-slate-400 text-xs">Station:</span>
              <span className="text-white font-medium text-xs">{selectedStation.name}</span>
              <AQIBadge aqi={selectedStation.aqi} />
            </div>
          )}
          {lastUpdated && (
            <p className="text-xs text-slate-500 hidden lg:block">
              {lastUpdated.toLocaleTimeString()}
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
          ⚠ Backend issue: {error} — showing cached/mock data for Delhi.
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

      {/* ── Main layout: map + sidebar ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Map */}
        <div className="flex-1 relative min-w-0">
          {loading && !liveReadings.length ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
              <div className="text-center">
                <div className="text-4xl mb-3 animate-pulse">🌫️</div>
                <p className="text-slate-400 text-sm">
                  {city.hasData ? 'Fetching AQI data…' : `Loading map for ${city.name}…`}
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
              cityHasData={city.hasData}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 xl:w-96 flex-shrink-0 border-l border-slate-700 overflow-hidden">
          <Sidebar
            selectedStation={selectedStation}
            liveReadings={liveReadings}
            city={selectedCityId}
            cityHasData={city.hasData}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="flex items-center justify-between px-4 py-1.5 bg-slate-800 border-t border-slate-700 text-xs text-slate-500 flex-shrink-0">
        <span>
          {city.hasData
            ? `${liveReadings.length} stations · ${hotspots.length} enforcement hotspots · ${city.fullName}`
            : `${city.fullName} — no data in MVP`
          }
        </span>
        <span className="hidden sm:block">
          OpenAQ · Open-Meteo · NASA FIRMS · OSM · Groq LLaMA3-8b
        </span>
      </footer>
    </div>
  )
}
