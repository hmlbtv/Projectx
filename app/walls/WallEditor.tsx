'use client';
import { useRef, useState } from 'react';
import Editor from '../designer/Editor';
import { WallArt } from './WallArt';
import { WALL_PALETTE, WALL_W, WALL_H } from './wallAssets';
import type { DAsset } from '../designer/assets';
import { saveWall } from '@/lib/actions';

export type MvOpt = { id: number; name: string; standard: boolean; n: number; tiles: { x: number; y: number; w: number; h: number }[] };
const LayThumb = ({ tiles }: { tiles: MvOpt['tiles'] }) => (<svg viewBox="0 0 1920 1080" width={64} height={36} style={{ flex: 'none', background: '#0b1118', borderRadius: 3, border: '1px solid #3a414c' }} aria-hidden>{tiles.map((t, i) => <rect key={i} x={t.x + 6} y={t.y + 6} width={Math.max(1, t.w - 12)} height={Math.max(1, t.h - 12)} fill="#2b6cb0" />)}</svg>);
const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(t);

// Pick which Multiview templates a monitor can show (chosen from this list later, in the Monitor Plan).
function MvPick({ a, mvs, setProps }: { a: DAsset; mvs: MvOpt[]; setProps: (p: Record<string, any>) => void }) {
  const ref = useRef<HTMLDialogElement>(null); const have: number[] = a.props?.mvs ?? [];
  const [pick, setPick] = useState<number[]>(have); const [q, setQ] = useState('');
  const names = have.map(id => mvs.find(m => m.id === id)?.name).filter(Boolean) as string[];
  const shown = mvs.filter(m => m.name.toLowerCase().includes(q.toLowerCase()));
  return (<>
    <div className="dz-grp">Multiview templates</div>
    <p className="mut dz-help" style={{ margin: '0 0 6px' }}>{names.length === 0 ? 'None assigned.' : `${names.length} assigned: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`}</p>
    <button type="button" className="sec small" onClick={() => { setPick(have.filter(id => mvs.some(m => m.id === id))); setQ(''); ref.current?.showModal(); }}>Assign multiview template</button>
    <dialog ref={ref} style={{ width: 'min(480px,92vw)', borderRadius: 10, padding: 16 }}>
      <b>Assign multiview templates to {a.name}</b>
      <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', margin: '8px 0' }} />
      <div style={{ maxHeight: 300, overflow: 'auto', display: 'grid', gap: 4 }}>
        {shown.length === 0 && <span className="mut">No multiview templates found.</span>}
        {shown.map(m => <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={pick.includes(m.id)} onChange={e => setPick(e.target.checked ? [...pick, m.id] : pick.filter(x => x !== m.id))} /><LayThumb tiles={m.tiles} />{m.name}<span className="mut">{m.n} windows{m.standard ? ' · Standard' : ''}</span></label>)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
        <button type="button" className="sec" onClick={() => setPick([])}>Untick all</button>
        <span style={{ display: 'flex', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="button" onClick={() => { setProps({ mvs: pick.length ? pick : undefined }); ref.current?.close(); }}>Apply</button></span></div>
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
