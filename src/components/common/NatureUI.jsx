export function NaturePage({ children, className = '', ...props }) {
  return (
    <div className={`nature-page ${className}`} {...props}>
      <span className="nature-deco nature-deco--top" aria-hidden="true" />
      <span className="nature-deco nature-deco--bottom" aria-hidden="true" />
      {children}
    </div>
  )
}

export function NatureSectionTitle({ icon: Icon, iconSrc, title, description, aside }) {
  return (
    <div className="nature-section-title">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-2xl font-black text-[var(--nature-ink)] sm:text-3xl">
          {iconSrc ? (
            <span className="grid h-20 w-20 place-items-center overflow-visible" aria-hidden="true">
              <img src={iconSrc} alt="" className="h-20 w-20 scale-110 object-contain drop-shadow-sm" />
            </span>
          ) : Icon && (
            <span className="nature-title-icon" aria-hidden="true">
              <Icon size={24} strokeWidth={2.6} />
            </span>
          )}
          <span>{title}</span>
        </h2>
        {description && <p className="mt-2 text-sm font-semibold text-[var(--nature-muted)] sm:text-base">{description}</p>}
      </div>
      {aside && <div className="nature-title-aside">{aside}</div>}
    </div>
  )
}

export function NaturePanel({ children, className = '', ...props }) {
  return <section className={`nature-panel ${className}`} {...props}>{children}</section>
}

export function NatureCard({ children, className = '', ...props }) {
  return <div className={`nature-card ${className}`} {...props}>{children}</div>
}

export function NatureTab({ active, children, className = '', ...props }) {
  return (
    <button type="button" className={`nature-tab ${active ? 'nature-tab--active' : ''} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function NatureButton({ children, className = '', variant = 'primary', ...props }) {
  return (
    <button type="button" className={`nature-button nature-button--${variant} ${className}`} {...props}>
      {children}
    </button>
  )
}
