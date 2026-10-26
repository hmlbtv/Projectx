'use client';
import { useState } from 'react';
import Editor from '../designer/Editor';
import type { DAsset, PaletteItem } from '../designer/assets';
import { saveLayoutTiles } from '@/lib/actions';
import { TileInner } from '../designer/TileArt';
import { neatenWithPreset } from '@/lib/neaten';
import tidy from '../../data/tidy-layouts.json';

type T = { n: number; x: number; y: number; w: number; h: number; tileId?: number };
export type TileRef = { id: number; name: string; assets: DAsset[]; mine: boolean };
const PALETTE: PaletteItem[] = [{ type: 'mv', label: 'Monitor', w: 480, h: 270 }];

// Edits an MV Layout on the shared designer. Each monitor keeps its number (Monitor Plans refer to it); new ones take the next free number when saved.
export default function LayoutEditor({ id: id0, name, tiles, tileList, readOnly, notice, canNeaten, standard, backQuery }: { backQuery?: string; standard?: boolean | null; canNeaten?: boolean; id: number; name: string; tiles: T[]; tileList: TileRef[]; readOnly?: boolean; notice?: React.ReactNode }) {
  const [id, setId] = useState(id0); // becomes the tenant's own copy after the first save of a Standard layout
  const initial: DAsset[] = tiles.map(t => ({ id: 't' + t.n, type: 'mv', name: 'Monitor ' + t.n, x: t.x, y: t.y, w: t.w, h: t.h, ...(t.tileId ? { props: { tileId: t.tileId } } : {}) }));
  const [nums, setNums] = useState<Record<string, number>>(() => Object.fromEntries(tiles.map(t => ['t' + t.n, t.n])));
  const byId: Record<number, TileRef> = Object.fromEntries(tileList.map(x => [x.id, x]));
  const fs = (w: number, h: number) => Math.max(40, Math.min(h * 0.5, w * 0.5));
  return (<Editor backQuery={backQuery} flags={standard === null || standard === undefined ? [] : [{ key: 'standard', label: 'Standard (all tenants)', initial: standard }]} neaten={canNeaten ? (items => { const r = neatenWithPreset(items, (tidy as Record<string, any[]>)[name]); return r ? items.map((a, i) => ({ ...a, ...r[i] })) : null; }) : undefined} kind="MV Layout" canvasName="frame" fitSpace backHref="/layouts" world={{ w: 1920, h: 1080 }} palette={PALETTE} readOnly={readOnly} notice={notice} stampKey="tileId" stamps={tileList.map(x => ({ id: x.id, name: x.name, group: x.mine ? 'mine' : 'standard', node: <svg viewBox="0 0 1600 900" style={{ background: '#12161c' }}><TileInner assets={x.assets} /></svg> }))}
    renderAsset={a => { const tl = a.props?.tileId ? byId[a.props.tileId] : undefined; return (<svg viewBox={`0 0 ${a.w} ${a.h}`} width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
      <rect x={4} y={4} width={a.w - 8} height={a.h - 8} fill="#1a1f27" stroke="#5a6472" strokeWidth={4} />
      {tl && <svg x={4} y={4} width={a.w - 8} height={a.h - 8} viewBox="0 0 1920 1080"><TileInner assets={tl.assets} /></svg>}
      <text x={tl ? 14 + fs(a.w, a.h) * 0.2 : a.w / 2} y={tl ? 14 + fs(a.w, a.h) * 0.2 : a.h / 2} fill="#fff" stroke={tl ? '#000' : 'none'} strokeWidth={tl ? fs(a.w, a.h) * 0.06 : 0} paintOrder="stroke" fontSize={tl ? fs(a.w, a.h) * 0.26 : fs(a.w, a.h)} textAnchor={tl ? 'start' : 'middle'} dominantBaseline={tl ? 'hanging' : 'central'}>{nums[a.id] ?? '+'}</text></svg>); }}
    id={id} initialName={name} initial={initial}
    backdrop={<svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}><rect width={1920} height={1080} fill="#000" /></svg>}
    onSave={async a => {
      const used = new Set<number>(), map: Record<string, number> = {};
      for (const x of a.assets) { const m = /^t(\d+)$/.exec(x.id); if (m && !used.has(+m[1])) { map[x.id] = +m[1]; used.add(+m[1]); } }
      let next = 1; for (const x of a.assets) if (!map[x.id]) { while (used.has(next)) next++; map[x.id] = next; used.add(next); }
      const r = await saveLayoutTiles({ id, name: a.name, asNew: a.asNew, flags: a.flags, tiles: a.assets.map(x => ({ n: map[x.id], x: x.x, y: x.y, w: x.w, h: x.h, tileId: x.props?.tileId })) });
      if (!r.error) { setNums(map); if (r.id) setId(r.id); } return r;
    }} />);
}
