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
export const fetchAQIHistory  = (id, days = 7)   => api.get(`/aqi/history/${id}`, { params: { days } })
export const fetchForecast    = (id, hours = 72) => api.get(`/forecast/${id}`,    { params: { hours } })
export const fetchEnforcement = (city = 'delhi') => api.get(`/enforcement/${city}`)
export const fetchAdvisory    = (city = 'delhi') => api.get(`/advisory/${city}`)

export default api
