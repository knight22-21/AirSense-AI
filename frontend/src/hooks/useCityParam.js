import { useSearchParams } from 'react-router-dom'
import { CITIES } from '../config/cities'

const DEFAULT_CITY = 'delhi'

export function useCityParam() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('city') || DEFAULT_CITY
  const city = CITIES.some(c => c.id === requested) ? requested : DEFAULT_CITY

  const setCity = (id) => {
    const next = new URLSearchParams(params)
    next.set('city', id)
    next.delete('station')
    setParams(next, { replace: true })
  }

  return [city, setCity]
}
