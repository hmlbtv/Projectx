import { WallArt } from './WallArt';
import { WALL_W, WALL_H } from './wallAssets';

// Small picture of a Wall Template, cropped to its monitors so it fills the box.
export default function WallThumb({ assets, h }: { assets: any[]; h?: number }) {
  const list = Array.isArray(assets) ? assets : [];
  const M = 24, x0 = list.length ? Math.min(...list.map(a => a.x)) : 0, y0 = list.length ? Math.min(...list.map(a => a.y)) : 0, x1 = list.length ? Math.max(...list.map(a => a.x + a.w)) : WALL_W, y1 = list.length ? Math.max(...list.map(a => a.y + a.h)) : WALL_H;
  const w = Math.max(x1 - x0 + 2 * M, 360), hh = Math.max(y1 - y0 + 2 * M, 200), cx = (x0 + x1) / 2 - w / 2, cy = (y0 + y1) / 2 - hh / 2;
  return (<svg viewBox={`${cx} ${cy} ${w} ${hh}`} width="100%" style={{ display: 'block', borderRadius: 6, background: '#1b2027', height: h ?? 'auto', maxHeight: h }} preserveAspectRatio="xMidYMid meet" aria-hidden>
    {list.map((a: any) => <svg key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`}><WallArt a={a} /></svg>)}</svg>);
}
