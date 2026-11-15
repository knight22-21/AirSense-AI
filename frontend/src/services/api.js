import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export const fetchStations    = (city = 'delhi') => api.get('/aqi/stations', { params: { city } })
export const fetchLiveAQI     = (city = 'delhi') => api.get('/aqi/live',     { params: { city } })
export const fetchCityAQI     = (city = 'delhi') => api.get(`/aqi/city/${city}`)
export const fetchWards       = (city = 'delhi', withAqi = true) =>
  api.get(`/aqi/wards/${city}`, { params: withAqi ? { with_aqi: true } : {} })
export const fetchAQIHistory  = (id, days = 7, city = 'delhi') =>
  api.get(`/aqi/history/${id}`, { params: { days, city } })
export const fetchForecast    = (id, hours = 72, city = 'delhi') =>
  api.get(`/forecast/${id}`, { params: { hours, city } })
export const fetchEnforcement = (city = 'delhi', { limit = 3, sourceType } = {}) =>
  api.get(`/enforcement/${city}`, { params: { limit, ...(sourceType ? { source_type: sourceType } : {}) } })
export const fetchAdvisory    = (city = 'delhi', stationId) =>
  api.get(`/advisory/${city}`, { params: stationId ? { station_id: stationId } : {} })
export const fetchWardAdvisories = (city = 'delhi') => api.get(`/advisory/${city}/wards`)
export const fetchAlerts      = (city = 'delhi', { threshold = 200, hours = 24 } = {}) =>
  api.get(`/alerts/${city}`, { params: { threshold, hours } })

export default api
