import type { Theme } from '../types'

/* ─────────────────────────── BACKGROUND GLOW ─────────────────────────── */

export function BackgroundGlow({
  theme,
  position = '30%',
}: {
  theme: Theme
  position?: string
}) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px]"
      style={{
        top: position,
        background: `radial-gradient(ellipse 70% 55% at 50% 35%, ${theme.glowColor}, transparent 80%)`,
        filter: 'blur(80px)',
      }}
    />
  )
}

/* ─────────────────────────── SLIDE WRAPPER ─────────────────────────── */

export function SlideWrapper({
  width,
  height,
  theme,
  children,
}: {
  width: number
  height: number
  theme: Theme
  children: React.ReactNode
}) {
  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{ width, height, backgroundColor: theme.bg }}
    >
      {children}
    </div>
  )
}

/* ─────────────────────────── TITLE SLIDE ─────────────────────────── */

export function TitleSlide({
  width,
  height,
  theme,
  logo,
  title,
  subtitle,
  accentLine,
}: {
  width: number
  height: number
  theme: Theme
  logo?: React.ReactNode
  title: string
  subtitle?: string
  accentLine?: string
}) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="35%" />
      {logo && <div className="relative z-10 px-16 pt-14">{logo}</div>}
      <div className="relative z-10 px-16 pt-10 flex-1 flex flex-col justify-center">
        <h1
          className={`text-[64px] font-bold leading-[1.08] tracking-tight ${theme.textPrimary}`}
        >
          {title}
        </h1>
        {accentLine && (
          <h1
            className="text-[64px] font-bold leading-[1.08] tracking-tight"
            style={{ color: theme.accent }}
          >
            {accentLine}
          </h1>
        )}
        {subtitle && (
          <p className={`text-[24px] mt-6 leading-relaxed max-w-[85%] ${theme.textSecondary}`}>
            {subtitle}
          </p>
        )}
      </div>
    </SlideWrapper>
  )
}

/* ─────────────────────────── BULLETS SLIDE ─────────────────────────── */

export function BulletsSlide({
  width,
  height,
  theme,
  logo,
  sectionLabel,
  title,
  accentTitle,
  bullets,
}: {
  width: number
  height: number
  theme: Theme
  logo?: React.ReactNode
  sectionLabel?: string
  title?: string
  accentTitle?: string
  bullets: Array<{
    icon?: React.ReactNode
    text: string
    detail?: string
  }>
}) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="50%" />
      <div className="relative z-10 px-16 pt-14 flex items-center justify-between">
        {logo}
        {sectionLabel && (
          <span className={`text-[14px] tracking-wide uppercase ${theme.textMuted}`}>
            {sectionLabel}
          </span>
        )}
      </div>
      {(title || accentTitle) && (
        <div className="relative z-10 px-16 pt-8">
          {title && (
            <h2 className={`text-[44px] font-bold tracking-tight leading-tight ${theme.textPrimary}`}>
              {title}
            </h2>
          )}
          {accentTitle && (
            <h2
              className="text-[44px] font-bold tracking-tight leading-tight"
              style={{ color: theme.accent }}
            >
              {accentTitle}
            </h2>
          )}
        </div>
      )}
      <div className="relative z-10 px-16 pt-10 space-y-6">
        {bullets.map((bullet, i) => (
          <div key={i} className={`rounded-xl ${theme.cardBg} border ${theme.cardBorder} p-6`}>
            <div className="flex items-start gap-5">
              {bullet.icon && (
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  {bullet.icon}
                </div>
              )}
              <div>
                <span className={`text-[22px] leading-snug ${theme.textPrimary}`}>
                  {bullet.text}
                </span>
                {bullet.detail && (
                  <p className={`text-[16px] mt-2 ${theme.textMuted}`}>{bullet.detail}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SlideWrapper>
  )
}

/* ─────────────────────────── METRICS SLIDE ─────────────────────────── */

export function MetricsSlide({
  width,
  height,
  theme,
  logo,
  sectionLabel,
  title,
  accentTitle,
  metrics,
  children,
}: {
  width: number
  height: number
  theme: Theme
  logo?: React.ReactNode
  sectionLabel?: string
  title?: string
  accentTitle?: string
  metrics: Array<{
    icon?: React.ReactNode
    value: string
    label: string
    detail?: string
    color?: string
    bg?: string
  }>
  children?: React.ReactNode
}) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="30%" />
      <div className="relative z-10 px-16 pt-14 flex items-center justify-between">
        {logo}
        {sectionLabel && (
          <span className={`text-[14px] tracking-wide uppercase ${theme.textMuted}`}>
            {sectionLabel}
          </span>
        )}
      </div>
      {(title || accentTitle) && (
        <div className="relative z-10 px-16 pt-8">
          {title && (
            <h2 className={`text-[40px] font-bold tracking-tight leading-tight ${theme.textPrimary}`}>
              {title}
            </h2>
          )}
          {accentTitle && (
            <h2
              className="text-[40px] font-bold tracking-tight leading-tight"
              style={{ color: theme.accent }}
            >
              {accentTitle}
            </h2>
          )}
        </div>
      )}
      <div className={`relative z-10 px-16 pt-10 grid gap-5`} style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, 1fr)` }}>
        {metrics.map((stat, i) => (
          <div
            key={i}
            className={`rounded-xl ${theme.cardBg} border ${theme.cardBorder} p-6 text-center`}
          >
            {stat.icon && (
              <div className={`w-10 h-10 rounded-lg ${stat.bg || 'bg-white/[0.05]'} flex items-center justify-center mx-auto mb-3`}>
                {stat.icon}
              </div>
            )}
            <div className={`text-[36px] font-bold ${theme.textPrimary}`}>{stat.value}</div>
            <div className={`text-[15px] mt-1 leading-snug ${theme.textSecondary}`}>
              {stat.label}
            </div>
            {stat.detail && (
              <div className={`text-[12px] mt-2 leading-snug ${theme.textMuted}`}>
                {stat.detail}
              </div>
            )}
          </div>
        ))}
      </div>
      {children && <div className="relative z-10 px-16 pt-8">{children}</div>}
    </SlideWrapper>
  )
}

/* ─────────────────────────── CTA SLIDE ─────────────────────────── */

export function CTASlide({
  width,
  height,
  theme,
  logo,
  headline,
  ctaText,
  ctaUrl,
  subtitle,
}: {
  width: number
  height: number
  theme: Theme
  logo?: React.ReactNode
  headline?: string
  ctaText: string
  ctaUrl?: string
  subtitle?: string
}) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} position="50%" />
      {logo && <div className="relative z-10 px-16 pt-14">{logo}</div>}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 px-16">
        {headline && (
          <h2 className={`text-[48px] font-bold text-center leading-tight ${theme.textPrimary}`}>
            {headline}
          </h2>
        )}
        <div
          data-cta="true"
          data-url={ctaUrl}
          className={`px-12 py-5 rounded-xl ${theme.accentBg} text-white text-[28px] font-semibold tracking-wide text-center`}
        >
          {ctaText}
        </div>
        {subtitle && (
          <span className={`text-[16px] ${theme.textMuted}`}>{subtitle}</span>
        )}
      </div>
    </SlideWrapper>
  )
}

/* ─────────────────────────── CONTENT SLIDE (freeform) ─────────────────────────── */

export function ContentSlide({
  width,
  height,
  theme,
  children,
}: {
  width: number
  height: number
  theme: Theme
  children: React.ReactNode
}) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} />
      <div className="relative z-10 flex-1">{children}</div>
    </SlideWrapper>
  )
}

/* ─────────────────────────── PAGE FOOTER ─────────────────────────── */

export function SlideFooter({
  theme,
  pageNum,
  totalPages,
  label,
}: {
  theme: Theme
  pageNum: number
  totalPages: number
  label?: string
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 px-16 pb-8 flex items-center justify-between">
      <span className={`text-[14px] ${theme.textMuted}`}>{label || ''}</span>
      <span className={`text-[14px] ${theme.textMuted}`}>
        {pageNum} / {totalPages}
      </span>
    </div>
  )
}
