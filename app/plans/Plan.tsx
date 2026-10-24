'use client';
import { useState } from 'react';
import { savePlan } from '@/lib/actions';

type Tile = { n: number; x: number; y: number; w: number; h: number };
type Layout = { id: number; name: string; tiles: Tile[] };
type Wall = { id: number; name: string };
type Data = Record<string, { layoutId?: number; assign: Record<string, string> }>;

export default function Plan({ jobId, walls, layouts, sources, saved }: { jobId: number; walls: Wall[]; layouts: Layout[]; sources: string[]; saved: { name: string; data: Data }[] }) {
  const [name, setName] = useState(saved[0]?.name ?? 'Room Layout 1');
  const [data, setData] = useState<Data>(saved[0]?.data ?? {});
  const [msg, setMsg] = useState('');
  const w = (id: number) => data[id] ?? { layoutId: undefined, assign: {} };
  // Sources are stored per tile NUMBER, so they stay in the same numbered tile when the layout changes.
  const setLayout = (id: number, layoutId: number) => setData({ ...data, [id]: { ...w(id), layoutId } });
  const setSrc = (id: number, n: number, v: string) => setData({ ...data, [id]: { ...w(id), assign: { ...w(id).assign, [n]: v } } });
  return (<div>
    <div className="row"><b>Room Layout</b>
      <select value={name} onChange={e => { const s = saved.find(x => x.name === e.target.value); setName(e.target.value); if (s) setData(s.data); }}>
        {[...new Set([name, ...saved.map(s => s.name)])].map(n => <option key={n}>{n}</option>)}</select>
      <input value={name} onChange={e => setName(e.target.value)} /><button onClick={async () => { await savePlan(jobId, name, data); setMsg('Saved'); }}>Save</button><span className="mut">{msg}</span></div>
    {walls.map(wl => { const cur = w(wl.id); const lay = layouts.find(l => l.id === cur.layoutId);
      return (<div key={wl.id} className="card"><b>{wl.name}</b>
        <div className="row"><select value={cur.layoutId ?? ''} onChange={e => setLayout(wl.id, Number(e.target.value))}><option value="">Choose MV Layout…</option>{layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        {lay && <svg viewBox="0 0 1600 900" style={{ width: '100%', maxWidth: 640, background: '#000' }}>
          {lay.tiles.map(t => (<g key={t.n}><rect x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} fill="#1a1f27" stroke="#5a6472" strokeWidth="4" />
            <text x={t.x + 30} y={t.y + 70} fill="#e5352b" fontSize="64">{t.n}</text>
            <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 20} fill="#fff" fontSize={Math.min(70, t.w / 9)} textAnchor="middle">{cur.assign[t.n] ?? ''}</text></g>))}</svg>}
        {lay && <table><tbody>{lay.tiles.map(t => (<tr key={t.n}><td>Tile {t.n}</td><td><select value={cur.assign[t.n] ?? ''} onChange={e => setSrc(wl.id, t.n, e.target.value)}><option value="">—</option>{sources.map(s => <option key={s}>{s}</option>)}</select></td></tr>))}</tbody></table>}
      </div>); })}</div>);
}
