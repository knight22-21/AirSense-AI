import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, Rectangle, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export function aqiColor(aqi) {
  if (!aqi || aqi <= 0) return '#64748b'
  if (aqi <= 50) return '#15803d'
  if (aqi <= 100) return '#a16207'
  if (aqi <= 150) return '#c2410c'
  if (aqi <= 200) return '#b91c1c'
  if (aqi <= 300) return '#7e22ce'
  return '#7f1d1d'
}

export function aqiLabel(aqi) {
  if (!aqi || aqi <= 0) return 'No data'
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy (Sensitive)'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

const hotspotIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:26px;height:26px;background:#c2410c;border:3px solid #ffffff;
    border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    box-shadow:0 2px 6px rgba(15,23,42,0.35);
  "></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -30],
})

function FlyToCity({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 })
  }, [map, center[0], center[1], zoom])
  return null
}

const GRID_N = 14
const HALF_SPAN_LAT = 0.22
const HALF_SPAN_LON = 0.26

function idwAQI(lat, lon, pts) {
  let num = 0
  let den = 0
  for (const p of pts) {
    const d2 = (p.latitude - lat) ** 2 + (p.longitude - lon) ** 2
    if (d2 < 1e-8) return p.aqi
    const w = 1 / d2
    num += w * p.aqi
    den += w
  }
  return den ? num / den : null
}

function HeatLayer({ center, points }) {
  const cells = useMemo(() => {
    if (!points.length) return []
    const out = []
    const dLat = (2 * HALF_SPAN_LAT) / GRID_N
    const dLon = (2 * HALF_SPAN_LON) / GRID_N
    for (let i = 0; i < GRID_N; i++) {
      for (let j = 0; j < GRID_N; j++) {
        const south = center[0] - HALF_SPAN_LAT + i * dLat
        const west = center[1] - HALF_SPAN_LON + j * dLon
        const aqi = idwAQI(south + dLat / 2, west + dLon / 2, points)
        out.push({ key: `${i}-${j}`, aqi, bounds: [[south, west], [south + dLat, west + dLon]] })
      }
    }
    return out
  }, [center[0], center[1], points])

  return cells.map(c => (
    <Rectangle
      key={c.key}
      bounds={c.bounds}
      pathOptions={{ stroke: false, fillColor: aqiColor(c.aqi), fillOpacity: 0.22, interactive: false }}
    />
  ))
}

function WardLayer({ wards, points }) {
  const data = useMemo(() => {
    if (!wards?.features?.length) return null
    return {
      ...wards,
      features: wards.features.map(f => {
        const props = f.properties || {}
        if (props.aqi != null) {
          return { ...f, properties: { ...props, _aqi: props.aqi, _source: 'idw' } }
        }
        if (!points.length) {
          return { ...f, properties: { ...props, _aqi: null, _source: null } }
        }
        const c = L.geoJSON(f).getBounds().getCenter()
        let best = points[0]
        let bd = Infinity
        for (const p of points) {
          const d = (p.latitude - c.lat) ** 2 + (p.longitude - c.lng) ** 2
          if (d < bd) {
            bd = d
            best = p
          }
        }
        return { ...f, properties: { ...props, _aqi: best.aqi, _source: 'nearest' } }
      }),
    }
  }, [wards, points])

  if (!data) return null
  const sig = data.features.length + ':' + data.features.reduce((a, f) => a + (f.properties._aqi || 0), 0)
  return (
    <GeoJSON
      key={sig}
      data={data}
      style={f => ({
        color: '#64748b',
        weight: 1,
        opacity: 0.45,
        fillColor: aqiColor(f.properties._aqi),
        fillOpacity: f.properties._source === 'idw' ? 0.3 : 0.2,
      })}
      onEachFeature={(f, layer) => {
        const aqi = f.properties._aqi
        const source = f.properties._source === 'idw'
          ? 'interpolated (IDW)'
          : f.properties._source === 'nearest' ? 'nearest station' : ''
        layer.bindPopup(
          `<div style="font-family:Inter,system-ui,sans-serif;min-width:160px">
            <b style="color:#0b3d6b">${f.properties.name || 'Ward'}</b><br/>
            <span style="color:${aqiColor(aqi)};font-weight:700">AQI ${aqi ? aqi.toFixed(0) : 'N/A'} · ${aqiLabel(aqi)}</span>
            ${source ? `<br/><span style="color:#6b7280;font-size:11px">${source}</span>` : ''}
          </div>`
        )
      }}
    />
  )
}

function LayerControls({ layers, setLayers }) {
  const stop = e => e.stopPropagation()
  const items = [['heat', 'AQI heat layer'], ['wards', 'Ward boundaries'], ['hotspots', 'Enforcement hotspots']]
  return (
    <div
      onClick={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
      onTouchStart={stop}
      onWheel={stop}
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid #d8e0ea',
        borderRadius: 6,
        padding: '7px 10px',
        color: '#1f2937',
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
      }}
    >
      <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5b6b7f' }}>
        Map layers
      </p>
      {items.map(([k, label]) => (
        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={layers[k]}
            onChange={e => setLayers(l => ({ ...l, [k]: e.target.checked }))}
            style={{ accentColor: '#0b3d6b' }}
          />
          {label}
        </label>
      ))}
    </div>
  )
}

export default function AQIMap({
  liveReadings,
  stations,
  hotspots,
  onStationSelect,
  onViewForecast,
  onViewEnforcement,
  selectedStation,
  cityCenter,
  cityZoom,
  wards,
}) {
  const [layers, setLayers] = useState({ heat: true, wards: true, hotspots: true })
  const latestReading = {}
  liveReadings.forEach(r => { latestReading[r.station_id] = r })

  const displayStations = stations.length > 0
    ? stations.map(s => ({
        ...s,
        aqi: latestReading[s.id]?.aqi ?? null,
        timestamp: latestReading[s.id]?.timestamp,
        source: latestReading[s.id]?.source,
      }))
    : liveReadings.map(r => ({
        id: r.station_id,
        name: r.station_name,
        latitude: r.latitude,
        longitude: r.longitude,
        aqi: r.aqi,
        timestamp: r.timestamp,
        source: r.source,
      }))

  const aqiPoints = useMemo(
    () => displayStations.filter(s => s.aqi && s.latitude != null && s.longitude != null),
    [stations, liveReadings]
  )

  return (
    <MapContainer
      center={cityCenter}
      zoom={cityZoom}
      className="w-full h-full"
      style={{ minHeight: '280px' }}
    >
      <FlyToCity center={cityCenter} zoom={cityZoom} />

      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        opacity={0.82}
      />

      <LayerControls layers={layers} setLayers={setLayers} />

      {layers.heat && <HeatLayer center={cityCenter} points={aqiPoints} />}
      {layers.wards && <WardLayer wards={wards} points={aqiPoints} />}

      {displayStations.map(station => {
        const color = aqiColor(station.aqi)
        const isSelected = selectedStation?.id === station.id
        return (
          <CircleMarker
            key={station.id}
            center={[station.latitude, station.longitude]}
            radius={isSelected ? 21 : 14}
            pathOptions={{
              color: isSelected ? '#0b3d6b' : '#ffffff',
              fillColor: color,
              fillOpacity: 0.92,
              weight: isSelected ? 4 : 2,
            }}
            eventHandlers={{ click: () => onStationSelect && onStationSelect(station) }}
          >
            <Popup>
              <div style={{ minWidth: 190, fontFamily: 'Inter,system-ui,sans-serif' }}>
                <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 4px', color: '#0b3d6b' }}>{station.name}</p>
                <p style={{ color, fontWeight: 700, margin: 0 }}>
                  AQI: {station.aqi ? station.aqi.toFixed(0) : 'N/A'}
                </p>
                <p style={{ color: '#5b6b7f', fontSize: 12, margin: '2px 0 0' }}>{aqiLabel(station.aqi)}</p>
                <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 5, marginBottom: 0 }}>
                  {station.latitude?.toFixed(4)}, {station.longitude?.toFixed(4)}
                </p>
                {station.timestamp && !Number.isNaN(new Date(station.timestamp).getTime()) && (
                  <p style={{ color: '#94a3b8', fontSize: 11, margin: '2px 0 0' }}>
                    Observed {new Date(station.timestamp).toLocaleString()}
                  </p>
                )}
                <button
                  onClick={() => (onViewForecast ? onViewForecast(station) : onStationSelect && onStationSelect(station))}
                  style={{
                    marginTop: 9,
                    padding: '6px 8px',
                    background: '#0b3d6b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  View 72-hour forecast →
                </button>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

      {layers.hotspots && hotspots.map(h => (
        <Marker
          key={`hotspot-${h.rank}`}
          position={[h.latitude, h.longitude]}
          icon={hotspotIcon}
        >
          <Popup>
            <div style={{ minWidth: 220, fontFamily: 'Inter,system-ui,sans-serif' }}>
              <p style={{ fontWeight: 700, color: '#c2410c', margin: 0 }}>Enforcement hotspot #{h.rank}</p>
              <p style={{ fontWeight: 700, marginTop: 4, color: '#0b3d6b' }}>{h.location}</p>
              <p style={{ fontSize: 11, color: '#5b6b7f', marginTop: 3 }}>
                Risk score: {h.score}/100 · {h.source_type?.replace(/_/g, ' ')}
              </p>
              {h.confidence != null && (
                <p style={{ fontSize: 11, color: '#5b6b7f', margin: '2px 0' }}>
                  Confidence: {Math.round(h.confidence * 100)}% · priority {h.priority || '—'}
                </p>
              )}
              {h.receptor_station && (
                <p style={{ fontSize: 11, color: '#5b6b7f', margin: '2px 0' }}>
                  Affects {h.receptor_station}
                  {h.distance_km != null ? ` (${h.distance_km} km)` : ''}
                  {h.upwind ? ' · upwind' : ''}
                </p>
              )}
              <div style={{ marginTop: 6 }}>
                {h.evidence_tags?.slice(0, 2).map((tag, i) => (
                  <span key={i} style={{
                    display: 'inline-block',
                    fontSize: 10,
                    background: '#fff7ed',
                    color: '#9a3412',
                    borderRadius: 4,
                    padding: '2px 6px',
                    marginRight: 4,
                    marginTop: 2,
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
              {onViewEnforcement && (
                <button
                  onClick={() => onViewEnforcement(h)}
                  style={{
                    marginTop: 9,
                    padding: '6px 8px',
                    background: '#c2410c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Open enforcement priorities →
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
