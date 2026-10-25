'use client';
import { useState } from 'react';
import Editor from '../designer/Editor';
import type { DAsset, PaletteItem } from '../designer/assets';
import { saveLayoutTiles } from '@/lib/actions';

type T = { n: number; x: number; y: number; w: number; h: number };
const PALETTE: PaletteItem[] = [{ type: 'mv', label: 'Monitor', w: 400, h: 225 }];

// Edits an MV Layout on the shared designer. Each monitor keeps its number (Monitor Plans refer to it); new ones take the next free number when saved.
export default function LayoutEditor({ id, name, tiles }: { id: number; name: string; tiles: T[] }) {
  const initial: DAsset[] = tiles.map(t => ({ id: 't' + t.n, type: 'mv', name: 'Monitor ' + t.n, x: t.x, y: t.y, w: t.w, h: t.h }));
  const [nums, setNums] = useState<Record<string, number>>(() => Object.fromEntries(tiles.map(t => ['t' + t.n, t.n])));
  const fs = (w: number, h: number) => Math.max(40, Math.min(h * 0.5, w * 0.5));
  return (<Editor kind="MV Layout" canvasName="frame" backHref="/layouts" world={{ w: 1600, h: 900 }} palette={PALETTE}
    renderAsset={a => (<svg viewBox={`0 0 ${a.w} ${a.h}`} width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
      <rect x={4} y={4} width={a.w - 8} height={a.h - 8} fill="#1a1f27" stroke="#5a6472" strokeWidth={4} />
      <text x={a.w / 2} y={a.h / 2} fill="#fff" fontSize={fs(a.w, a.h)} textAnchor="middle" dominantBaseline="central">{nums[a.id] ?? '+'}</text></svg>)}
    id={id} initialName={name} initial={initial}
    backdrop={<svg viewBox="0 0 1600 900" width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}><rect width={1600} height={900} fill="#000" /></svg>}
    onSave={async a => {
      const used = new Set<number>(), map: Record<string, number> = {};
      for (const x of a.assets) { const m = /^t(\d+)$/.exec(x.id); if (m && !used.has(+m[1])) { map[x.id] = +m[1]; used.add(+m[1]); } }
      let next = 1; for (const x of a.assets) if (!map[x.id]) { while (used.has(next)) next++; map[x.id] = next; used.add(next); }
      const r = await saveLayoutTiles({ id, name: a.name, asNew: a.asNew, tiles: a.assets.map(x => ({ n: map[x.id], x: x.x, y: x.y, w: x.w, h: x.h })) });
      if (!r.error) setNums(map); return r;
    }} />);
}
