'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { addNote, pageNotes, replyNote, type DevNote } from '@/lib/devfeedback';

// Dev site only: a floating bar to leave notes, drawings and highlights on any page. Marks sit at page coordinates over the document.
const COL = ['', '#2ea043', '#e3a008', '#e5352b']; // severity 1 minor, 2 medium, 3 serious
type Draft = { kind: 'note' | 'draw' | 'highlight'; x: number; y: number; drawing?: any };
export default function DevBar({ owner }: { owner: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(true), [tool, setTool] = useState<null | 'note' | 'draw' | 'highlight'>(null), [sev, setSev] = useState(2), [list, setList] = useState(false);
  const [notes, setNotes] = useState<DevNote[]>([]), [draft, setDraft] = useState<Draft | null>(null), [text, setText] = useState(''), [msg, setMsg] = useState(''), [active, setActive] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 }), [live, setLive] = useState<{ x: number; y: number }[] | null>(null), [rect, setRect] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const start = useRef<{ x: number; y: number } | null>(null), [reply, setReply] = useState<Record<number, string>>({});
  const page = () => location.pathname + location.search;
  const load = useCallback(async () => setNotes(await pageNotes(page())), []);
  useEffect(() => { load().then(() => { const id = Number(new URLSearchParams(location.search).get('devnote')); if (id) setActive(id); }); }, [path, load]);
  useEffect(() => { const f = () => setSize({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }); f();
    const ro = new ResizeObserver(f); ro.observe(document.body); window.addEventListener('resize', f); return () => { ro.disconnect(); window.removeEventListener('resize', f); }; }, [path, notes]);
  const top = notes.filter(n => !n.parent_id), repliesOf = (id: number) => notes.filter(n => n.parent_id === id);
  useEffect(() => { const n = top.find(t => t.id === active); if (n && n.y != null) window.scrollTo({ top: Math.max(0, n.y - 120), behavior: 'smooth' }); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const pt = (e: React.PointerEvent) => ({ x: Math.round(e.pageX), y: Math.round(e.pageY) });
  const down = (e: React.PointerEvent) => {
    if (!tool || draft) return; const p = pt(e); (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'note') { setDraft({ kind: 'note', ...p }); setText(''); return; }
    start.current = p; if (tool === 'draw') setLive([p]); else setRect({ ...p, w: 0, h: 0 }); };
  const move = (e: React.PointerEvent) => { const s = start.current; if (!s) return; const p = pt(e);
    if (tool === 'draw') setLive(l => (l ? [...l, p] : l)); else setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); };
  const up = () => { if (!start.current) return; start.current = null;
    if (tool === 'draw' && live && live.length > 1) { const pts = live.filter((_, i) => i % 2 === 0 || i === live.length - 1); setDraft({ kind: 'draw', x: pts[0].x, y: pts[0].y, drawing: { pts } }); setText(''); }
    else if (tool === 'highlight' && rect && rect.w > 6 && rect.h > 6) { setDraft({ kind: 'highlight', x: rect.x, y: rect.y, drawing: rect }); setText(''); }
    setLive(null); setRect(null); };
  async function save() {
    if (!draft) return; const r = await addNote({ page: page(), kind: draft.kind, body: text, severity: sev, x: draft.x, y: draft.y, vw: window.innerWidth, drawing: draft.drawing });
    if (r.error) { setMsg(r.error); return; } setDraft(null); setText(''); setMsg(''); setTool(null); await load(); setList(true); }
  const idx = (id: number) => top.findIndex(n => n.id === id) + 1;
  const mark = (n: DevNote) => { const c = COL[n.severity] ?? COL[2], a = n.id === active;
    if (n.kind === 'draw' && n.drawing?.pts) return <polyline key={n.id} points={n.drawing.pts.map((p: any) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={c} strokeWidth={a ? 6 : 4} strokeLinecap="round" strokeLinejoin="round" />;
    if (n.kind === 'highlight' && n.drawing) return <rect key={n.id} x={n.drawing.x} y={n.drawing.y} width={n.drawing.w} height={n.drawing.h} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={a ? 4 : 2} />;
    return null; };
  const pin = (n: DevNote) => (<g key={'p' + n.id} style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={() => { setActive(n.id); setList(true); setOpen(true); }}><circle cx={n.x ?? 0} cy={n.y ?? 0} r={n.id === active ? 15 : 12} fill={COL[n.severity] ?? COL[2]} stroke="#fff" strokeWidth={2} /><text x={n.x ?? 0} y={(n.y ?? 0) + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{idx(n.id)}</text></g>);
  return (<>
    <div aria-hidden={!tool} style={{ position: 'absolute', left: 0, top: 0, width: size.w, height: size.h, zIndex: 2147483000, pointerEvents: tool && !draft ? 'auto' : 'none', cursor: tool ? 'crosshair' : 'default', touchAction: tool ? 'none' : 'auto' }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <svg width={size.w} height={size.h} style={{ display: 'block', pointerEvents: 'none' }}>
        {top.map(mark)}{top.map(pin)}
        {live && <polyline points={live.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={COL[sev]} strokeWidth={4} strokeLinecap="round" />}
        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={COL[sev]} fillOpacity={0.28} stroke={COL[sev]} strokeWidth={2} />}
        {draft?.kind === 'highlight' && draft.drawing && <rect x={draft.drawing.x} y={draft.drawing.y} width={draft.drawing.w} height={draft.drawing.h} fill={COL[sev]} fillOpacity={0.28} stroke={COL[sev]} strokeWidth={2} />}
        {draft?.kind === 'draw' && <polyline points={draft.drawing.pts.map((p: any) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={COL[sev]} strokeWidth={4} strokeLinecap="round" />}
        {draft?.kind === 'note' && <circle cx={draft.x} cy={draft.y} r={12} fill={COL[sev]} stroke="#fff" strokeWidth={2} />}
      </svg></div>
    <div role="region" aria-label="Dev comments" style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 2147483600, width: open ? 'min(360px, calc(100vw - 24px))' : 'auto', background: '#161b22', color: '#e6edf3', border: '1px solid #3b82f6', borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,.5)', font: '14px system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, flexWrap: 'wrap' }}>
        <b style={{ color: '#60a5fa', fontSize: 12, letterSpacing: '.05em' }}>DEV</b>
        {open && <>{(['note', 'draw', 'highlight'] as const).map(t => <button key={t} type="button" onClick={() => { setTool(tool === t ? null : t); setDraft(null); }} style={btn(tool === t)}>{t === 'note' ? '📌 Note' : t === 'draw' ? '✏️ Draw' : '🖍 Highlight'}</button>)}
          <span title="Severity" style={{ display: 'flex', gap: 3 }}>{[1, 2, 3].map(s => <button key={s} type="button" onClick={() => setSev(s)} aria-pressed={sev === s} title={['', 'Severity 1: minor', 'Severity 2: medium', 'Severity 3: serious'][s]} style={{ ...btn(sev === s), background: sev === s ? COL[s] : '#222a35', color: '#fff', minWidth: 28 }}>{s}</button>)}</span>
          <button type="button" onClick={() => setList(!list)} style={btn(list)}>List ({top.length})</button>
          {owner && <a href="/webappdev/markup" style={{ ...btn(false), textDecoration: 'none' }}>Markup</a>}</>}
        <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'} style={{ ...btn(false), marginLeft: 'auto' }}>{open ? '–' : '＋'}</button>
      </div>
      {open && tool && !draft && <div style={{ padding: '0 10px 8px', color: '#9aa7b5', fontSize: 12 }}>{tool === 'note' ? 'Tap the page where the note belongs.' : tool === 'draw' ? 'Draw on the page with your finger or mouse.' : 'Drag a box around what you want to point out.'}</div>}
      {open && draft && <div style={{ padding: '0 10px 10px', display: 'grid', gap: 6 }}>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={draft.kind === 'note' ? 'What needs to change?' : 'Add a comment (optional)'} rows={3} style={{ width: '100%', boxSizing: 'border-box', background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 8, padding: 8, font: 'inherit' }} />
        {msg && <span style={{ color: '#ff7b72' }}>{msg}</span>}
        <div style={{ display: 'flex', gap: 6 }}><button type="button" onClick={save} style={{ ...btn(true), background: '#2563eb' }}>Save (severity {sev})</button><button type="button" onClick={() => { setDraft(null); setMsg(''); }} style={btn(false)}>Cancel</button></div></div>}
      {open && list && <div style={{ maxHeight: '45vh', overflow: 'auto', borderTop: '1px solid #30363d', padding: 8, display: 'grid', gap: 8 }}>
        {top.length === 0 && <span style={{ color: '#9aa7b5' }}>No comments on this page yet.</span>}
        {top.map(n => (<div key={n.id} onClick={() => setActive(n.id)} style={{ border: `1px solid ${n.id === active ? COL[n.severity] : '#30363d'}`, borderLeft: `5px solid ${COL[n.severity]}`, borderRadius: 8, padding: 8, cursor: 'pointer' }}>
          <div style={{ fontSize: 12, color: '#9aa7b5' }}>#{idx(n.id)} · {n.user_name} · {new Date(n.created_at).toLocaleString()} · {n.kind}{n.status === 'done' ? ' · done' : ''}</div>
          {n.body && <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{n.body}</div>}
          {repliesOf(n.id).map(r => <div key={r.id} style={{ marginTop: 6, padding: '6px 8px', background: '#1f2a3a', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#60a5fa' }}>{r.user_name} replied · {new Date(r.created_at).toLocaleString()}</div><div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div></div>)}
          {owner && <form onSubmit={async e => { e.preventDefault(); const t = (reply[n.id] ?? '').trim(); if (!t) return; await replyNote(n.id, t); setReply({ ...reply, [n.id]: '' }); load(); }} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={reply[n.id] ?? ''} onChange={e => setReply({ ...reply, [n.id]: e.target.value })} placeholder="Reply…" style={{ flex: 1, minWidth: 0, background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 6, padding: '4px 8px' }} /><button style={btn(true)}>Reply</button></form>}
        </div>))}</div>}
    </div></>);
}
const btn = (on: boolean): React.CSSProperties => ({ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', padding: '5px 9px', borderRadius: 8, background: on ? '#2563eb' : '#222a35', color: '#e6edf3', fontSize: 13, textAlign: 'center' });
