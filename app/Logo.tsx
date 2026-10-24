// TelePlanner mark: tiled monitor wall with a red check. Uses currentColor so it follows light/dark.
export function Mark({ size = 28 }: { size?: number }) {
  return (<svg width={size * 1.2} height={size} viewBox="0 0 120 100" aria-hidden="true" style={{ flex: 'none' }}>
    <rect x="0" y="0" width="64" height="60" rx="10" fill="currentColor" />
    <rect x="70" y="0" width="50" height="28" rx="9" fill="currentColor" />
    <rect x="70" y="33" width="50" height="27" rx="9" fill="#e5352b" />
    <path d="M85 47.5l7 7 14-14" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="0" y="66" width="120" height="34" rx="10" fill="currentColor" />
  </svg>);
}
export function Logo({ size = 28, tagline = false }: { size?: number; tagline?: boolean }) {
  return (<span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: size * 0.35 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.4 }}>
      <Mark size={size} />
      <span style={{ fontSize: size * 0.95, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}><b style={{ fontWeight: 700 }}>Tele</b><span style={{ fontWeight: 400 }}>Planner</span></span>
    </span>
    {tagline && <span style={{ fontSize: Math.max(11, size * 0.3), letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--mut)' }}>Monitor plans for live production</span>}
  </span>);
}
