import React, { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AQIMap, { aqiColor, aqiLabel } from '../components/Map'
import CitySelect from '../components/CitySelect'
import ForecastChart from '../components/ForecastChart'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { useAQIData, useForecast, useWards } from '../hooks/useAQI'
import { useCityParam } from '../hooks/useCityParam'
import { getCityById } from '../config/cities'

function valueTone(aqi) {
  if (aqi == null) return 'slate'
  if (aqi > 200) return 'red'
  if (aqi > 100) return 'saffron'
  return 'green'
}

function hourValue(forecast, hour) {
  const list = forecast?.forecasts || []
  if (!list.length) return null
  return list[Math.min(hour - 1, list.length - 1)]?.aqi ?? null
}

export default function Forecast() {
  const [cityId, setCityId] = useCityParam()
  const [params, setParams] = useSearchParams()
  const city = getCityById(cityId)
  const requestedStation = params.get('station')

  const { stations, liveReadings, dataSource, loading, error } = useAQIData(cityId)
  const wards = useWards(cityId)

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
    return base.map(s => ({
      ...s,
      aqi: s.latest?.aqi ?? null,
      timestamp: s.latest?.timestamp,
      source: s.latest?.source,
    }))
  }, [stations, liveReadings])

  const station = useMemo(
    () => mergedStations.find(s => s.id === requestedStation) || null,
    [mergedStations, requestedStation]
  )

  useEffect(() => {
    if (!mergedStations.length) return
    if (requestedStation && mergedStations.some(s => s.id === requestedStation)) return
    const fallback = [...mergedStations].sort((a, b) => (b.aqi ?? -1) - (a.aqi ?? -1))[0]
    if (!fallback) return
    const next = new URLSearchParams(params)
    next.set('station', fallback.id)
    setParams(next, { replace: true })
  }, [mergedStations, requestedStation, params, setParams])

  const { forecast, loading: forecastLoading, error: forecastError } = useForecast(
    station?.id,
    cityId,
    Boolean(station)
  )

  const selectStation = (id) => {
    const next = new URLSearchParams(params)
    next.set('station', id)
    setParams(next, { replace: true })
  }

  const values = useMemo(() => {
    const list = (forecast?.forecasts || []).map(f => f.aqi).filter(Number.isFinite)
    return {
      peak: list.length ? Math.max(...list) : null,
      avg: list.length ? list.reduce((a, b) => a + b, 0) / list.length : null,
    }
  }, [forecast])

  const stationHref = station ? `/dashboard?city=${cityId}` : `/dashboard?city=${cityId}`

  return (
    <div>
      <PageHeader
        kicker="Forecast service"
        title="72-hour station forecast"
        description="Hourly AQI forecasts with a 24 / 48 / 72-hour outlook. Accuracy is reported against a persistence baseline, and the validation horizon is shown when history is limited."
        actions={
          <>
            <CitySelect value={cityId} onChange={setCityId} />
            <label className="flex min-w-[220px] flex-col gap-1">
              <span className="gov-label">Station</span>
              <select
                className="gov-input disabled:cursor-not-allowed disabled:bg-slate-50"
                value={station?.id || ''}
                onChange={e => selectStation(e.target.value)}
                disabled={!mergedStations.length}
              >
                {!mergedStations.length && <option value="">Loading stations…</option>}
                {mergedStations.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-gov-line bg-white px-2.5 py-1 font-semibold text-gov-muted">
            {city.fullName}
          </span>
          <span className="rounded-full border border-gov-line bg-white px-2.5 py-1 font-semibold text-gov-muted">
            {mergedStations.length} stations available
          </span>
          {dataSource === 'mock' && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
              Demonstration data
            </span>
          )}
        </div>
      </PageHeader>

      <div className="gov-container py-6">
        {error && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Backend warning: {error}. Forecasts may use cached or demonstration inputs.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Current station AQI"
            value={station?.aqi == null ? '—' : Number(station.aqi).toFixed(0)}
            helper={station ? aqiLabel(station.aqi) : 'Select a station'}
            tone={valueTone(station?.aqi)}
          />
          <StatCard label="Next 24 hours" value={hourValue(forecast, 24) == null ? '—' : Number(hourValue(forecast, 24)).toFixed(0)} helper="Forecast AQI at +24h" tone={valueTone(hourValue(forecast, 24))} />
          <StatCard label="Next 48 hours" value={hourValue(forecast, 48) == null ? '—' : Number(hourValue(forecast, 48)).toFixed(0)} helper="Forecast AQI at +48h" tone={valueTone(hourValue(forecast, 48))} />
          <StatCard label="Next 72 hours" value={hourValue(forecast, 72) == null ? '—' : Number(hourValue(forecast, 72)).toFixed(0)} helper="Forecast AQI at +72h" tone={valueTone(hourValue(forecast, 72))} />
          <StatCard
            label="Peak in horizon"
            value={values.peak == null ? '—' : values.peak.toFixed(0)}
            helper={values.avg == null ? 'No forecast data' : `Mean ${values.avg.toFixed(0)} · ${forecast?.model === 'xgboost' ? 'XGBoost' : 'fallback'}`}
            tone={valueTone(values.peak)}
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_0.75fr]">
          <section className="gov-card p-5">
            <ForecastChart
              station={station}
              city={cityId}
              forecast={forecast}
              loading={forecastLoading}
              error={forecastError}
            />
          </section>

          <div className="space-y-4">
            <section className="gov-card p-4">
              <p className="gov-label">Selected station</p>
              {station ? (
                <>
                  <h2 className="mt-1 font-serif text-lg font-bold text-gov-navy">{station.name}</h2>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="font-serif text-4xl font-bold" style={{ color: aqiColor(station.aqi) }}>
                      {station.aqi == null ? '—' : Number(station.aqi).toFixed(0)}
                    </span>
                    <span className="pb-1 text-sm font-semibold" style={{ color: aqiColor(station.aqi) }}>
                      {aqiLabel(station.aqi)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gov-muted">
                    The forecast uses recent station history, time-of-day and calendar features, and weather inputs. The
                    validation section below states how much history was available.
                  </p>
                  <Link to={stationHref} className="gov-btn-secondary mt-4 w-full">
                    Back to live dashboard
                  </Link>
                </>
              ) : (
                <p className="mt-2 rounded-md border border-dashed border-gov-line bg-gov-mist p-4 text-sm text-gov-muted">
                  {loading ? 'Loading stations…' : 'Select a station from the list or map.'}
                </p>
              )}
            </section>

            <section className="gov-card p-4">
              <p className="gov-label">Model validation</p>
              {forecast?.metrics ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-gov-line pb-2">
                    <dt className="text-gov-muted">Model</dt>
                    <dd className="font-semibold text-gov-ink">{forecast.model === 'xgboost' ? 'XGBoost' : 'Statistical fallback'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-gov-line pb-2">
                    <dt className="text-gov-muted">Validation RMSE</dt>
                    <dd className="font-semibold text-gov-ink">{forecast.metrics.rmse == null ? '—' : Number(forecast.metrics.rmse).toFixed(1)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-gov-line pb-2">
                    <dt className="text-gov-muted">Persistence RMSE</dt>
                    <dd className="font-semibold text-gov-ink">{forecast.metrics.persistence_rmse == null ? '—' : Number(forecast.metrics.persistence_rmse).toFixed(1)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-gov-muted">Backtest horizon</dt>
                    <dd className="font-semibold text-gov-ink">{forecast.metrics.horizon_hours == null ? '72h' : `${forecast.metrics.horizon_hours}h`}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-gov-muted">Validation metrics appear after a forecast is generated.</p>
              )}
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-gov-muted">
                RMSE is a hold-out error measured during model fitting. It is not a guarantee of future accuracy.
              </p>
            </section>

            <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Interpretation note</p>
              <p className="mt-2 text-sm leading-relaxed text-amber-900">
                Forecasts are decision support, not official warnings. Use the live dashboard and local authority guidance
                for operational decisions.
              </p>
            </section>
          </div>
        </div>

        <section className="gov-card mt-5 overflow-hidden">
          <div className="border-b border-gov-line px-4 py-3">
            <p className="gov-label">Station forecast map</p>
            <p className="text-sm font-semibold text-gov-navy">Select any station to update the forecast</p>
          </div>
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative h-[360px] sm:h-[420px]">
              {loading && !liveReadings.length ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gov-mist">
                  <p className="text-sm text-gov-muted">Loading station map…</p>
                </div>
              ) : (
                <AQIMap
                  liveReadings={liveReadings}
                  stations={stations}
                  hotspots={[]}
                  selectedStation={station}
                  onStationSelect={s => selectStation(s.id)}
                  cityCenter={[city.lat, city.lon]}
                  cityZoom={city.zoom}
                  wards={wards}
                />
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto border-t border-gov-line p-4 lg:border-l lg:border-t-0">
              <p className="gov-label">Station list</p>
              <div className="mt-2 divide-y divide-gov-line">
                {mergedStations.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectStation(s.id)}
                    className={`flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                      station?.id === s.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gov-navy">{s.name}</p>
                      <p className="text-[11px] text-gov-muted">{s.source || 'station'}</p>
                    </div>
                    <span className="font-serif text-lg font-bold" style={{ color: aqiColor(s.aqi) }}>
                      {s.aqi == null ? '—' : Number(s.aqi).toFixed(0)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
