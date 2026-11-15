import { useState, useEffect, useCallback } from 'react'
import {
  fetchStations,
  fetchLiveAQI,
  fetchForecast,
  fetchEnforcement,
  fetchAdvisory,
  fetchWards,
  fetchWardAdvisories,
  fetchAlerts,
} from '../services/api'

export function useAQIData(city = 'delhi') {
  const [stations, setStations]         = useState([])
  const [liveReadings, setLiveReadings] = useState([])
  const [dataSource, setDataSource]     = useState(null)
  const [dataAgeMinutes, setDataAge]    = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [lastUpdated, setLastUpdated]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [stRes, liveRes] = await Promise.all([
        fetchStations(city),
        fetchLiveAQI(city),
      ])
      setStations(stRes.data.stations || [])
      setLiveReadings(liveRes.data.readings || [])
      setDataSource(liveRes.data.data_source || null)
      setDataAge(liveRes.data.data_age_minutes ?? null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load AQI data')
      setStations([])
      setLiveReadings([])
      setDataSource(null)
      setDataAge(null)
    } finally {
      setLoading(false)
    }
  }, [city])

  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  return { stations, liveReadings, dataSource, dataAgeMinutes, loading, error, lastUpdated, refresh: load }
}

export function useForecast(stationId, city = 'delhi') {
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!stationId) return
    setLoading(true)
    setError(null)
    fetchForecast(stationId, 72, city)
      .then(res => setForecast(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [stationId, city])

  return { forecast, loading, error }
}

export function useEnforcement(city = 'delhi') {
  const [hotspots, setHotspots]     = useState([])
  const [sourceMix, setSourceMix]   = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    setLoading(true)
    setHotspots([])
    setSourceMix(null)
    fetchEnforcement(city)
      .then(res => {
        setHotspots(res.data.hotspots || [])
        setSourceMix(res.data.source_mix || null)
        setDataSource(res.data.data_source || null)
      })
      .catch(() => setHotspots([]))
      .finally(() => setLoading(false))
  }, [city])

  return { hotspots, sourceMix, dataSource, loading }
}

export function useAdvisory(city = 'delhi', stationId = null) {
  const [advisory, setAdvisory] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    setAdvisory(null)
    fetchAdvisory(city, stationId)
      .then(res => setAdvisory(res.data))
      .catch(() => setAdvisory(null))
      .finally(() => setLoading(false))
  }, [city, stationId])

  return { advisory, loading }
}

export function useWards(city = 'delhi') {
  const [wards, setWards] = useState(null)

  useEffect(() => {
    setWards(null)
    fetchWards(city)
      .then(res => setWards(res.data))
      .catch(() => setWards(null))
  }, [city])

  return wards
}

export function useWardAdvisories(city = 'delhi') {
  const [wards, setWards]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setWards([])
    fetchWardAdvisories(city)
      .then(res => setWards(res.data.wards || []))
      .catch(() => setWards([]))
      .finally(() => setLoading(false))
  }, [city])

  return { wards, loading }
}

export function useAlerts(city = 'delhi', threshold = 200) {
  const [alerts, setAlerts]         = useState([])
  const [dataSource, setDataSource] = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    setLoading(true)
    setAlerts([])
    fetchAlerts(city, { threshold })
      .then(res => {
        setAlerts(res.data.alerts || [])
        setDataSource(res.data.data_source || null)
      })
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }, [city, threshold])

  return { alerts, count: alerts.length, dataSource, loading, threshold }
}
