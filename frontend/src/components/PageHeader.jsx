import React from 'react'

export default function PageHeader({ kicker, title, description, actions, children }) {
  return (
    <div className="border-b border-gov-line bg-white">
      <div className="gov-container py-6 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            {kicker && <p className="gov-kicker">{kicker}</p>}
            <h1 className="gov-heading mt-1 text-2xl sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 text-sm leading-relaxed text-gov-muted">{description}</p>}
            {children}
          </div>
          {actions && <div className="flex flex-wrap items-end gap-3">{actions}</div>}
        </div>
      </div>
    </div>
  )
}
