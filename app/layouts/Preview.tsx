import { TileInner } from '../designer/TileArt';
export function LayoutPreview({ tiles, width = 160, tileMap }: { tiles: any[]; width?: number; tileMap?: Record<number, any[]> }) {
  return (<svg viewBox="0 0 1600 900" width={width} style={{ background: '#000', border: '1px solid #444' }}>
    {tiles.map(t => (<g key={t.n}><rect x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} fill="#1a1f27" stroke="#5a6472" strokeWidth="4" />
      {t.tileId && tileMap?.[t.tileId] ? <svg x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} viewBox="0 0 1600 900"><TileInner assets={tileMap[t.tileId]} /></svg> : null}
      <text x={t.x + (t.tileId && tileMap?.[t.tileId] ? 24 : t.w / 2)} y={t.y + (t.tileId && tileMap?.[t.tileId] ? 24 : t.h / 2)} fill="#fff" stroke={t.tileId && tileMap?.[t.tileId] ? '#000' : 'none'} strokeWidth="6" paintOrder="stroke" fontSize={t.tileId && tileMap?.[t.tileId] ? 80 : 120} textAnchor={t.tileId && tileMap?.[t.tileId] ? 'start' : 'middle'} dominantBaseline={t.tileId && tileMap?.[t.tileId] ? 'hanging' : 'middle'}>{t.n}</text></g>))}</svg>);
}

