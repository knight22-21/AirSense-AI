import React, { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/dashboard', label: 'Live Dashboard' },
  { to: '/forecast', label: '72-Hour Forecast' },
  { to: '/enforcement', label: 'Enforcement' },
  { to: '/advisories', label: 'Citizen Advisories' },
  { to: '/about', label: 'About & Data' },
]

const PAGE_TITLES = {
  '/': 'Home',
  '/dashboard': 'Live Dashboard',
  '/forecast': '72-Hour Forecast',
  '/enforcement': 'Enforcement Intelligence',
  '/advisories': 'Citizen Advisories',
  '/about': 'About & Data',
}

function GovMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11 flex-shrink-0" aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="#0b3d6b" />
      <circle cx="24" cy="24" r="18" fill="none" stroke="#e08a00" strokeWidth="1.5" />
      <path d="M12 26c4-5 8-5 12 0s8 5 12 0" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 20c4-5 8-5 12 0s8 5 12 0" fill="none" stroke="#f6c15a" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 32c4-5 8-5 12 0s8 5 12 0" fill="none" stroke="#9fd3b1" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function TopStrip() {
  return (
    <div className="bg-gov-navyDeep text-white">
      <div className="gov-container flex flex-col gap-1 py-1.5 text-[11px] sm:flex-row sm:items-center sm:justify-between">
        <span className="font-medium tracking-wide">Urban Air Quality Intelligence Platform</span>
        <span className="text-slate-300">Academic prototype · Not an official government portal</span>
      </div>
    </div>
  )
}

function Masthead() {
  return (
    <div className="border-b border-gov-line bg-white">
      <div className="gov-container flex items-center gap-4 py-4">
        <GovMark />
        <div className="min-w-0">
          <p className="gov-kicker">Air quality monitoring & decision support</p>
          <Link to="/" className="block truncate font-serif text-xl font-bold tracking-tight text-gov-navy sm:text-2xl">
            AirSense AI
          </Link>
          <p className="mt-0.5 hidden text-xs text-gov-muted sm:block">
            Forecast · Source attribution · Enforcement priorities · Citizen advisories
          </p>
        </div>
        <div className="ml-auto hidden text-right lg:block">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Prototype build
          </span>
          <p className="mt-2 text-[11px] text-gov-muted">Five-city demonstration · Free-tier deployment</p>
        </div>
      </div>
    </div>
  )
}

function Navigation({ city }) {
  return (
    <nav className="bg-gov-navy text-white" aria-label="Primary navigation">
      <div className="gov-container flex overflow-x-auto">
        {NAV_ITEMS.map(item => {
          const target = `${item.to}?city=${city}`
          return (
            <NavLink
              key={item.to}
              to={target}
              end={item.end}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap border-b-4 px-4 py-3 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-gov-saffron bg-white/10 text-white'
                    : 'border-transparent text-slate-200 hover:bg-white/5 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function Footer({ city }) {
  const linkWithCity = (to) => `${to}?city=${city}`
  return (
    <footer className="mt-14 bg-gov-navy text-slate-200">
      <div className="gov-container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-serif text-lg font-bold text-white">AirSense AI</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            A decision-support prototype that connects air-quality monitoring, forecasting, source evidence, and public advisories.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gov-saffron">Platform</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white hover:underline" to={linkWithCity('/dashboard')}>Live dashboard</Link></li>
            <li><Link className="hover:text-white hover:underline" to={linkWithCity('/forecast')}>72-hour forecast</Link></li>
            <li><Link className="hover:text-white hover:underline" to={linkWithCity('/enforcement')}>Enforcement intelligence</Link></li>
            <li><Link className="hover:text-white hover:underline" to={linkWithCity('/advisories')}>Citizen advisories</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gov-saffron">Data sources</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li>OpenAQ v3 — station observations</li>
            <li>Open-Meteo — weather forecast</li>
            <li>NASA FIRMS — thermal anomalies</li>
            <li>OpenStreetMap — source locations</li>
            <li>Supabase — optional persistence</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gov-saffron">Important</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            This is an academic minor-project prototype, not an official government service. AQI values are indicative.
            Source attribution is an evidence-weighted ranking, not a legal finding.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="gov-container flex flex-col gap-2 py-4 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} AirSense AI · Minor project prototype</span>
          <span>Built with FastAPI, React, XGBoost, Leaflet, and free-tier services</span>
        </div>
      </div>
    </footer>
  )
}

export default function Layout() {
  const [params] = useSearchParams()
  const location = useLocation()
  const city = params.get('city') || 'delhi'

  useEffect(() => {
    const page = PAGE_TITLES[location.pathname] || 'Page'
    document.title = `${page} | AirSense AI`
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen flex-col bg-gov-mist">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[10000] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-gov-navy"
      >
        Skip to main content
      </a>
      <TopStrip />
      <Masthead />
      <Navigation city={city} />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <Footer city={city} />
    </div>
  )
}
