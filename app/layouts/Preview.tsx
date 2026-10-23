export function LayoutPreview({ tiles, width = 160 }: { tiles: any[]; width?: number }) {
  return (<svg viewBox="0 0 1600 900" width={width} style={{ background: '#000', border: '1px solid #444' }}>
    {tiles.map(t => (<g key={t.n}><rect x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} fill="#1d2a44" stroke="#4f8cff" strokeWidth="4" />
      <text x={t.x + t.w / 2} y={t.y + t.h / 2} fill="#fff" fontSize="120" textAnchor="middle" dominantBaseline="middle">{t.n}</text></g>))}</svg>);
}

