'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WallPlan } from '../../plans/Plan';
import { saveWallDefault, deleteWallDefault, setActiveWallDefault } from '@/lib/actions';

type Def = { id: string; name: string; mons: Record<string, number>; active?: boolean };
export default function Defaults({ wall, layouts, initial, limit }: { wall: any; layouts: any[]; initial: Def[]; limit: number }) {
  const router = useRouter();
  const [list, setList] = useState<Def[]>(initial), [edit, setEdit] = useState<string | null>(null), [msg, setMsg] = useState('');
  const cur = list.find(x => x.id === edit);
  const monitors = (wall.assets ?? []).filter((a: any) => /^(mon|monitor|bvm|pvm)/.test(a.type) && a.props?.mvs?.length).length;
  async function add() {
    setMsg(''); const r = await saveWallDefault(wall.id, null, `Default ${list.length + 1}`, {});
    if (r.error || !r.id) { setMsg(r.error ?? 'Could not add'); return; }
    setList([...list, { id: r.id, name: `Default ${list.length + 1}`, mons: {}, active: list.length === 0 }]); setEdit(r.id);
  }
  async function setMon(assetId: string, layoutId: number) {
    if (!cur) return; const mons = { ...cur.mons, [assetId]: layoutId };
    setList(list.map(x => x.id === cur.id ? { ...x, mons } : x)); const r = await saveWallDefault(wall.id, cur.id, cur.name, mons); if (r.error) setMsg(r.error);
  }
  async function rename(d: Def, name: string) { setList(list.map(x => x.id === d.id ? { ...x, name } : x)); }
  async function saveName(d: Def) { await saveWallDefault(wall.id, d.id, d.name, d.mons); }
  async function use(d: Def) { setList(list.map(x => ({ ...x, active: x.id === d.id }))); await setActiveWallDefault(wall.id, d.id); }
  async function del(d: Def) { if (!confirm(`Delete “${d.name}”?`)) return; await deleteWallDefault(wall.id, d.id); const rest = list.filter(x => x.id !== d.id); if (rest.length && !rest.some(x => x.active)) rest[0].active = true; setList(rest); router.refresh(); }
  if (monitors === 0) return <div className="card mut">This Wall Template has no monitors with MV layouts to choose from yet. Add multiview templates to its monitors in the Wall Designer first.</div>;
  return (<div>
    {edit && cur && <WallPlan key={cur.id} wl={wall} layouts={layouts} cur={{ assign: {}, mons: cur.mons }} setMon={setMon} readOnly={false} autoFull onExit={() => { setEdit(null); router.refresh(); }} />}
    {list.length === 0 && <div className="card mut">No default configurations yet.</div>}
    {list.map(d => (<div key={d.id} className="card" style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input value={d.name} onChange={e => rename(d, e.target.value)} onBlur={() => saveName(d)} aria-label="Name" style={{ maxWidth: 260 }} />
        {d.active ? <span className="tag">Used for new plans</span> : <button className="sec small" onClick={() => use(d)}>Use for new plans</button>}
        <button className="small" onClick={() => setEdit(d.id)}>Choose MV layouts (full screen)</button>
        <button className="del small" onClick={() => del(d)}>Delete</button></div>
      <span className="mut">{Object.keys(d.mons).length} of {monitors} monitor{monitors === 1 ? '' : 's'} set</span></div>))}
    {list.length < limit ? <button className="sec" onClick={add}>+ New default configuration</button> : <p className="mut">You have all {limit} default configurations. Delete one to add another, or ask the site admin to raise the number.</p>}
    {msg && <p role="alert" style={{ color: '#b45309' }}>{msg}</p>}</div>);
}
