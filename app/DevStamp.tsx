// Dev site only: a rubber-stamp style "DEVELOPMENT SITE" mark, slightly crooked, laid across the logo so nobody mistakes this for the live site.
export default function DevStamp() {
  return (<svg aria-label="Development site" role="img" viewBox="0 0 230 60" width="200" height="52" style={{ position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%) rotate(-7deg)', pointerEvents: 'none', mixBlendMode: 'normal', zIndex: 5, overflow: 'visible' }}>
    <defs>
      <filter id="inkroughen" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency="0.045 0.09" numOctaves="3" seed="3" result="blot" />
        <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.65" result="mask" />
        <feComposite in="rough" in2="mask" operator="in" />
      </filter>
    </defs>
    <g filter="url(#inkroughen)" fill="none" stroke="#ff4b3e" opacity="0.95">
      <rect x="3" y="3" width="224" height="54" rx="5" strokeWidth="4" />
      <rect x="9" y="9" width="212" height="42" rx="2" strokeWidth="1.5" />
      <text x="115" y="39" textAnchor="middle" fill="#ff4b3e" stroke="none" fontSize="25" fontWeight="900" textLength="196" lengthAdjust="spacingAndGlyphs" style={{ fontFamily: 'Impact, "Arial Black", "Haettenschweiler", sans-serif', textTransform: 'uppercase' }}>DEVELOPMENT SITE</text>
    </g></svg>);
}
