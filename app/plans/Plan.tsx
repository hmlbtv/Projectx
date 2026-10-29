'use client';
import { useEffect, useRef, useState } from 'react';
import { WallArt } from '../walls/WallArt';

type Tile = { n: number; x: number; y: number; w: number; h: number };
type Layout = { id: number; name: string; tiles: Tile[] };
type Asset = { id: string; type: string; name?: string; x: number; y: number; w: number; h: number; props?: any };
type Wall = { id: number; name: string; assets?: Asset[]; dests?: Record<string, string[]> };
type Data = Record<string, { layoutId?: number; assign: Record<string, string>; mons?: Record<string, number> }>;


const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(t);
// One MV layout drawn inside a monitor: clear numbered windows, each carrying the name of the destination it takes.
function LayoutPic({ lay, names, big, pos }: { lay: Layout; names?: string[]; big?: boolean; pos?: { x: number; y: number; w: number; h: number } }) {
  return (<svg viewBox="0 0 1920 1080" {...(pos ? { x: pos.x, y: pos.y, width: pos.w, height: pos.h, preserveAspectRatio: 'xMidYMid meet' } : { width: '100%' })} style={pos ? undefined : { display: 'block', background: '#0b0f14', borderRadius: big ? 8 : 0 }}>
    <rect width="1920" height="1080" fill="#0b0f14" />
    {lay.tiles.map(t => { const nm = names?.[t.n - 1], bs = Math.max(34, Math.min(120, t.h / 3.2)), bw = bs * (t.n > 9 ? 1.6 : 1.25);
      return (<g key={t.n}><rect x={t.x + 5} y={t.y + 5} width={t.w - 10} height={t.h - 10} fill="#1d3557" stroke="#cbd5e1" strokeWidth="6" />
        <rect x={t.x + 5} y={t.y + 5} width={bw} height={bs} fill="#e5352b" /><text x={t.x + 5 + bw / 2} y={t.y + 5 + bs / 2} fill="#fff" fontSize={bs * 0.72} fontWeight="800" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui,sans-serif">{t.n}</text>
        {nm && <text x={t.x + t.w / 2} y={t.y + t.h / 2 + bs * 0.3} fill="#fff" fontSize={Math.max(30, Math.min(96, (t.w - 40) / Math.max(5, nm.length * 0.6)))} fontWeight="700" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui,sans-serif">{nm}</text>}</g>); })}</svg>);
}
// The wall as saved in its Wall Template, locked. "Layout" lets you tap a monitor and choose which of its MV layouts it shows; "View" shows the wall full screen (turned to landscape on a phone).
function WallPlan({ wl, layouts, cur, setMon, readOnly }: { wl: Wall; layouts: Layout[]; cur: Data[string] | undefined; setMon: (assetId: string, layoutId: number) => void; readOnly: boolean }) {
  const [editing, setEditing] = useState(false), [pick, setPick] = useState<string | null>(null), [full, setFull] = useState(false), [turned, setTurned] = useState(false), [vp, setVp] = useState({ w: 0, h: 0 });
  const ref = useRef<HTMLDialogElement>(null), box = useRef<HTMLDivElement>(null), fsUsed = useRef(false);
  const list = wl.assets ?? [], M = full ? 10 : 24; // full screen: crop tight so the wall is as big as it can be
  const x0 = Math.min(...list.map(a => a.x)), y0 = Math.min(...list.map(a => a.y)), x1 = Math.max(...list.map(a => a.x + a.w)), y1 = Math.max(...list.map(a => a.y + a.h));
  const w = full ? x1 - x0 + 2 * M : Math.max(x1 - x0 + 2 * M, 360), h = full ? y1 - y0 + 2 * M : Math.max(y1 - y0 + 2 * M, 200), vx = (x0 + x1) / 2 - w / 2, vy = (y0 + y1) / 2 - h / 2;
  const mvsOf = (a: Asset) => (Array.isArray(a.props?.mvs) ? a.props.mvs : []).map((id: number) => layouts.find(l => l.id === id)).filter(Boolean) as Layout[];
  const chosen = (a: Asset) => { const opts = mvsOf(a); return opts.find(l => l.id === cur?.mons?.[a.id]) ?? opts[0]; };
  const inline = full; // in full screen the chooser sits inside the (possibly turned) view; otherwise it is a normal dialog
  useEffect(() => { const d = ref.current; if (!d || inline) return; if (pick && !d.open) d.showModal(); if (!pick && d.open) d.close(); }, [pick, inline]);
  // Full screen: the browser's own full screen where it exists (phones are asked for landscape); otherwise a full-window view, turned sideways by hand on a portrait phone.
  const portrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth && window.innerWidth < 900;
  function enter() { setFull(true); }
  // Once the full view is on screen, ask the browser for real full screen (and landscape on a phone).
  useEffect(() => { if (!full) return; let live = true; (async () => { const el = box.current;
    try { if (el?.requestFullscreen) { await el.requestFullscreen(); fsUsed.current = true; try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not allowed here */ } } } catch { /* use the full-window view */ }
    setTimeout(() => { if (live) setTurned(portrait()); }, 300); })(); return () => { live = false; }; }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  function leave() { fsUsed.current = false; setEditing(false); setFull(false); setTurned(false); setPick(null); try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ } if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  useEffect(() => {
    if (!full) return;
    const onFs = () => { if (!document.fullscreenElement && fsUsed.current) leave(); }, onSize = () => { setTurned(portrait()); const v = window.visualViewport; setVp({ w: Math.round(v?.width ?? window.innerWidth), h: Math.round(v?.height ?? window.innerHeight) }); }, onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pick) leave(); };
    document.addEventListener('fullscreenchange', onFs); window.addEventListener('resize', onSize); window.visualViewport?.addEventListener('resize', onSize); window.addEventListener('keydown', onKey); onSize();
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('resize', onSize); window.visualViewport?.removeEventListener('resize', onSize); window.removeEventListener('keydown', onKey); };
  }, [full, pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const pa = list.find(a => a.id === pick);
  const chooser = pa && (<div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
      <div><div className="mut" style={{ fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Choose MV layout</div><h3 style={{ margin: 0, fontSize: '1.25rem' }}>{pa.name ?? 'Monitor'}</h3></div>
      <button type="button" className="sec" onClick={() => setPick(null)} aria-label="Close">✕ Close</button></div>
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10, alignContent: 'start', justifyContent: 'center', padding: '14px 2px 4px' }}>
      {mvsOf(pa).map(l => { const on = chosen(pa)?.id === l.id; return (<button key={l.id} type="button" onClick={() => { setMon(pa.id, l.id); setPick(null); }} aria-pressed={on}
        style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', display: 'grid', gap: 8, width: '100%', maxWidth: 300, justifySelf: 'center', padding: 6, borderRadius: 12, border: on ? '3px solid #e5352b' : '2px solid var(--line)', background: 'var(--bg)', position: 'relative' }}>
        <LayoutPic lay={l} names={wl.dests?.[pa.id]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}><b style={{ fontSize: '.85rem' }}>{l.name}</b><span className="mut" style={{ whiteSpace: 'nowrap' }}>{l.tiles.length} window{l.tiles.length === 1 ? '' : 's'}</span></div>
        {on && <span style={{ position: 'absolute', top: 16, right: 16, background: '#e5352b', color: '#fff', borderRadius: 999, padding: '2px 10px', fontSize: '.8rem', fontWeight: 700 }}>✓ In use</span>}</button>); })}</div></div>);
  const wall = (<svg viewBox={`${vx} ${vy} ${w} ${h}`} width="100%" height={full ? '100%' : undefined} style={{ display: 'block', background: '#1b2027', borderRadius: full ? 0 : 8, maxHeight: full ? undefined : '70vh', flex: full ? 1 : undefined, minHeight: 0 }} preserveAspectRatio="xMidYMid meet">
    {list.map(a => { const lay = isScreen(a.type) ? chosen(a) : undefined, can = editing && !!lay && mvsOf(a).length > 1;
      return (<g key={a.id}><svg x={a.x} y={a.y} width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`}><WallArt a={{ ...a, name: a.name ?? '' }} /></svg>
        {lay && <LayoutPic lay={lay} names={wl.dests?.[a.id]} pos={{ x: a.x + 4, y: a.y + 4, w: a.w - 8, h: a.h - 8 }} />}
        {isScreen(a.type) && !lay && <rect x={a.x + 4} y={a.y + 4} width={a.w - 8} height={a.h - 8} fill="#f8fafc" stroke="#94a3b8" strokeWidth="4" pointerEvents="none" />}
        {can && <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="rgba(229,53,43,.10)" stroke="#e5352b" strokeWidth="5" style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-label={`Choose MV layout for ${a.name ?? 'monitor'}`} onClick={() => setPick(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(a.id); } }} />}</g>); })}</svg>);
  const sm = full ? { padding: '2px 12px', minHeight: 0, height: 28, fontSize: '.8rem', lineHeight: 1 } : undefined;
  const bar = (<div className="row" style={{ justifyContent: 'space-between', gap: 8, ...(full ? { margin: 0, flex: '0 0 auto', minHeight: 0 } : {}) }}><b style={full ? { fontSize: '.85rem' } : undefined}>{wl.name}</b>{full && editing && <span className="mut" style={{ fontSize: '.75rem' }}>Tap a monitor to choose its layout</span>}
    <span style={{ display: 'flex', gap: 8 }}>{!readOnly && <button type="button" style={sm} className={editing ? '' : 'sec'} aria-pressed={editing} onClick={() => { if (editing) setEditing(false); else { setEditing(true); if (!full) enter(); } }}>{editing ? 'Done' : 'Layout'}</button>}
      {full ? <button type="button" style={sm} className="sec" onClick={leave}>Exit</button> : <button type="button" className="sec" onClick={enter} title="Show this wall full screen">View</button>}</span></div>);
  const body = (<>{bar}{editing && !full && <p className="mut" style={{ margin: '4px 0' }}>Tap a monitor to choose its MV layout.</p>}{wall}</>);
  return (<div className="card" style={full ? { padding: 0, border: 0 } : undefined}>
    {full ? (<div ref={box} style={turned ? { position: 'fixed', top: 0, left: vp.w || '100vw', width: vp.h || '100vh', height: vp.w || '100vw', transform: 'rotate(90deg)', transformOrigin: 'top left', background: 'var(--panel)', zIndex: 1000, display: 'flex', flexDirection: 'column', padding: '4px 8px', gap: 4, boxSizing: 'border-box', overflow: 'hidden' }
          : { position: 'fixed', top: 0, left: 0, width: '100%', height: vp.h || '100%', background: 'var(--panel)', zIndex: 1000, display: 'flex', flexDirection: 'column', padding: '4px 8px', gap: 4, boxSizing: 'border-box', overflow: 'hidden' }}>
      {body}{pick && pa && <div role="dialog" aria-modal="true" style={{ position: 'absolute', inset: 8, background: 'var(--panel)', borderRadius: 14, padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,.4)', border: '1px solid var(--line)', zIndex: 2 }}>{chooser}</div>}</div>)
      : (<div ref={box}>{body}</div>)}
    {!full && <dialog ref={ref} className="dlg" onClose={() => setPick(null)} onClick={e => { if (e.target === ref.current) setPick(null); }} style={{ width: 'min(1100px, 96vw)', maxWidth: '96vw', height: '90vh', maxHeight: '90vh', display: pick ? 'block' : 'none', padding: 18 }}>{chooser}</dialog>}</div>);
}

export default function Plan({ walls, layouts, sources, saved, save, readOnly = false, start }: { start?: string; walls: Wall[]; layouts: Layout[]; sources: string[]; saved: { name: string; data: Data }[]; save?: (name: string, data: Data) => Promise<void>; readOnly?: boolean }) {
  const [name, setName] = useState((saved.find(x => x.name === start) ?? saved[0])?.name ?? 'Room Layout 1');
  const [data, setData] = useState<Data>((saved.find(x => x.name === start) ?? saved[0])?.data ?? {});
  const [msg, setMsg] = useState('');
  // No Save button: every change is saved automatically a moment after it is made.
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (readOnly || !save) return; setMsg('Saving…');
    const t = setTimeout(async () => { try { await save(name, data); setMsg('Saved'); } catch { setMsg('Not saved, try again'); } }, 700); return () => clearTimeout(t); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = (id: number) => data[id] ?? { layoutId: undefined, assign: {} };
  // Sources are stored per tile NUMBER, so they stay in the same numbered tile when the layout changes.
  const setLayout = (id: number, layoutId: number) => setData({ ...data, [id]: { ...w(id), layoutId } });
  const setMon = (id: number, assetId: string, layoutId: number) => setData({ ...data, [id]: { ...w(id), mons: { ...(w(id).mons ?? {}), [assetId]: layoutId } } });
  const setSrc = (id: number, n: number, v: string) => setData({ ...data, [id]: { ...w(id), assign: { ...w(id).assign, [n]: v } } });
  return (<div>
    {!readOnly && msg && <div className="mut" style={{ textAlign: 'right', fontSize: '.8rem' }}>{msg}</div>}
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
