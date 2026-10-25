import type { DAsset } from './assets';
import { TILE_W, TILE_H } from './assets';

const LEVELS = [0.82, 0.64, 0.9, 0.55, 0.72, 0.6, 0.85, 0.5, 0.78, 0.66, 0.88, 0.58, 0.74, 0.62, 0.8, 0.52];
const num = (v: any, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d; };

// Draws one Tile Asset to fill its own box (viewBox = the asset's own size, so nothing is stretched).
export function AssetArt({ a }: { a: DAsset }) {
  const p = a.props ?? {}, w = a.w, h = a.h;
  let inner: React.ReactNode = null;
  if (a.type === 'umd') {
    const text = String(p.text ?? '').slice(0, 40) || ' ';
    inner = (<><rect width={w} height={h} fill="#000" fillOpacity=".78" />
      <text x={w / 2} y={h / 2} fill="#fff" fontFamily="ui-monospace,Menlo,monospace" fontWeight="700" fontSize={Math.min(h * 0.55, (w * 0.94) / (text.length * 0.62))} textAnchor="middle" dominantBaseline="central">{text}</text></>);
  } else if (a.type === 'audio') {
    const n = num(p.channels, 2, 1, 16), horiz = p.orientation === 'horizontal', along = horiz ? w : h, across = horiz ? h : w, bw = across / n;
    inner = (<><rect width={w} height={h} fill="#000" fillOpacity=".55" />
      {Array.from({ length: n }, (_, i) => {
        const lvl = LEVELS[i % 16] * along, segs: [number, number, string][] = [[0, 0.7, '#1fb865'], [0.7, 0.9, '#f2c230'], [0.9, 1, '#e5352b']];
        return (<g key={i}>{segs.map(([a0, a1, c], k) => { const s = a0 * along, e = Math.min(a1 * along, lvl); if (e <= s) return null;
          const len = e - s, off = i * bw + bw * 0.15, thick = bw * 0.7;
          return horiz ? <rect key={k} x={s} y={off} width={len} height={thick} fill={c} /> : <rect key={k} x={off} y={along - e} width={thick} height={len} fill={c} />; })}</g>);
      })}</>);
  } else if (a.type === 'tally') {
    const col = p.state === 'green' ? '#1fb865' : p.state === 'off' ? '#4a515c' : '#e5352b';
    inner = p.style === 'border' ? <rect x={6} y={6} width={w - 12} height={h - 12} fill="none" stroke={col} strokeWidth={Math.max(6, Math.min(w, h) * 0.04)} />
      : <rect x={w * 0.1} y={h * 0.1} width={w * 0.8} height={h * 0.8} rx={Math.min(w, h) * 0.2} fill={col} />;
  } else if (a.type === 'clock') {
    const text = p.format === 'HH:MM:SS:FF' ? '10:24:36:12' : '10:24:36';
    inner = (<><rect width={w} height={h} fill="#000" fillOpacity=".6" />
      <text x={w / 2} y={h / 2} fill="#fff" fontFamily="ui-monospace,Menlo,monospace" fontWeight="600" fontSize={Math.min(h * 0.65, (w * 0.92) / (text.length * 0.62))} textAnchor="middle" dominantBaseline="central">{text}</text></>);
  } else inner = <rect width={w} height={h} fill="#444" />;
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: 'block' }}>{inner}</svg>;
}

// A whole MV Tile: the 16:9 frame with its assets on top. Used for previews now, and in MV Layouts later.
export function TileArt({ assets, width = 240 }: { assets: DAsset[]; width?: number | string }) {
  return (<svg viewBox={`0 0 ${TILE_W} ${TILE_H}`} width={width} style={{ background: '#12161c', border: '1px solid #444', display: 'block', maxWidth: '100%' }}>
    <rect width={TILE_W} height={TILE_H} fill="#1a2029" />
    <path d={`M0 0L${TILE_W} ${TILE_H}M${TILE_W} 0L0 ${TILE_H}`} stroke="#252d38" strokeWidth="4" />
    {assets.map(a => (<svg key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`}><AssetArt a={a} /></svg>))}</svg>);
}
