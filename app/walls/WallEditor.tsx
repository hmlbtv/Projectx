'use client';
import { useRef, useState } from 'react';
import Editor from '../designer/Editor';
import { WallArt } from './WallArt';
import { WALL_PALETTE, WALL_W, WALL_H } from './wallAssets';
import type { DAsset } from '../designer/assets';
import { saveWall } from '@/lib/actions';

export type MvOpt = { id: number; name: string; standard: boolean; n: number; tiles: { x: number; y: number; w: number; h: number }[] };
const LayThumb = ({ tiles }: { tiles: MvOpt['tiles'] }) => (<svg viewBox="0 0 1920 1080" width={64} height={36} style={{ display: 'block', background: '#0b1118', borderRadius: 3, border: '1px solid #3a414c' }} aria-hidden>{tiles.map((t, i) => <rect key={i} x={t.x + 6} y={t.y + 6} width={Math.max(1, t.w - 12)} height={Math.max(1, t.h - 12)} fill="#2b6cb0" />)}</svg>);
const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(t);

// Pick which Multiview templates a monitor can show (chosen from this list later, in the Monitor Plan).
function MvPick({ a, mvs, setProps }: { a: DAsset; mvs: MvOpt[]; setProps: (p: Record<string, any>) => void }) {
  const ref = useRef<HTMLDialogElement>(null); const have: number[] = a.props?.mvs ?? [];
  const top = Math.max(1, ...mvs.map(m => m.n)); const [pick, setPick] = useState<number[]>(have); const [q, setQ] = useState(''); const [max, setMax] = useState<number>(a.props?.maxPip ?? top);
  const names = have.map(id => mvs.find(m => m.id === id)?.name).filter(Boolean) as string[];
  const shown = mvs.filter(m => m.n <= (max || 1) && m.name.toLowerCase().includes(q.toLowerCase()));
  return (<>
    <div className="dz-grp">Multiview templates</div>
    <label className="dz-row dz-chk" style={{ flexDirection: 'row', alignItems: 'center' }}><span>Limit Max PiP</span><input type="checkbox" checked={!!a.props?.maxPip} onChange={e => setProps(e.target.checked ? { maxPip: 1 } : { maxPip: undefined })} /></label>
    {!!a.props?.maxPip && <label className="dz-row" style={{ flexDirection: 'row', alignItems: 'center' }}><span>Max PiP (windows)</span><input type="number" min={1} max={64} defaultValue={a.props.maxPip} key={a.id} aria-label="Max PiP value" onChange={e => { const v = Math.round(+e.target.value); if (!(v >= 1)) return; const c = Math.min(64, v); const keep = have.filter(id => (mvs.find(m => m.id === id)?.n ?? 99) <= c); setProps({ maxPip: c, mvs: keep.length ? keep : undefined }); }} onBlur={e => { e.target.value = String(a.props?.maxPip ?? 1); }} /></label>}
    <p className="mut dz-help" style={{ margin: '0 0 6px' }}>{a.props?.maxPip ? `Max PiP ${a.props.maxPip}. ` : ''}{names.length === 0 ? 'None assigned.' : `${names.length} assigned: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`}</p>
    <button type="button" className="sec small" onClick={() => { setPick(have.filter(id => mvs.some(m => m.id === id))); setQ(''); setMax(a.props?.maxPip ?? top); ref.current?.showModal(); }}>Assign multiview template</button>
    <dialog ref={ref} className="dlg" style={{ width: 'min(480px,calc(100vw - 24px))' }}>
      <b style={{ display: 'block', lineHeight: 1.3 }}>Assign multiview templates to {a.name}</b>
      <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '10px 0 0', fontSize: '.9rem' }}><span>Max PiP<span className="mut" style={{ display: 'block', fontSize: '.75rem', fontWeight: 400 }}>Only templates with this many windows or fewer are shown</span></span>
        <input type="number" min={1} max={64} value={max || ''} onChange={e => setMax(Math.min(64, Math.max(0, Math.round(+e.target.value) || 0)))} onBlur={() => { if (!max) setMax(1); }} style={{ width: 80, margin: 0 }} aria-label="Max PiP" /></label>
      <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', margin: '10px 0', boxSizing: 'border-box' }} />
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
  return (<Editor kind="Wall Template" canvasName="wall" backHref="/walls" world={{ w: WALL_W, h: WALL_H }} palette={WALL_PALETTE} rotatable notice={notice} renderAsset={a => <WallArt a={a} />}
    extras={(a, setProps) => isScreen(a.type) ? <MvPick key={a.id} a={a} mvs={mvs} setProps={setProps} /> : null}
    id={id} initialName={initialName} initial={initial}
    backdrop={<svg viewBox={`0 0 ${WALL_W} ${WALL_H}`} width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}><rect width={WALL_W} height={WALL_H} fill="#1b2027" /><rect x={0} y={WALL_H - 6} width={WALL_W} height={6} fill="#2c333d" /></svg>}
    onSave={a => saveWall(a.id, a.name, a.assets)} />);
}
