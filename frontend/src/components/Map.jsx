import React, { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'

// Fix Leaflet default marker icons broken by Vite bundling
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export function aqiColor(aqi) {
  if (!aqi || aqi <= 0) return '#94a3b8'
  if (aqi <= 50)  return '#00e400'
  if (aqi <= 100) return '#ffff00'
  if (aqi <= 150) return '#ff7e00'
  if (aqi <= 200) return '#ff0000'
  if (aqi <= 300) return '#8f3f97'
  return '#7e0023'
}

export function aqiLabel(aqi) {
  if (!aqi || aqi <= 0) return 'No data'
  if (aqi <= 50)  return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy (Sensitive)'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

// Enforcement hotspot icon — teardrop shape in orange
const hotspotIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:26px;height:26px;background:#f97316;border:3px solid #fff;
    border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(0,0,0,0.6);
  "></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -30],
})

// Flies the map to `center` whenever it changes
function FlyToCity({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 })
  }, [map, center[0], center[1], zoom])
  return null
}

export default function AQIMap({
  liveReadings,
  stations,
  hotspots,
  onStationSelect,
  selectedStation,
  cityCenter,   // [lat, lon]
  cityZoom,
  cityHasData,
}) {
  // Merge live AQI values into the station list
  const stationAQI = {}
  liveReadings.forEach(r => { stationAQI[r.station_id] = r.aqi })

  const displayStations = stations.length > 0
    ? stations.map(s => ({ ...s, aqi: stationAQI[s.id] ?? null }))
    : liveReadings.map(r => ({
        id: r.station_id,
        name: r.station_name,
        latitude: r.latitude,
        longitude: r.longitude,
        aqi: r.aqi,
      }))

  return (
    <MapContainer
      center={cityCenter}
      zoom={cityZoom}
      className="w-full h-full"
      style={{ minHeight: '500px' }}
    >
      <FlyToCity center={cityCenter} zoom={cityZoom} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        opacity={0.6}
      />

      {/* "Coming soon" overlay when no data for this city */}
      {!cityHasData && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 1000,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15,23,42,0.72)', pointerEvents: 'none',
          }}
        >
          <p style={{ color: '#94a3b8', fontSize: 32, marginBottom: 8 }}>🏙️</p>
          <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16 }}>
            Data coming soon for this city
          </p>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
            Delhi is the only city with live / mock data in this MVP
          </p>
        </div>
      )}

      {/* AQI station circle markers */}
      {cityHasData && displayStations.map(station => {
        const color = aqiColor(station.aqi)
        const isSelected = selectedStation?.id === station.id
        return (
          <CircleMarker
            key={station.id}
            center={[station.latitude, station.longitude]}
            radius={isSelected ? 22 : 16}
            pathOptions={{
              color:       isSelected ? '#fff' : color,
              fillColor:   color,
              fillOpacity: 0.88,
              weight:      isSelected ? 3 : 2,
            }}
            eventHandlers={{ click: () => onStationSelect && onStationSelect(station) }}
          >
            <Popup>
              <div style={{ minWidth: 170 }}>
                <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{station.name}</p>
                <p style={{ color, fontWeight: 600 }}>
                  AQI: {station.aqi ? station.aqi.toFixed(0) : 'N/A'}
                </p>
                <p style={{ color: '#6b7280', fontSize: 12 }}>{aqiLabel(station.aqi)}</p>
                <p style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>
                  {station.latitude?.toFixed(4)}, {station.longitude?.toFixed(4)}
                </p>
                <button
                  onClick={() => onStationSelect && onStationSelect(station)}
                  style={{
                    marginTop: 8, padding: '4px 8px', background: '#2563eb',
                    color: '#fff', border: 'none', borderRadius: 4,
                    fontSize: 12, cursor: 'pointer', width: '100%',
                  }}
                >
                  View 72-hr Forecast →
                </button>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

      {/* Enforcement hotspot markers */}
      {cityHasData && hotspots.map(h => (
        <Marker
          key={`hotspot-${h.rank}`}
          position={[h.latitude, h.longitude]}
          icon={hotspotIcon}
        >
          <Popup>
            <div style={{ minWidth: 210 }}>
              <p style={{ fontWeight: 700, color: '#ea580c' }}>⚠ Enforcement Hotspot #{h.rank}</p>
              <p style={{ fontWeight: 600, marginTop: 4 }}>{h.location}</p>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                Risk score: {h.score}/100 · {h.source_type?.replace(/_/g, ' ')}
              </p>
              <div style={{ marginTop: 6 }}>
                {h.evidence_tags?.slice(0, 2).map((tag, i) => (
                  <span key={i} style={{
                    display: 'inline-block', fontSize: 10,
                    background: '#fff7ed', color: '#9a3412',
                    borderRadius: 4, padding: '2px 6px', marginRight: 4, marginTop: 2,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
              {h.summary && (
                <p style={{ fontSize: 11, color: '#4b5563', marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
                  {h.summary}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
