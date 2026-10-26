'use client';
import { useState } from 'react';
import { WallArt } from '../walls/WallArt';
import ImagePicker from '../walls/ImagePicker';
import Editor from '../designer/Editor';
import type { DAsset, PaletteItem } from '../designer/assets';
import { saveLayoutTiles } from '@/lib/actions';
import { TileInner } from '../designer/TileArt';
import { neatenWithPreset } from '@/lib/neaten';
import tidy from '../../data/tidy-layouts.json';

type T = { n: number; x: number; y: number; w: number; h: number; tileId?: number };
export type TileRef = { id: number; name: string; assets: DAsset[]; mine: boolean };
const PALETTE: PaletteItem[] = [{ group: 'Monitors', type: 'mv', label: 'Monitor', w: 480, h: 270 },
  { group: 'Text, images & background', type: 'txt', label: 'Text box', w: 600, h: 120, props: { text: 'Text', size: 60, bold: false, italic: false, underline: false, align: 'left', color: '#ffffff', font: 'Sans' }, fields: [
    { key: 'text', label: 'Text', kind: 'area' }, { key: 'size', label: 'Font size', kind: 'number', min: 6, max: 600 }, { key: 'font', label: 'Font', kind: 'select', options: ['Sans', 'Serif', 'Mono'] },
    { key: 'bold', label: 'Bold', kind: 'check' }, { key: 'italic', label: 'Italic', kind: 'check' }, { key: 'underline', label: 'Underline', kind: 'check' },
    { key: 'align', label: 'Align', kind: 'select', options: ['left', 'center', 'right'] }, { key: 'color', label: 'Colour', kind: 'color' }] },
  { group: 'Text, images & background', type: 'tc', label: 'Clock', w: 400, h: 110 },
  { group: 'Text, images & background', type: 'tcl', label: 'Clock (large)', w: 640, h: 170 },
  { group: 'Text, images & background', type: 'img', label: 'Image', w: 480, h: 270, action: 'image', props: {}, fields: [{ key: 'useAlpha', label: 'Use alpha (transparency)', kind: 'check', when: 'hasAlpha', dflt: true }] },
  { group: 'Text, images & background', type: 'bg', label: 'Background', w: 0, h: 0, action: 'bg' }];
const LOOSE = ['txt', 'img', 'tc', 'tcl']; // text and pictures can sit over (or under) the monitors

// Edits an MV Layout on the shared designer. Each monitor keeps its number (Monitor Plans refer to it); new ones take the next free number when saved.
export default function LayoutEditor({ id: id0, name, tiles, tileList, readOnly, notice, canNeaten, standard, backQuery, extras }: { extras?: { bg?: number; bgHasAlpha?: boolean; bgUseAlpha?: boolean; items?: DAsset[] }; backQuery?: string; standard?: boolean | null; canNeaten?: boolean; id: number; name: string; tiles: T[]; tileList: TileRef[]; readOnly?: boolean; notice?: React.ReactNode }) {
  const [id, setId] = useState(id0); // becomes the tenant's own copy after the first save of a Standard layout
  const initial: DAsset[] = [...tiles.map(t => ({ id: 't' + t.n, type: 'mv', name: 'Monitor ' + t.n, x: t.x, y: t.y, w: t.w, h: t.h, ...(t.tileId ? { props: { tileId: t.tileId } } : {}) })), ...(extras?.items ?? [])];
  const [bg, setBg] = useState<number | null>(extras?.bg ?? null); const [bgHasAlpha, setBgHasAlpha] = useState(!!extras?.bgHasAlpha), [bgUseAlpha, setBgUseAlpha] = useState(extras?.bgUseAlpha !== false);
  const [picker, setPicker] = useState<null | { mode: 'bg' } | { mode: 'img'; add: (o: Partial<PaletteItem>) => void }>(null);
  const [nums, setNums] = useState<Record<string, number>>(() => Object.fromEntries(tiles.map(t => ['t' + t.n, t.n])));
  const byId: Record<number, TileRef> = Object.fromEntries(tileList.map(x => [x.id, x]));
  const fs = (w: number, h: number) => Math.max(40, Math.min(h * 0.5, w * 0.5));
  return (<><Editor looseTypes={LOOSE} onAction={(pi, add) => setPicker(pi.action === 'bg' ? { mode: 'bg' } : { mode: 'img', add })} backQuery={backQuery} flags={standard === null || standard === undefined ? [] : [{ key: 'standard', label: 'Standard (all tenants)', initial: standard }]} neaten={canNeaten ? (items => { const wins = items.filter(a => a.type === 'mv'); const r = neatenWithPreset(wins, (tidy as Record<string, any[]>)[name]); if (!r) return null; let k = 0; return items.map(a => a.type === 'mv' ? { ...a, ...r[k++] } : a); }) : undefined} kind="MV Layout" canvasName="frame" fitSpace backHref="/layouts" world={{ w: 1920, h: 1080 }} palette={PALETTE} readOnly={readOnly} stampKey="tileId" stamps={tileList.map(x => ({ id: x.id, name: x.name, group: x.mine ? 'mine' : 'standard', node: <svg viewBox="0 0 1600 900" style={{ background: '#12161c' }}><TileInner assets={x.assets} /></svg> }))}
    renderAsset={a => { if (a.type !== 'mv') return <WallArt a={a} />; const tl = a.props?.tileId ? byId[a.props.tileId] : undefined; return (<svg viewBox={`0 0 ${a.w} ${a.h}`} width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
      <rect x={4} y={4} width={a.w - 8} height={a.h - 8} fill="#1a1f27" stroke="#5a6472" strokeWidth={4} />
      {tl && <svg x={4} y={4} width={a.w - 8} height={a.h - 8} viewBox="0 0 1920 1080"><TileInner assets={tl.assets} /></svg>}
      <text x={tl ? 14 + fs(a.w, a.h) * 0.2 : a.w / 2} y={tl ? 14 + fs(a.w, a.h) * 0.2 : a.h / 2} fill="#fff" stroke={tl ? '#000' : 'none'} strokeWidth={tl ? fs(a.w, a.h) * 0.06 : 0} paintOrder="stroke" fontSize={tl ? fs(a.w, a.h) * 0.26 : fs(a.w, a.h)} textAnchor={tl ? 'start' : 'middle'} dominantBaseline={tl ? 'hanging' : 'central'}>{nums[a.id] ?? '+'}</text></svg>); }}
    id={id} initialName={name} initial={initial}
    backdrop={<svg viewBox="0 0 1920 1080" width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}><rect width={1920} height={1080} fill="#000" />{bg ? <><defs><filter id="flatalpha" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1" /></feComponentTransfer></filter></defs><image href={`/api/wall-images/${bg}`} width={1920} height={1080} preserveAspectRatio="xMidYMid slice" filter={bgHasAlpha && !bgUseAlpha ? 'url(#flatalpha)' : undefined} /></> : null}</svg>}
    notice={<>{notice}{bg ? <div className="card" style={{ margin: '0 0 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>Background picture</b><span className="mut">sits behind everything</span><button type="button" className="sec small" onClick={() => setPicker({ mode: 'bg' })}>Change</button><button type="button" className="del small" onClick={() => { setBg(null); setBgHasAlpha(false); setBgUseAlpha(true); }}>Remove</button>{bgHasAlpha && <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, fontWeight: 500 }}><input type="checkbox" style={{ margin: 0 }} checked={bgUseAlpha} onChange={e => setBgUseAlpha(e.target.checked)} />Use alpha (transparency)</label>}<span className="mut">(applied when you Save)</span></div> : null}</>}
    onSave={async a => {
      const used = new Set<number>(), map: Record<string, number> = {};
      for (const x of a.assets.filter(y => y.type === 'mv')) { const m = /^t(\d+)$/.exec(x.id); if (m && !used.has(+m[1])) { map[x.id] = +m[1]; used.add(+m[1]); } }
      let next = 1; for (const x of a.assets.filter(y => y.type === 'mv')) if (!map[x.id]) { while (used.has(next)) next++; map[x.id] = next; used.add(next); }
      const wins = a.assets.filter(x => x.type === 'mv'), decor = a.assets.filter(x => x.type !== 'mv');
      const r = await saveLayoutTiles({ id, name: a.name, asNew: a.asNew, flags: a.flags, extras: { bg, bgHasAlpha: bg ? bgHasAlpha : undefined, bgUseAlpha: bg ? bgUseAlpha : undefined, items: decor }, tiles: wins.map(x => ({ n: map[x.id], x: x.x, y: x.y, w: x.w, h: x.h, tileId: x.props?.tileId })) });
      if (!r.error) { setNums(map); if (r.id) setId(r.id); } return r;
    }} />
    {picker && <ImagePicker onClose={() => setPicker(null)} onPick={i => { if (picker.mode === 'bg') { setBg(i.id); setBgHasAlpha(!!i.alpha); setBgUseAlpha(true); } else { const s = Math.min(640 / i.w, 360 / i.h); picker.add({ label: i.name, w: Math.max(20, Math.round(i.w * s)), h: Math.max(20, Math.round(i.h * s)), props: { img: i.id, ...(i.alpha ? { hasAlpha: true, useAlpha: true } : {}) } }); } }} />}</>);
}
