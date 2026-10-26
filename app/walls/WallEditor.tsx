'use client';
import Editor from '../designer/Editor';
import { WallArt } from './WallArt';
import { WALL_PALETTE, WALL_W, WALL_H } from './wallAssets';
import type { DAsset } from '../designer/assets';
import { saveWall } from '@/lib/actions';

// The Wall Designer: drag monitors, Sony BVM/PVM monitors, speakers and timecode clocks onto a 6.4 m x 3.6 m wall. Same tools as the other designers.
export default function WallEditor({ id, initialName, initial, siteId }: { id: number | null; initialName: string; initial: DAsset[]; siteId?: number | null }) {
  return (<Editor kind="Wall Template" canvasName="wall" backHref="/walls" world={{ w: WALL_W, h: WALL_H }} palette={WALL_PALETTE} rotatable renderAsset={a => <WallArt a={a} />}
    id={id} initialName={initialName} initial={initial}
    backdrop={<svg viewBox={`0 0 ${WALL_W} ${WALL_H}`} width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}><rect width={WALL_W} height={WALL_H} fill="#1b2027" /><rect x={0} y={WALL_H - 6} width={WALL_W} height={6} fill="#2c333d" /></svg>}
    onSave={a => saveWall(a.id, a.name, a.assets, siteId)} />);
}
