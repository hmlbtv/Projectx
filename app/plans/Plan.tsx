'use client';
import { useEffect, useRef, useState } from 'react';
import { WallArt } from '../walls/WallArt';

type Tile = { n: number; x: number; y: number; w: number; h: number };
type Layout = { id: number; name: string; tiles: Tile[] };
type Asset = { id: string; type: string; name?: string; x: number; y: number; w: number; h: number; props?: any };
type Wall = { id: number; name: string; assets?: Asset[]; dests?: Record<string, string[]>; defaultMons?: Record<string, number> };
type Data = Record<string, { layoutId?: number; assign: Record<string, string>; mons?: Record<string, number>; srcs?: Record<string, Record<string, string>> }>; // srcs: source per MV layout tile, for each monitor


const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(t);
// One MV layout drawn inside a monitor: clear numbered windows, each carrying the name of the destination it takes.
function LayoutPic({ lay, names, picks, big, pos }: { lay: Layout; names?: string[]; picks?: Record<string, string>; big?: boolean; pos?: { x: number; y: number; w: number; h: number } }) {
  return (<svg viewBox="0 0 1920 1080" {...(pos ? { x: pos.x, y: pos.y, width: pos.w, height: pos.h, preserveAspectRatio: 'xMidYMid meet' } : { width: '100%' })} style={pos ? undefined : { display: 'block', background: '#0b0f14', borderRadius: big ? 8 : 0 }}>
    <rect width="1920" height="1080" fill="#0b0f14" />
    {lay.tiles.map(t => { const nm = names?.[t.n - 1], bs = Math.max(34, Math.min(120, t.h / 3.2)), bw = bs * (t.n > 9 ? 1.6 : 1.25);
      return (<g key={t.n}><rect x={t.x + 5} y={t.y + 5} width={t.w - 10} height={t.h - 10} fill="#1d3557" stroke="#cbd5e1" strokeWidth="6" />
        <rect x={t.x + 5} y={t.y + 5} width={bw} height={bs} fill="#e5352b" /><text x={t.x + 5 + bw / 2} y={t.y + 5 + bs / 2} fill="#fff" fontSize={bs * 0.72} fontWeight="800" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui,sans-serif">{t.n}</text>
        {picks?.[t.n] && <text x={t.x + t.w / 2} y={t.y + t.h / 2 + bs * 0.35} fill="#7dffb0" fontSize={Math.max(34, Math.min(120, (t.w - 40) / Math.max(5, picks[t.n].length * 0.6)))} fontWeight="800" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui,sans-serif">{picks[t.n]}</text>}
        {nm && <text x={t.x + t.w / 2} y={picks?.[t.n] ? t.y + bs * 1.5 : t.y + t.h / 2 + bs * 0.3} opacity={picks?.[t.n] ? 0.7 : 1} fill="#fff" fontSize={Math.max(30, Math.min(96, (t.w - 40) / Math.max(5, nm.length * 0.6)))} fontWeight="700" textAnchor="middle" dominantBaseline="central" fontFamily="system-ui,sans-serif">{nm}</text>}</g>); })}</svg>);
}
// The wall as saved in its Wall Template, locked. "Layout" lets you tap a monitor and choose which of its MV layouts it shows; "View" shows the wall full screen (turned to landscape on a phone).
// Phones can stay zoomed out / stuck at the old width after full screen ends or the phone is turned. Nudging the viewport makes the browser lay the page out again at the true width.
function resetViewport() {
  try { const m = document.querySelector('meta[name=viewport]') as HTMLMetaElement | null; if (!m) return; const orig = m.content;
    m.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1'; window.dispatchEvent(new Event('resize'));
    setTimeout(() => { m.content = orig; window.dispatchEvent(new Event('resize')); }, 350); } catch { /* ignore */ }
}
// After leaving full screen, keep re-fitting for a few seconds so turning the phone straight away still re-scales the page.
function refitAfterFullScreen() {
  resetViewport(); setTimeout(resetViewport, 700);
  const on = () => setTimeout(resetViewport, 250); window.addEventListener('orientationchange', on); screen.orientation?.addEventListener?.('change', on);
  setTimeout(() => { window.removeEventListener('orientationchange', on); screen.orientation?.removeEventListener?.('change', on); }, 10000);
}
export function WallPlan({ onEditing, wl, layouts, cur, setMon, readOnly, autoFull, onExit, setAll, sources = [], srcs, setSrc }: { sources?: string[]; srcs?: Record<string, Record<string, string>>; setSrc?: (assetId: string, n: number, v: string) => void; setAll?: (mons: Record<string, number>, srcs: Record<string, Record<string, string>>) => void; wl: Wall; layouts: Layout[]; cur: Data[string] | undefined; setMon: (assetId: string, layoutId: number) => void; readOnly: boolean; autoFull?: boolean; onExit?: () => void; onEditing?: (on: boolean) => void }) {
  const [editing, setEditing] = useState(!!autoFull), [pick, setPick] = useState<string | null>(null), [full, setFull] = useState(!!autoFull), [turned, setTurned] = useState(false), [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => { if (!editing) return; onEditing?.(true); return () => onEditing?.(false); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const snap = useRef<{ mons: Record<string, number>; srcs: Record<string, Record<string, string>> } | null>(null), [mode, setMode] = useState<'layout' | 'source'>('layout'), [scope, setScope] = useState<'wall' | 'monitor'>('wall'), [focus, setFocus] = useState<string | null>(null),  [tilePick, setTilePick] = useState<{ a: string; n: number } | null>(null); // the layout choices when editing began, so Exit can put them back
  useEffect(() => { if (editing && !snap.current) snap.current = { mons: { ...(cur?.mons ?? {}) }, srcs: JSON.parse(JSON.stringify(cur?.srcs ?? {})) }; if (!editing) { snap.current = null; setMode('layout'); setTilePick(null); setFocus(null); setScope('wall'); } }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const exitNoSave = () => { if (snap.current && setAll) setAll(snap.current.mons, snap.current.srcs); snap.current = null; leave(); };
  const ref = useRef<HTMLDialogElement>(null), box = useRef<HTMLDivElement>(null), fsUsed = useRef(false);
  const list = wl.assets ?? [], M = full ? 10 : 24; // full screen: crop tight so the wall is as big as it can be
  const x0 = Math.min(...list.map(a => a.x)), y0 = Math.min(...list.map(a => a.y)), x1 = Math.max(...list.map(a => a.x + a.w)), y1 = Math.max(...list.map(a => a.y + a.h));
  const w = full ? x1 - x0 + 2 * M : Math.max(x1 - x0 + 2 * M, 360), h = full ? y1 - y0 + 2 * M : Math.max(y1 - y0 + 2 * M, 200), vx = (x0 + x1) / 2 - w / 2, vy = (y0 + y1) / 2 - h / 2;
  const mvsOf = (a: Asset) => (Array.isArray(a.props?.mvs) ? a.props.mvs : []).map((id: number) => layouts.find(l => l.id === id)).filter(Boolean) as Layout[];
  const chosen = (a: Asset) => { const opts = mvsOf(a); return opts.find(l => l.id === cur?.mons?.[a.id]) ?? opts[0]; };
  const inline = full; // in full screen the chooser sits inside the (possibly turned) view; otherwise it is a normal dialog
  useEffect(() => { const d = ref.current; if (!d || inline) return; const o = pick || tilePick; if (o && !d.open) d.showModal(); if (!o && d.open) d.close(); }, [pick, tilePick, inline]);
  // Full screen: the browser's own full screen where it exists (phones are asked for landscape); otherwise a full-window view, turned sideways by hand on a portrait phone.
  const portrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth && window.innerWidth < 900;
  function enter() { setFull(true); }
  // Once the full view is on screen, ask the browser for real full screen (and landscape on a phone).
  useEffect(() => { if (!full) return; let live = true; (async () => { const el = box.current;
    try { if (el?.requestFullscreen) { await el.requestFullscreen(); fsUsed.current = true; try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not allowed here */ } } } catch { /* use the full-window view */ }
    setTimeout(() => { if (live) setTurned(portrait()); }, 300); })(); return () => { live = false; }; }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  function leave() { onExit?.(); refitAfterFullScreen(); fsUsed.current = false; setEditing(false); setFull(false); setTurned(false); setPick(null); try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ } if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  useEffect(() => {
    if (!full) return;
    const onFs = () => { if (!document.fullscreenElement && fsUsed.current) leave(); }, onSize = () => { setTurned(portrait()); const v = window.visualViewport; setVp({ w: Math.round(v?.width ?? window.innerWidth), h: Math.round(v?.height ?? window.innerHeight) }); }, onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pick && !tilePick) leave(); };
    document.addEventListener('fullscreenchange', onFs); window.addEventListener('resize', onSize); window.visualViewport?.addEventListener('resize', onSize); window.addEventListener('keydown', onKey); onSize();
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('resize', onSize); window.visualViewport?.removeEventListener('resize', onSize); window.removeEventListener('keydown', onKey); };
  }, [full, pick, tilePick]); // eslint-disable-line react-hooks/exhaustive-deps
  // Full screen: stop the browser's pinch-zoom, which pulls the full-screen layer away from the page underneath.
  useEffect(() => { if (!full) return;
    const m = document.querySelector('meta[name=viewport]') as HTMLMetaElement | null, orig = m?.content ?? ''; if (m) m.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no';
    const stop = (e: Event) => e.preventDefault(), multi = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('gesturestart', stop); document.addEventListener('gesturechange', stop); document.addEventListener('touchmove', multi, { passive: false });
    return () => { if (m) m.content = orig; document.removeEventListener('gesturestart', stop); document.removeEventListener('gesturechange', stop); document.removeEventListener('touchmove', multi); }; }, [full]);
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
  const tpa = tilePick ? list.find(a => a.id === tilePick.a) : undefined, curSrc = tilePick ? srcs?.[tilePick.a]?.[tilePick.n] : undefined;
  const srcChooser = tpa && tilePick && (<div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
      <div><div className="mut" style={{ fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Assign source</div><h3 style={{ margin: 0, fontSize: '1.25rem' }}>{tpa.name ?? 'Monitor'} · window {tilePick.n}</h3></div>
      <button type="button" className="sec" onClick={() => setTilePick(null)} aria-label="Close">✕ Close</button></div>
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, alignContent: 'start', padding: '14px 2px 4px' }}>
      {sources.map(sv => { const on = curSrc === sv; return (<button key={sv} type="button" aria-pressed={on} onClick={() => { setSrc?.(tilePick.a, tilePick.n, sv); setTilePick(null); }} style={{ padding: '16px 10px', fontSize: '1.05rem', fontWeight: 700, borderRadius: 12, border: on ? '3px solid #e5352b' : '2px solid var(--line)', background: on ? 'rgba(229,53,43,.12)' : 'var(--bg)', color: 'inherit', cursor: 'pointer' }}>{sv}{on ? ' ✓' : ''}</button>); })}
      {curSrc && <button type="button" className="sec" onClick={() => { setSrc?.(tilePick.a, tilePick.n, ''); setTilePick(null); }} style={{ padding: '16px 10px', borderRadius: 12 }}>✕ Clear source</button>}</div></div>);
    const fa = focus ? list.find(a => a.id === focus) : undefined; // monitor mode: one monitor shown full screen
  const wall = (<svg viewBox={fa ? `${fa.x - 6} ${fa.y - 6} ${fa.w + 12} ${fa.h + 12}` : `${vx} ${vy} ${w} ${h}`} width="100%" height={full ? '100%' : undefined} style={{ display: 'block', background: '#1b2027', borderRadius: full ? 0 : 8, maxHeight: full ? undefined : '70vh', flex: full ? 1 : undefined, minHeight: 0 }} preserveAspectRatio="xMidYMid meet">
    {(fa ? [fa] : list).map(a => { const lay = isScreen(a.type) ? chosen(a) : undefined, can = editing && !!lay && ((mode === 'layout' && mvsOf(a).length > 1) || (mode === 'source' && scope === 'monitor' && !fa && sources.length > 0));
      return (<g key={a.id}><svg x={a.x} y={a.y} width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`}><WallArt a={{ ...a, name: a.name ?? '' }} /></svg>
        {lay && <LayoutPic lay={lay} names={wl.dests?.[a.id]} picks={srcs?.[a.id]} pos={{ x: a.x + 4, y: a.y + 4, w: a.w - 8, h: a.h - 8 }} />}
        {lay && editing && mode === 'source' && sources.length > 0 && (scope === 'wall' || fa?.id === a.id) && (() => { const bw = a.w - 8, bh = a.h - 8, sc = Math.min(bw / 1920, bh / 1080), ox = a.x + 4 + (bw - 1920 * sc) / 2, oy = a.y + 4 + (bh - 1080 * sc) / 2;
          return lay.tiles.map(t => <rect key={t.n} x={ox + t.x * sc} y={oy + t.y * sc} width={t.w * sc} height={t.h * sc} fill="rgba(125,255,176,.10)" stroke="#7dffb0" strokeWidth="3" style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-label={`Assign source to window ${t.n} of ${a.name ?? 'monitor'}`} onClick={() => setTilePick({ a: a.id, n: t.n })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTilePick({ a: a.id, n: t.n }); } }} />); })()}
        {isScreen(a.type) && !lay && <rect x={a.x + 4} y={a.y + 4} width={a.w - 8} height={a.h - 8} fill="#f8fafc" stroke="#94a3b8" strokeWidth="4" pointerEvents="none" />}
        {can && <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="rgba(229,53,43,.10)" stroke="#e5352b" strokeWidth="5" style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-label={mode === 'source' ? `Open ${a.name ?? 'monitor'} to assign sources` : `Choose MV layout for ${a.name ?? 'monitor'}`} onClick={() => (mode === 'source' ? setFocus(a.id) : setPick(a.id))} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (mode === 'source') setFocus(a.id); else setPick(a.id); } }} />}</g>); })}</svg>);
  const sm = full ? { padding: '0 10px', minHeight: 0, height: 28, fontSize: '.8rem', fontWeight: 700, lineHeight: 1, borderRadius: 8, whiteSpace: 'nowrap' as const } : undefined;
  const bar = (<div className="row" style={{ justifyContent: 'space-between', gap: 8, ...(full ? { margin: 0, flex: '0 0 auto', minHeight: 0 } : {}) }}><b style={full ? { fontSize: '.85rem' } : undefined}>{wl.name}</b>{full && editing && <span className="mut" style={{ fontSize: '.75rem' }}>{mode === 'source' ? (scope === 'monitor' ? (fa ? 'Tap a window to choose its source' : 'Tap a monitor to open it, then tap a window') : 'Tap a window to choose its source, then press Done to save') : 'Tap a monitor to choose its layout, then press Done to save'}</span>}
    <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{!readOnly && editing && fa && <button type="button" style={sm} onClick={() => { setFocus(null); setTilePick(null); }}>← Back to wall</button>}{!readOnly && editing && mode === 'source' && !fa && <>{(['wall', 'monitor'] as const).map(m => <button key={m} type="button" style={sm} className={scope === m ? '' : 'sec'} aria-pressed={scope === m} title={m === 'wall' ? 'Tap any window on the wall' : 'Pick a monitor, then its windows'} onClick={() => setScope(m)}>{m === 'wall' ? '▦ Wall' : '▭ Monitor'}</button>)}</>}{full && !readOnly && !fa && <>{(['layout', 'source'] as const).filter(m => m === 'layout' || sources.length > 0).map(m => <button key={m} type="button" style={sm} className={editing && mode === m ? '' : 'sec'} aria-pressed={editing && mode === m} title={m === 'layout' ? 'Change the MV layout on a monitor' : 'Assign sources to the windows of a layout'} onClick={() => { setMode(m); if (!editing) setEditing(true); }}>{m === 'layout' ? 'Layout' : 'Assign source'}</button>)}</>}{full && !readOnly && editing && !fa && <button type="button" style={sm} onClick={() => { snap.current = null; leave(); }}>✓ Done – save</button>}
      {fa ? null : full ? <button type="button" style={full && editing ? { ...sm, background: 'transparent', color: '#ff6b61', border: '2px solid #e5352b' } : sm} className="sec" onClick={editing ? exitNoSave : leave} title={editing ? 'Leave without keeping the changes made in this session' : 'Close full screen'}>{editing ? '✕ Exit without saving' : 'Exit'}</button> : <button type="button" className="sec" onClick={enter} title="Show this wall full screen">View</button>}</span></div>);
  const body = (<>{bar}{editing && !full && <p className="mut" style={{ margin: '4px 0' }}>{mode === 'source' ? 'Tap a window to choose its source.' : 'Tap a monitor to choose its MV layout.'}</p>}{wall}</>);
  return (<div className="card" style={full ? { padding: 0, border: 0 } : undefined}>
    {full ? (<div ref={box} style={turned ? { position: 'fixed', top: 0, left: vp.w || '100vw', width: vp.h || '100vh', height: vp.w || '100vw', transform: 'rotate(90deg)', transformOrigin: 'top left', background: 'var(--panel)', zIndex: 1000, display: 'flex', flexDirection: 'column', padding: '4px 8px', gap: 4, boxSizing: 'border-box', overflow: 'hidden', touchAction: 'pan-x pan-y' }
          : { position: 'fixed', top: 0, left: 0, width: '100%', height: vp.h || '100%', background: 'var(--panel)', zIndex: 1000, display: 'flex', flexDirection: 'column', padding: '4px 8px', gap: 4, boxSizing: 'border-box', overflow: 'hidden', touchAction: 'pan-x pan-y' }}>
      {body}{((pick && pa) || (tilePick && tpa)) && <div role="dialog" aria-modal="true" style={{ position: 'absolute', inset: 8, background: 'var(--panel)', borderRadius: 14, padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,.4)', border: '1px solid var(--line)', zIndex: 2 }}>{pick ? chooser : srcChooser}</div>}</div>)
      : (<div ref={box}>{body}</div>)}
    {!full && <dialog ref={ref} className="dlg" onClose={() => { setPick(null); setTilePick(null); }} onClick={e => { if (e.target === ref.current) { setPick(null); setTilePick(null); } }} style={{ width: 'min(1100px, 96vw)', maxWidth: '96vw', height: '90vh', maxHeight: '90vh', display: pick || tilePick ? 'block' : 'none', padding: 18 }}>{pick ? chooser : srcChooser}</dialog>}</div>);
}

export default function Plan({ walls, layouts, sources, saved, save, readOnly = false, start, below, refresh }: { refresh?: () => Promise<Data>; below?: Record<number, React.ReactNode>; start?: string; walls: Wall[]; layouts: Layout[]; sources: string[]; saved: { name: string; data: Data }[]; save?: (name: string, data: Data) => Promise<void>; readOnly?: boolean }) {
  const [name, setName] = useState((saved.find(x => x.name === start) ?? saved[0])?.name ?? 'Room Layout 1');
  // A new plan starts from each Wall Template's chosen default MV configuration.
  const seed = () => Object.fromEntries(walls.filter(x => x.defaultMons).map(x => [x.id, { assign: {}, mons: x.defaultMons }])) as Data;
  const [data, setData] = useState<Data>((saved.find(x => x.name === start) ?? saved[0])?.data ?? seed());
  const [msg, setMsg] = useState('');
  // No Save button: every change is saved automatically a moment after it is made.
  // The plan is shared: only the walls this person changed are saved, so someone else's changes to other walls are never overwritten.
  const first = useRef(true), touched = useRef(new Set<number>()), inflight = useRef(new Set<number>()), editingN = useRef(0), dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => { if (first.current) { first.current = false; return; } if (readOnly || !save || touched.current.size === 0) return; setMsg('Saving…');
    const t = setTimeout(async () => { const ids = Array.from(touched.current); touched.current.clear(); ids.forEach(i => inflight.current.add(i));
      const part: Data = {}; ids.forEach(i => { part[i] = dataRef.current[i]; });
      try { await save(name, part); setMsg('Saved'); } catch { ids.forEach(i => touched.current.add(i)); setMsg('Not saved, try again'); } finally { ids.forEach(i => inflight.current.delete(i)); } }, 700); return () => clearTimeout(t); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pick up changes other people have made (not while this person is editing a wall, or has unsaved changes to it).
  useEffect(() => { if (!refresh) return; let live = true;
    const tick = async () => { if (!live || document.hidden || editingN.current > 0) return; try { const fresh = await refresh(); if (!live || editingN.current > 0) return;
      setData(d => { let next: Data | null = null; for (const [k, v] of Object.entries(fresh)) { const id = Number(k); if (touched.current.has(id) || inflight.current.has(id)) continue; if (JSON.stringify(d[id]) !== JSON.stringify(v)) { next = next ?? { ...d }; next[id] = v as any; } } return next ?? d; }); } catch { /* try again next time */ } };
    const iv = setInterval(tick, 8000); const vis = () => { if (!document.hidden) tick(); }; document.addEventListener('visibilitychange', vis);
    return () => { live = false; clearInterval(iv); document.removeEventListener('visibilitychange', vis); }; }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = (id: number) => data[id] ?? { layoutId: undefined, assign: {} };
  // Sources are stored per tile NUMBER, so they stay in the same numbered tile when the layout changes.
  const upd = (id: number, next: Data) => { touched.current.add(id); setData(next); };
  const setLayout = (id: number, layoutId: number) => upd(id, { ...data, [id]: { ...w(id), layoutId } });
  const setMons = (id: number, mons: Record<string, number>, srcs: Record<string, Record<string, string>>) => upd(id, { ...data, [id]: { ...w(id), mons, srcs } });
  const setMon = (id: number, assetId: string, layoutId: number) => upd(id, { ...data, [id]: { ...w(id), mons: { ...(w(id).mons ?? {}), [assetId]: layoutId } } });
  const setMonSrc = (id: number, assetId: string, n: number, v: string) => { const all = { ...(w(id).srcs ?? {}) }, one = { ...(all[assetId] ?? {}) }; if (v) one[n] = v; else delete one[n]; all[assetId] = one; upd(id, { ...data, [id]: { ...w(id), srcs: all } }); };
  const setSrc = (id: number, n: number, v: string) => upd(id, { ...data, [id]: { ...w(id), assign: { ...w(id).assign, [n]: v } } });
  return (<div>
    {!readOnly && msg && <div className="mut" style={{ textAlign: 'right', fontSize: '.8rem' }}>{msg}</div>}
    {walls.map(wl => <div key={wl.id}>{((wl) => { if ((wl.assets ?? []).some(a => isScreen(a.type) && a.props?.mvs?.length)) return <WallPlan key={wl.id} wl={wl} layouts={layouts} cur={data[wl.id]} readOnly={readOnly} setMon={(a, l) => setMon(wl.id, a, l)} setAll={(m, sr) => setMons(wl.id, m, sr)} onEditing={on => { editingN.current += on ? 1 : -1; }} sources={sources} srcs={data[wl.id]?.srcs} setSrc={(a, n, v) => setMonSrc(wl.id, a, n, v)} />;
      const cur = w(wl.id); const lay = layouts.find(l => l.id === cur.layoutId);
      return (<div key={wl.id} className="card"><b>{wl.name}</b>
        <div className="row"><select disabled={readOnly} value={cur.layoutId ?? ''} onChange={e => setLayout(wl.id, Number(e.target.value))}><option value="">Choose MV Layout…</option>{layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        {lay && <svg viewBox="0 0 1920 1080" style={{ width: '100%', maxWidth: 640, background: '#000' }}>
          {lay.tiles.map(t => (<g key={t.n}><rect x={t.x + 6} y={t.y + 6} width={t.w - 12} height={t.h - 12} fill="#1a1f27" stroke="#5a6472" strokeWidth="4" />
            <text x={t.x + 30} y={t.y + 70} fill="#e5352b" fontSize="64">{t.n}</text>
            <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 20} fill="#fff" fontSize={Math.min(70, t.w / 9)} textAnchor="middle">{cur.assign[t.n] ?? ''}</text></g>))}</svg>}
        {lay && <table><tbody>{lay.tiles.map(t => (<tr key={t.n}><td>Tile {t.n}</td><td><select disabled={readOnly} value={cur.assign[t.n] ?? ''} onChange={e => setSrc(wl.id, t.n, e.target.value)}><option value="">—</option>{sources.map(s => <option key={s}>{s}</option>)}</select></td></tr>))}</tbody></table>}
      </div>); })(wl)}{below?.[wl.id]}</div>)}</div>);
}
