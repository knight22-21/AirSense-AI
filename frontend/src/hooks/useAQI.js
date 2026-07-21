import { useState, useEffect, useCallback } from 'react'
import {
  fetchStations,
  fetchLiveAQI,
  fetchForecast,
  fetchEnforcement,
  fetchAdvisory,
} from '../services/api'

export function useAQIData(city = 'delhi') {
  const [stations, setStations]         = useState([])
  const [liveReadings, setLiveReadings] = useState([])
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
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load AQI data')
      setStations([])
      setLiveReadings([])
    } finally {
      setLoading(false)
    }
  }, [city])

  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  return { stations, liveReadings, loading, error, lastUpdated, refresh: load }
}

export function useForecast(stationId) {
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!stationId) return
    setLoading(true)
    setError(null)
    fetchForecast(stationId, 72)
      .then(res => setForecast(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [stationId])

  return { forecast, loading, error }
}

export function useEnforcement(city = 'delhi') {
  const [hotspots, setHotspots] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    setHotspots([])
    fetchEnforcement(city)
      .then(res => setHotspots(res.data.hotspots || []))
      .catch(() => setHotspots([]))
      .finally(() => setLoading(false))
  }, [city])

  return { hotspots, loading }
}

export function useAdvisory(city = 'delhi') {
  const [advisory, setAdvisory] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    setLoading(true)
    setAdvisory(null)
    fetchAdvisory(city)
      .then(res => setAdvisory(res.data))
      .catch(() => setAdvisory(null))
      .finally(() => setLoading(false))
  }, [city])

  return { advisory, loading }
}
