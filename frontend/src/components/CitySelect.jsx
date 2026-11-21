import React from 'react'
import { CITIES } from '../config/cities'

export default function CitySelect({ value, onChange, label = 'Select city', id = 'city-select', className = '' }) {
  return (
    <label className={`flex min-w-[190px] flex-col gap-1 ${className}`} htmlFor={id}>
      <span className="gov-label">{label}</span>
      <select
        id={id}
        className="gov-input"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {CITIES.map(city => (
          <option key={city.id} value={city.id}>
            {city.name} — {city.fullName}
          </option>
        ))}
      </select>
    </label>
  )
}
