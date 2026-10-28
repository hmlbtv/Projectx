'use client';
import { useEffect, useRef, useState } from 'react';
import { WallArt } from '../walls/WallArt';

type Tile = { n: number; x: number; y: number; w: number; h: number };
type Layout = { id: number; name: string; tiles: Tile[] };
type Asset = { id: string; type: string; name?: string; x: number; y: number; w: number; h: number; props?: any };
type Wall = { id: number; name: string; assets?: Asset[]; dests?: Record<string, string[]> };
type Data = Record<string, { layoutId?: number; assign: Record<string, string>; mons?: Record<string, number> }>;


const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(t);
// One MV layout drawn inside a monitor: numbered windows, each carrying the name of the destination it takes.
function LayoutPic({ lay, names, big, pos }: { lay: Layout; names?: string[]; big?: boolean; pos?: { x: number; y: number; w: number; h: number } }) {
  return (<svg viewBox="0 0 1920 1080" {...(pos ? { x: pos.x, y: pos.y, width: pos.w, height: pos.h, preserveAspectRatio: 'xMidYMid meet' } : { width: '100%' })} style={pos ? undefined : { display: 'block', background: '#05070a', borderRadius: big ? 6 : 0 }}>{pos && <rect width="1920" height="1080" fill="#05070a" />}
    {lay.tiles.map(t => { const nm = names?.[t.n - 1]; return (<g key={t.n}><rect x={t.x + 4} y={t.y + 4} width={t.w - 8} height={t.h - 8} fill="#161b22" stroke="#4b5563" strokeWidth="4" />
      <text x={t.x + 22} y={t.y + 22} fill="#e5352b" fontSize={Math.min(90, t.h / 3)} dominantBaseline="hanging" fontWeight="700">{t.n}</text>
      {nm && <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 10} fill="#fff" fontSize={Math.max(28, Math.min(80, t.w / Math.max(6, nm.length * 0.62)))} textAnchor="middle" dominantBaseline="middle">{nm}</text>}</g>); })}</svg>);
}
// The wall as saved in its Wall Template, locked. "Layout" lets you tap a monitor and choose which of its MV layouts it shows.
function WallPlan({ wl, layouts, cur, setMon, readOnly }: { wl: Wall; layouts: Layout[]; cur: Data[string] | undefined; setMon: (assetId: string, layoutId: number) => void; readOnly: boolean }) {
  const [editing, setEditing] = useState(false), [pick, setPick] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const list = wl.assets ?? [], M = 24;
  const x0 = Math.min(...list.map(a => a.x)), y0 = Math.min(...list.map(a => a.y)), x1 = Math.max(...list.map(a => a.x + a.w)), y1 = Math.max(...list.map(a => a.y + a.h));
  const w = Math.max(x1 - x0 + 2 * M, 360), h = Math.max(y1 - y0 + 2 * M, 200), vx = (x0 + x1) / 2 - w / 2, vy = (y0 + y1) / 2 - h / 2;
  const mvsOf = (a: Asset) => (Array.isArray(a.props?.mvs) ? a.props.mvs : []).map((id: number) => layouts.find(l => l.id === id)).filter(Boolean) as Layout[];
  const chosen = (a: Asset) => { const opts = mvsOf(a); return opts.find(l => l.id === cur?.mons?.[a.id]) ?? opts[0]; };
  useEffect(() => { const d = ref.current; if (!d) return; if (pick && !d.open) d.showModal(); if (!pick && d.open) d.close(); }, [pick]);
  const pa = list.find(a => a.id === pick);
  return (<div className="card"><div className="row" style={{ justifyContent: 'space-between' }}><b>{wl.name}</b>
      {!readOnly && <button type="button" className={editing ? '' : 'sec'} aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Layout'}</button>}</div>
    {editing && <p className="mut" style={{ margin: '4px 0' }}>Tap a monitor to choose its MV layout.</p>}
    <svg viewBox={`${vx} ${vy} ${w} ${h}`} width="100%" style={{ display: 'block', background: '#1b2027', borderRadius: 8, maxHeight: '70vh' }} preserveAspectRatio="xMidYMid meet">
      {list.map(a => { const lay = isScreen(a.type) ? chosen(a) : undefined, can = editing && !!lay && mvsOf(a).length > 0;
        return (<g key={a.id}><svg x={a.x} y={a.y} width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`}><WallArt a={{ ...a, name: a.name ?? '' }} /></svg>
          {lay && <LayoutPic lay={lay} names={wl.dests?.[a.id]} pos={{ x: a.x + 4, y: a.y + 4, w: a.w - 8, h: a.h - 8 }} />}
          {can && <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="rgba(229,53,43,.08)" stroke="#e5352b" strokeWidth="5" style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-label={`Choose MV layout for ${a.name ?? 'monitor'}`} onClick={() => setPick(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(a.id); } }} />}</g>); })}</svg>
    <dialog ref={ref} className="dlg" onClose={() => setPick(null)} style={{ width: 'min(1100px, 96vw)', maxWidth: '96vw', height: '90vh', maxHeight: '90vh', display: pick ? 'flex' : 'none', flexDirection: 'column' }}>
      {pa && <><div className="row" style={{ justifyContent: 'space-between', margin: '0 0 8px' }}><h3 style={{ margin: 0 }}>MV layout for {pa.name ?? 'monitor'}</h3><button type="button" className="sec" onClick={() => setPick(null)}>Close</button></div>
        <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, alignContent: 'start' }}>
          {mvsOf(pa).map(l => { const on = chosen(pa)?.id === l.id; return (<button key={l.id} type="button" className="sec" onClick={() => { setMon(pa.id, l.id); setPick(null); }} style={{ display: 'grid', gap: 6, textAlign: 'left', padding: 10, borderWidth: on ? 3 : 1, borderStyle: 'solid', borderColor: on ? '#e5352b' : 'var(--line)', borderRadius: 10 }}>
            <LayoutPic lay={l} names={wl.dests?.[pa.id]} big /><b>{l.name}{on ? ' ✓' : ''}</b><span className="mut">{l.tiles.length} window{l.tiles.length === 1 ? '' : 's'}</span></button>); })}</div></>}</dialog></div>);
}

export default function Plan({ walls, layouts, sources, saved, save, readOnly = false, start }: { start?: string; walls: Wall[]; layouts: Layout[]; sources: string[]; saved: { name: string; data: Data }[]; save?: (name: string, data: Data) => Promise<void>; readOnly?: boolean }) {
  const [name, setName] = useState((saved.find(x => x.name === start) ?? saved[0])?.name ?? 'Room Layout 1');
  const [data, setData] = useState<Data>((saved.find(x => x.name === start) ?? saved[0])?.data ?? {});
  const [msg, setMsg] = useState('');
  const w = (id: number) => data[id] ?? { layoutId: undefined, assign: {} };
  // Sources are stored per tile NUMBER, so they stay in the same numbered tile when the layout changes.
  const setLayout = (id: number, layoutId: number) => setData({ ...data, [id]: { ...w(id), layoutId } });
  const setMon = (id: number, assetId: string, layoutId: number) => setData({ ...data, [id]: { ...w(id), mons: { ...(w(id).mons ?? {}), [assetId]: layoutId } } });
  const setSrc = (id: number, n: number, v: string) => setData({ ...data, [id]: { ...w(id), assign: { ...w(id).assign, [n]: v } } });
  return (<div>
    {!readOnly && <div className="row"><b>Room Layout</b>
      <select value={name} onChange={e => { const s = saved.find(x => x.name === e.target.value); setName(e.target.value); if (s) setData(s.data); }}>
        {[...new Set([name, ...saved.map(s => s.name)])].map(n => <option key={n}>{n}</option>)}</select>
      <input value={name} onChange={e => setName(e.target.value)} /><button onClick={async () => { await save!(name, data); setMsg('Saved'); }}>Save</button><span className="mut">{msg}</span></div>}
    {walls.map(wl => { if ((wl.assets ?? []).some(a => isScreen(a.type) && a.props?.mvs?.length)) return <WallPlan key={wl.id} wl={wl} layouts={layouts} cur={data[wl.id]} readOnly={readOnly} setMon={(a, l) => setMon(wl.id, a, l)} />;
      const cur = w(wl.id); const lay = layouts.find(l => l.id === cur.layoutId);
      return (<div key={wl.id} className="card"><b>{wl.name}</b>
        <div className="row"><select disabled={readOnly} value={cur.layoutId ?? ''} onChange={e => setLayout(wl.id, Number(e.target.value))}><option value="">Choose MV Layout…</option>{layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        {lay && <svg viewBox="0 0 1920 1080" style={{ width: '100%', maxWidth: 640, background: '#000' }}>
          {lay.tiles.map(t => (<g key={t.n}><rect x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} fill="#1a1f27" stroke="#5a6472" strokeWidth="4" />
            <text x={t.x + 30} y={t.y + 70} fill="#e5352b" fontSize="64">{t.n}</text>
            <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 20} fill="#fff" fontSize={Math.min(70, t.w / 9)} textAnchor="middle">{cur.assign[t.n] ?? ''}</text></g>))}</svg>}
        {lay && <table><tbody>{lay.tiles.map(t => (<tr key={t.n}><td>Tile {t.n}</td><td><select disabled={readOnly} value={cur.assign[t.n] ?? ''} onChange={e => setSrc(wl.id, t.n, e.target.value)}><option value="">—</option>{sources.map(s => <option key={s}>{s}</option>)}</select></td></tr>))}</tbody></table>}
      </div>); })}</div>);
}
