import { TileInner } from '../designer/TileArt';
import { WallArt } from '../walls/WallArt';
export function LayoutPreview({ tiles, width = 160, tileMap, extras }: { tiles: any[]; width?: number; tileMap?: Record<number, any[]>; extras?: any }) {
  return (<svg viewBox="0 0 1920 1080" width={width} style={{ background: '#000', border: '1px solid #444' }}>
    {extras?.bg ? <><defs><filter id="flatalpha" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1" /></feComponentTransfer></filter></defs><image href={`/api/wall-images/${extras.bg}`} width={1920} height={1080} preserveAspectRatio="xMidYMid slice" filter={extras.bgHasAlpha && extras.bgUseAlpha === false ? 'url(#flatalpha)' : undefined} /></> : null}
    {tiles.map(t => (<g key={t.n}><rect x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} fill="#1a1f27" stroke="#5a6472" strokeWidth="4" />
      {t.tileId && tileMap?.[t.tileId] ? <svg x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} viewBox="0 0 1920 1080"><TileInner assets={tileMap[t.tileId]} /></svg> : null}
      <text x={t.x + (t.tileId && tileMap?.[t.tileId] ? 29 : t.w / 2)} y={t.y + (t.tileId && tileMap?.[t.tileId] ? 29 : t.h / 2)} fill="#fff" stroke={t.tileId && tileMap?.[t.tileId] ? '#000' : 'none'} strokeWidth="6" paintOrder="stroke" fontSize={t.tileId && tileMap?.[t.tileId] ? 96 : 144} textAnchor={t.tileId && tileMap?.[t.tileId] ? 'start' : 'middle'} dominantBaseline={t.tileId && tileMap?.[t.tileId] ? 'hanging' : 'middle'}>{t.n}</text></g>))}{(extras?.items ?? []).map((a: any) => <svg key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`}><WallArt a={a} /></svg>)}</svg>);
}

