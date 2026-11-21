import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="gov-container flex min-h-[55vh] items-center justify-center py-12">
      <div className="max-w-xl text-center">
        <p className="gov-kicker">Error 404</p>
        <h1 className="gov-heading mt-2 text-4xl">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-gov-muted">
          The page you requested does not exist in this prototype. Use the navigation above or return to the live
          dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/" className="gov-btn">Return home</Link>
          <Link to="/dashboard?city=delhi" className="gov-btn-secondary">Open dashboard</Link>
        </div>
      </div>
    </div>
  )
}
