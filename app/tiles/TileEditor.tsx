'use client';
import Editor, { type Flag } from '../designer/Editor';
import { AssetArt } from '../designer/TileArt';
import { TILE_ASSETS, TILE_W, TILE_H, type DAsset } from '../designer/assets';
import { saveTile } from '@/lib/actions';

export default function TileEditor({ id, name, assets, readOnly, flags, notice }: { id: number | null; name: string; assets: DAsset[]; readOnly: boolean; flags: Flag[]; notice?: React.ReactNode }) {
  return (<Editor kind="MV Tile" backHref="/tiles" world={{ w: TILE_W, h: TILE_H }} palette={TILE_ASSETS} allowOverlap renderAsset={a => <AssetArt a={a} />}
    id={id} initialName={name} initial={assets} readOnly={readOnly} flags={flags} notice={notice}
    backdrop={<svg viewBox={`0 0 ${TILE_W} ${TILE_H}`} width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}><rect width={TILE_W} height={TILE_H} fill="#1a2029" /><path d={`M0 0L${TILE_W} ${TILE_H}M${TILE_W} 0L0 ${TILE_H}`} stroke="#252d38" strokeWidth="4" /></svg>}
    onSave={a => saveTile({ id: a.id, name: a.name, assets: a.assets, asNew: a.asNew, flags: a.flags })} />);
}
