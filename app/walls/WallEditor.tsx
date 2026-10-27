'use client';
import { useEffect, useRef, useState } from 'react';
import Editor from '../designer/Editor';
import { WallArt } from './WallArt';
import { WALL_PALETTE, WALL_W, WALL_H } from './wallAssets';
import type { DAsset } from '../designer/assets';
import { saveWall } from '@/lib/actions';
import ImagePicker from './ImagePicker';
import type { PaletteItem } from '../designer/assets';

export type MvOpt = { id: number; name: string; standard: boolean; n: number; tiles: { x: number; y: number; w: number; h: number }[] };
const LayThumb = ({ tiles, small }: { tiles: MvOpt['tiles']; small?: boolean }) => (<svg viewBox="0 0 1920 1080" width={small ? 48 : 64} height={small ? 27 : 36} style={{ display: 'block', background: '#0b1118', borderRadius: 3, border: '1px solid #3a414c' }} aria-hidden>{tiles.map((t, i) => <rect key={i} x={t.x + 6} y={t.y + 6} width={Math.max(1, t.w - 12)} height={Math.max(1, t.h - 12)} fill="#2b6cb0" />)}</svg>);
const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(t);

// Pick which Multiview templates a monitor can show (chosen from this list later, in the Monitor Plan).
type Filt = { q: string; sort: string; max: number | null };
function MvPick({ a, mvs, setProps, filt, setFilt, copied, setCopied }: { copied: number[] | null; setCopied: (c: number[] | null) => void; a: DAsset; mvs: MvOpt[]; setProps: (p: Record<string, any>) => void; filt: Filt; setFilt: (f: Filt) => void }) {
  const ref = useRef<HTMLDialogElement>(null); const have: number[] = a.props?.mvs ?? [];
  const top = Math.max(1, ...mvs.map(m => m.n)); const [pick, setPick] = useState<number[]>(have); // search, sort and Max PiP are remembered for as long as the wall is open in the editor
  const q = filt.q, sort = filt.sort, max = filt.max ?? a.props?.maxPip ?? top;
  const setQ = (v: string) => setFilt({ ...filt, q: v }), setSort = (v: string) => setFilt({ ...filt, sort: v }), setMax = (v: number) => setFilt({ ...filt, max: v });
  const assigned = have.map(id => mvs.find(m => m.id === id)).filter(Boolean) as MvOpt[];
  const cmp: Record<string, (a: MvOpt, b: MvOpt) => number> = { name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }), namez: (a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }), fewest: (a, b) => a.n - b.n || a.name.localeCompare(b.name, undefined, { numeric: true }), most: (a, b) => b.n - a.n || a.name.localeCompare(b.name, undefined, { numeric: true }), standard: (a, b) => +b.standard - +a.standard || a.name.localeCompare(b.name, undefined, { numeric: true }), mine: (a, b) => +a.standard - +b.standard || a.name.localeCompare(b.name, undefined, { numeric: true }), ticked: (a, b) => +pick.includes(b.id) - +pick.includes(a.id) || a.name.localeCompare(b.name, undefined, { numeric: true }) };
  const shown = mvs.filter(m => m.n <= (max || 1) && m.name.toLowerCase().includes(q.toLowerCase())).sort(cmp[sort] ?? cmp.name);
  return (<>
    <div className="dz-grp">Multiview templates</div>
    <label className="dz-row dz-chk" style={{ flexDirection: 'row', alignItems: 'center' }}><span>Limit Max PiP</span><input type="checkbox" checked={!!a.props?.maxPip} onChange={e => setProps(e.target.checked ? { maxPip: 1 } : { maxPip: undefined })} /></label>
    {!!a.props?.maxPip && <label className="dz-row" style={{ flexDirection: 'row', alignItems: 'center' }}><span>Max PiP (windows)</span><input type="number" min={1} max={64} defaultValue={a.props.maxPip} key={a.id} aria-label="Max PiP value" onChange={e => { const v = Math.round(+e.target.value); if (!(v >= 1)) return; const c = Math.min(64, v); const keep = have.filter(id => (mvs.find(m => m.id === id)?.n ?? 99) <= c); setProps({ maxPip: c, mvs: keep.length ? keep : undefined }); }} onBlur={e => { e.target.value = String(a.props?.maxPip ?? 1); }} /></label>}
    {a.props?.maxPip ? <p className="mut dz-help" style={{ margin: '0 0 6px' }}>Max PiP: {a.props.maxPip} windows</p> : null}
    {assigned.length === 0 ? <p className="mut dz-help" style={{ margin: '0 0 6px' }}>None assigned.</p> :
      <div role="list" aria-label="Assigned multiview templates" style={{ display: 'grid', gap: 4, margin: '0 0 8px', maxHeight: 220, overflow: 'auto' }}>
        <div className="mut" style={{ fontSize: '.75rem' }}>{assigned.length} assigned</div>
        {assigned.map(m => <div key={m.id} role="listitem" style={{ display: 'grid', gridTemplateColumns: '48px 1fr', gap: 8, alignItems: 'center', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)' }}>
          <LayThumb tiles={m.tiles} small /><span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, fontSize: '.85rem', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{m.name}</span><span className="mut" style={{ fontSize: '.72rem' }}>{m.n} window{m.n === 1 ? '' : 's'}{m.standard ? ' · Standard' : ''}</span></span></div>)}</div>}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
      <button type="button" className="sec small" disabled={!assigned.length} onClick={() => setCopied(assigned.map(m => m.id))}>Copy templates</button>
      {copied && <button type="button" className="sec small" disabled={copied.join() === assigned.map(m => m.id).join()} title="Give this monitor the copied templates" onClick={() => { const keep = copied.filter(id => { const m = mvs.find(x => x.id === id); return m && (!a.props?.maxPip || m.n <= a.props.maxPip); }); setProps({ mvs: keep.length ? keep : undefined }); }}>Paste {copied.length} template{copied.length === 1 ? '' : 's'}</button>}
    </div>
    {copied && <p className="mut dz-help" style={{ margin: '0 0 6px' }}>Copied {copied.length} template{copied.length === 1 ? '' : 's'}. Select another monitor and press Paste{a.props?.maxPip ? ' (only templates within this monitor’s Max PiP are added)' : ''}.</p>}
    <button type="button" className="sec small" onClick={() => { setPick(have.filter(id => mvs.some(m => m.id === id))); ref.current?.showModal(); }}>Assign multiview template</button>
    <dialog ref={ref} className="dlg" style={{ width: 'min(480px,calc(100vw - 24px))' }}>
      <b style={{ display: 'block', lineHeight: 1.3 }}>Assign multiview templates to {a.name}</b>
      <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '10px 0 0', fontSize: '.9rem' }}><span>Max PiP<span className="mut" style={{ display: 'block', fontSize: '.75rem', fontWeight: 400 }}>Only templates with this many windows or fewer are shown</span></span>
        <input type="number" min={1} max={64} value={max || ''} onChange={e => setMax(Math.min(64, Math.max(0, Math.round(+e.target.value) || 0)))} onBlur={() => { if (!max) setMax(1); }} style={{ width: 80, margin: 0 }} aria-label="Max PiP" /></label>
      <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}><input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }} />
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort" style={{ flex: 'none' }}><option value="name">Name A–Z</option><option value="namez">Name Z–A</option><option value="fewest">Fewest windows</option><option value="most">Most windows</option><option value="standard">Standard first</option><option value="mine">My own first</option><option value="ticked">Ticked first</option></select></div>
      <div style={{ maxHeight: 'min(340px,50vh)', overflow: 'auto', display: 'grid', gap: 2 }}>
        {shown.length === 0 && <span className="mut">No multiview templates found.</span>}
        {shown.map(m => <label key={m.id} style={{ display: 'grid', gridTemplateColumns: 'auto 64px 1fr', gap: 10, alignItems: 'center', flexDirection: 'unset', padding: '5px 4px', borderBottom: '1px solid var(--line)', fontSize: '.9rem' }}>
          <input type="checkbox" style={{ margin: 0 }} checked={pick.includes(m.id)} onChange={e => setPick(e.target.checked ? [...pick, m.id] : pick.filter(x => x !== m.id))} /><LayThumb tiles={m.tiles} />
          <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.25 }}>{m.name}</span><span className="mut" style={{ fontSize: '.78rem' }}>{m.n} window{m.n === 1 ? '' : 's'}{m.standard ? ' · Standard' : ''}</span></span></label>)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
        <button type="button" className="sec" onClick={() => setPick([])}>Untick all</button>
        <span style={{ display: 'flex', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="button" onClick={() => { const keep = pick.filter(id => (mvs.find(m => m.id === id)?.n ?? 99) <= (max || 1)); setProps({ mvs: keep.length ? keep : undefined, maxPip: (max >= top && !a.props?.maxPip) ? undefined : (max || 1) }); ref.current?.close(); }}>Apply</button></span></div>
    </dialog></>);
}

// The Wall Designer: drag monitors, Sony BVM/PVM monitors, speakers and timecode clocks onto a 6.4 m x 3.6 m wall. Same tools as the other designers.
export default function WallEditor({ id, initialName, initial, notice, mvs }: { id: number | null; initialName: string; initial: DAsset[]; notice?: React.ReactNode; mvs: MvOpt[] }) {
  // Saved walls open in view mode (cropped to the monitors, multiview templates can be assigned). Edit mode gives the full canvas and the Arrange/Add tools, but no multiview assignment.
  const [edit, setEdit] = useState(id === null || initial.length === 0);
  // Search, sort and Max PiP for the multiview dialog are kept for this browser tab (so they survive saving, switching walls and reloads).
  const [filt, setFiltState] = useState<Filt>({ q: '', sort: 'name', max: null });
  useEffect(() => { try { const s = sessionStorage.getItem('wallMvFilter'); if (s) { const j = JSON.parse(s); setFiltState({ q: String(j.q ?? ''), sort: String(j.sort ?? 'name'), max: typeof j.max === 'number' ? j.max : null }); } } catch { /* storage unavailable */ } }, []);
  const setFilt = (f: Filt) => { setFiltState(f); try { sessionStorage.setItem('wallMvFilter', JSON.stringify(f)); } catch { /* ignore */ } };
  const [copied, setCopied] = useState<number[] | null>(null); // templates copied from one monitor, to paste onto others
  const [picker, setPicker] = useState<null | ((over: Partial<PaletteItem>) => void)>(null);
  return (<><Editor onAction={(_, add) => setPicker(() => add)}  viewOnly={!edit} zoomable headerExtra={<button type="button" className={'small' + (edit ? '' : ' sec')} aria-pressed={edit} title={edit ? 'Finish editing: shrink the canvas and go back to assigning multiview templates' : 'Edit the wall: add, move and arrange monitors and other items'} onClick={() => setEdit(!edit)}>{edit ? 'Done editing' : 'Edit'}</button>}  kind="Wall Template" canvasName="wall" backHref="/walls" world={{ w: WALL_W, h: WALL_H }} palette={WALL_PALETTE} rotatable notice={notice} renderAsset={a => <WallArt a={a} />}
    extras={(a, setProps) => !edit && isScreen(a.type) ? <MvPick key={a.id} a={a} mvs={mvs} setProps={setProps} filt={filt} setFilt={setFilt} copied={copied} setCopied={setCopied} /> : null}
    id={id} initialName={initialName} initial={initial}
    backdrop={<svg viewBox={`0 0 ${WALL_W} ${WALL_H}`} width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}><rect width={WALL_W} height={WALL_H} fill="#1b2027" /><rect x={0} y={WALL_H - 6} width={WALL_W} height={6} fill="#2c333d" /></svg>}
    onSave={a => saveWall(a.asNew ? null : a.id, a.name, a.assets)} />
    {picker && <ImagePicker onClose={() => setPicker(null)} onPick={i => { const s = Math.min(400 / i.w, 300 / i.h); picker({ label: i.name, w: Math.max(20, Math.round(i.w * s)), h: Math.max(20, Math.round(i.h * s)), props: { img: i.id, ...(i.alpha ? { hasAlpha: true, useAlpha: true } : {}) } }); }} />}</>);
}
