'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { makeAnchor, describe, pickAt, pickFor, mapper, type Anchor } from './devAnchor';
import { addNote, addMarks, pageNotes, replyNote, myNotes, type DevNote } from '@/lib/devfeedback';

// Dev site only: a floating bar to leave notes, drawings and highlights on any page. Marks sit at page coordinates over the document.
const COL = ['', '#2ea043', '#e3a008', '#e5352b']; // severity 1 minor, 2 medium, 3 serious
type Mark = { t: 'draw'; pts: { x: number; y: number }[] } | { t: 'hl'; x: number; y: number; w: number; h: number };
type Draft = { x: number; y: number; marks: Mark[]; anchor?: Anchor; subject?: string };
export default function DevBar({ owner }: { owner: boolean }) {
  const path = usePathname();
  const [mine, setMine] = useState<(DevNote & { replies: DevNote[] })[] | null>(null), [all, setAll] = useState(false);
  const [open, setOpen] = useState(false), [tool, setTool] = useState<null | 'note' | 'draw' | 'highlight'>(null), [sev, setSev] = useState(2), [list, setList] = useState(false);
  const [notes, setNotes] = useState<DevNote[]>([]), [draft, setDraft] = useState<Draft | null>(null), [text, setText] = useState(''), [msg, setMsg] = useState(''), [active, setActive] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 }), [live, setLive] = useState<{ x: number; y: number }[] | null>(null), [rect, setRect] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const start = useRef<{ x: number; y: number } | null>(null), [reply, setReply] = useState<Record<number, string>>({});
  const [, setTick] = useState(0); // bumps when the page changes so marks follow the items they are stuck to
  useEffect(() => { let t: any; const bump = () => { clearTimeout(t); t = setTimeout(() => setTick(n => n + 1), 150); };
    const mo = new MutationObserver(bump); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'open'] });
    window.addEventListener('resize', bump); window.addEventListener('scroll', bump, true); const iv = setInterval(bump, 2000);
    return () => { clearTimeout(t); mo.disconnect(); window.removeEventListener('resize', bump); window.removeEventListener('scroll', bump, true); clearInterval(iv); }; }, [path]);
  const page = () => location.pathname + location.search;
  const load = useCallback(async () => setNotes(await pageNotes(page())), []);
  useEffect(() => { load().then(() => { const id = Number(new URLSearchParams(location.search).get('devnote')); if (id) setActive(id); }); }, [path, load]);
  useEffect(() => { const f = () => setSize({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }); f();
    const ro = new ResizeObserver(f); ro.observe(document.body); window.addEventListener('resize', f); return () => { ro.disconnect(); window.removeEventListener('resize', f); }; }, [path, notes]);
  const device = typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop', allTop = notes.filter(n => !n.parent_id), top = allTop.filter(n => n.device === device), other = allTop.length - top.length, repliesOf = (id: number) => notes.filter(n => n.parent_id === id);
  useEffect(() => { const n = top.find(t => t.id === active); if (n && n.y != null) window.scrollTo({ top: Math.max(0, mapper(n.anchor).f({ x: n.x ?? 0, y: n.y }).y - 120), behavior: 'smooth' }); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const pt = (e: React.PointerEvent) => ({ x: Math.round(e.pageX), y: Math.round(e.pageY) });
  const target = draft ? 'draft' : top.find(n => n.id === active && (n.mine || owner) && n.kind === 'note') ? 'note' : null; // Draw and Highlight need a note to belong to
  const down = (e: React.PointerEvent) => {
    if (!tool || (tool === 'note' && draft) || (tool !== 'note' && !target)) return; const p = pt(e); (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'note') { const el = pickAt(e.clientX, e.clientY); setDraft({ ...p, marks: [], anchor: makeAnchor(el), subject: describe(el) }); setText(''); setTool(null); return; }
    start.current = p; if (tool === 'draw') setLive([p]); else setRect({ ...p, w: 0, h: 0 }); };
  const move = (e: React.PointerEvent) => { const s = start.current; if (!s) return; const p = pt(e);
    if (tool === 'draw') setLive(l => (l ? [...l, p] : l)); else setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); };
  const up = async () => { if (!start.current) return; start.current = null; let m: Mark | null = null;
    if (tool === 'draw' && live && live.length > 1) m = { t: 'draw', pts: live.filter((_, i) => i % 2 === 0 || i === live.length - 1) };
    else if (tool === 'highlight' && rect && rect.w > 6 && rect.h > 6) m = { t: 'hl', ...rect };
    setLive(null); setRect(null); if (!m) return; setTool(null);
    if (draft) setDraft({ ...draft, marks: [...draft.marks, m] }); else if (active) { const r = await addMarks(active, [m]); if (r.error) setMsg(r.error); else await load(); } };
  async function save() {
    if (!draft) return; const r = await addNote({ page: page(), kind: 'note', body: text, severity: sev, x: draft.x, y: draft.y, vw: window.innerWidth, device, drawing: draft.marks.length ? { marks: draft.marks } : undefined, anchor: draft.anchor, subject: draft.subject });
    if (r.error) { setMsg(r.error); return; } setDraft(null); setText(''); setMsg(''); setTool(null); await load(); setList(true); }
  const openAll = async () => { const next = !all; setAll(next); if (next) { setOpen(true); setList(false); setMine(await myNotes()); } };
  const idx = (id: number) => top.findIndex(n => n.id === id) + 1;
  const shapes = (n: DevNote): Mark[] => n.kind === 'note' ? (Array.isArray(n.drawing?.marks) ? n.drawing.marks : []) : n.kind === 'draw' && n.drawing?.pts ? [{ t: 'draw', pts: n.drawing.pts }] : n.kind === 'highlight' && n.drawing ? [{ t: 'hl', x: n.drawing.x, y: n.drawing.y, w: n.drawing.w, h: n.drawing.h }] : [];
  const drawShape = (m: Mark, f: (p: { x: number; y: number }) => { x: number; y: number }, c: string, a: boolean, o: number, key: string) => {
    if (m.t === 'draw') return <polyline key={key} opacity={o} points={m.pts.map(p => { const q = f(p); return `${q.x},${q.y}`; }).join(' ')} fill="none" stroke={c} strokeWidth={a ? 6 : 4} strokeLinecap="round" strokeLinejoin="round" />;
    const p1 = f({ x: m.x, y: m.y }), p2 = f({ x: m.x + m.w, y: m.y + m.h }); return <rect key={key} opacity={o} x={p1.x} y={p1.y} width={Math.max(2, p2.x - p1.x)} height={Math.max(2, p2.y - p1.y)} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={a ? 4 : 2} />; };
  const mark = (n: DevNote) => { const mp = mapper(n.anchor); return shapes(n).map((m, i) => drawShape(m, mp.f, COL[n.severity] ?? COL[2], n.id === active, mp.miss ? 0.45 : 1, `${n.id}-${i}`)); };
  const pin = (n: DevNote) => { const q = mapper(n.anchor).f({ x: n.x ?? 0, y: n.y ?? 0 }); return (<g key={'p' + n.id} opacity={mapper(n.anchor).miss ? 0.45 : 1} style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={() => { setActive(n.id); setList(true); setOpen(true); }}><circle cx={q.x} cy={q.y} r={n.id === active ? 15 : 12} fill={COL[n.severity] ?? COL[2]} stroke="#fff" strokeWidth={2} /><text x={q.x} y={q.y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{idx(n.id)}</text></g>); };
  return (<>
    <div data-devbar aria-hidden={!tool} style={{ position: 'absolute', left: 0, top: 0, width: size.w, height: size.h, zIndex: 2147483000, pointerEvents: tool && (tool !== 'note' || !draft) ? 'auto' : 'none', cursor: tool ? 'crosshair' : 'default', touchAction: tool ? 'none' : 'auto' }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <svg width={size.w} height={size.h} style={{ display: 'block', pointerEvents: 'none' }}>
        {top.map(mark)}{top.map(pin)}
        {live && <polyline points={live.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={COL[sev]} strokeWidth={4} strokeLinecap="round" />}
        {rect && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={COL[sev]} fillOpacity={0.28} stroke={COL[sev]} strokeWidth={2} />}
        {draft && draft.marks.map((m, i) => drawShape(m, q => q, COL[sev], false, 1, 'd' + i))}
        {draft && <circle cx={draft.x} cy={draft.y} r={12} fill={COL[sev]} stroke="#fff" strokeWidth={2} />}
      </svg></div>
    <div data-devbar role="region" aria-label="Dev comments" style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 2147483600, width: open ? (all ? 'min(620px, calc(100vw - 24px))' : 'min(360px, calc(100vw - 24px))') : 'auto', background: '#161b22', color: '#e6edf3', border: '1px solid #3b82f6', borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,.5)', font: '14px system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, flexWrap: 'wrap' }}>
        <b style={{ color: '#60a5fa', fontSize: 12, letterSpacing: '.05em' }}>DEV</b>
        {open && <>{(['note', 'draw', 'highlight'] as const).map(t => { const dis = t !== 'note' && !target; return <button key={t} type="button" disabled={dis} onClick={() => setTool(tool === t ? null : t)} title={dis ? 'Place a note first (or pick one of your notes in the list), then add a drawing or highlight to it' : undefined} style={{ ...btn(tool === t), opacity: dis ? 0.4 : 1, cursor: dis ? 'not-allowed' : 'pointer' }}>{t === 'note' ? '📌 Note' : t === 'draw' ? '✏️ Draw' : '🖍 Highlight'}</button>; })}
          <span title="Severity" style={{ display: 'flex', gap: 3 }}>{[1, 2, 3].map(s => <button key={s} type="button" onClick={() => setSev(s)} aria-pressed={sev === s} title={['', 'Severity 1: minor', 'Severity 2: medium', 'Severity 3: serious'][s]} style={{ ...btn(sev === s), background: sev === s ? COL[s] : '#222a35', color: '#fff', minWidth: 28 }}>{s}</button>)}</span>
          <button type="button" onClick={openAll} style={btn(all)} title="Everything you have commented, on every page">⤢ All mine</button>
          <button type="button" onClick={() => { setList(!list); setAll(false); }} style={btn(list)}>List ({top.length}{other ? `+${other}` : ''})</button>
          {owner && <a href="/webappdev/markup" style={{ ...btn(false), textDecoration: 'none' }}>Markup</a>}</>}
        <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'} style={{ ...btn(false), marginLeft: 'auto' }}>{open ? '–' : '＋'}</button>
      </div>
      {open && tool && <div style={{ padding: '0 10px 8px', color: '#9aa7b5', fontSize: 12 }}>{tool === 'note' ? 'Tap the item or place on the page this note is about.' : tool === 'draw' ? 'Draw on the page, near the note.' : 'Drag a box around what you want to point out.'}</div>}
      {open && draft && <div style={{ padding: '0 10px 10px', display: 'grid', gap: 6 }}>
        {draft.subject && <div style={{ fontSize: 12, color: '#9aa7b5' }}>On: <b style={{ color: '#e6edf3' }}>{draft.subject}</b></div>}
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="What needs to change?" rows={3} style={{ width: '100%', boxSizing: 'border-box', background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 8, padding: 8, font: 'inherit' }} />
        {msg && <span style={{ color: '#ff7b72' }}>{msg}</span>}
        {draft.marks.length > 0 && <div style={{ fontSize: 12, color: '#9aa7b5' }}>{draft.marks.length} drawing/highlight{draft.marks.length === 1 ? '' : 's'} attached. <button type="button" onClick={() => setDraft({ ...draft, marks: draft.marks.slice(0, -1) })} style={{ ...btn(false), padding: '1px 6px' }}>Undo last</button></div>}
        {draft.marks.length === 0 && <div style={{ fontSize: 12, color: '#9aa7b5' }}>Optional: add a ✏️ Draw or 🖍 Highlight to this note.</div>}
        <div style={{ display: 'flex', gap: 6 }}><button type="button" onClick={save} style={{ ...btn(true), background: '#2563eb' }}>Save (severity {sev})</button><button type="button" onClick={() => { setDraft(null); setMsg(''); }} style={btn(false)}>Cancel</button></div></div>}
      {open && all && <div style={{ maxHeight: '65vh', overflow: 'auto', borderTop: '1px solid #30363d', padding: 8, display: 'grid', gap: 8 }}>
        {mine === null && <span style={{ color: '#9aa7b5' }}>Loading…</span>}
        {mine && mine.length === 0 && <span style={{ color: '#9aa7b5' }}>You haven’t left any comments yet.</span>}
        {mine?.map(n => (<div key={n.id} style={{ border: '1px solid #30363d', borderLeft: `5px solid ${COL[n.severity]}`, borderRadius: 8, padding: 8 }}>
          <div style={{ fontSize: 12, color: '#9aa7b5' }}>{n.device === 'mobile' ? '📱' : '🖥'} · {new Date(n.created_at).toLocaleString()} · {n.kind} · severity {n.severity} · <b style={{ color: n.status === 'done' ? '#2ea043' : '#e6edf3' }}>{n.status === 'done' ? 'done' : 'open'}</b></div>
          {n.subject && <div style={{ fontWeight: 700, marginTop: 4 }}>{n.subject}</div>}
          {n.body && <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{n.body}</div>}
          {n.replies.map(r => <div key={r.id} style={{ marginTop: 6, padding: '6px 8px', background: '#1f2a3a', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#60a5fa' }}>{r.user_name} replied · {new Date(r.created_at).toLocaleString()}</div><div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div></div>)}
          <a href={n.page + (n.page.includes('?') ? '&' : '?') + 'devnote=' + n.id} style={{ color: '#60a5fa', fontSize: 12, wordBreak: 'break-all' }}>{n.page}</a></div>))}</div>}
      {open && list && <div style={{ maxHeight: '45vh', overflow: 'auto', borderTop: '1px solid #30363d', padding: 8, display: 'grid', gap: 8 }}>
        {other > 0 && <span style={{ color: '#9aa7b5', fontSize: 12 }}>{other} more on the {device === 'mobile' ? 'desktop' : 'mobile'} view (marks are placed for that screen size).</span>}
        {top.length === 0 && <span style={{ color: '#9aa7b5' }}>No {device} comments on this page yet.</span>}
        {top.map(n => (<div key={n.id} onClick={() => setActive(n.id)} style={{ border: `1px solid ${n.id === active ? COL[n.severity] : '#30363d'}`, borderLeft: `5px solid ${COL[n.severity]}`, borderRadius: 8, padding: 8, cursor: 'pointer' }}>
          <div style={{ fontSize: 12, color: '#9aa7b5' }}>#{idx(n.id)} · {n.device === 'mobile' ? '📱' : '🖥'} · {n.user_name} · {new Date(n.created_at).toLocaleString()} · {n.kind}{n.status === 'done' ? ' · done' : ''}</div>
          {n.subject && <div style={{ fontWeight: 700, marginTop: 4 }}>{n.subject}{mapper(n.anchor).miss && <span style={{ color: '#e3a008', fontWeight: 400, fontSize: 12 }}> ⚠ not on the page now</span>}</div>}
          {n.body && <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{n.body}</div>}
          {repliesOf(n.id).map(r => <div key={r.id} style={{ marginTop: 6, padding: '6px 8px', background: '#1f2a3a', borderRadius: 6 }}><div style={{ fontSize: 11, color: '#60a5fa' }}>{r.user_name} replied · {new Date(r.created_at).toLocaleString()}</div><div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div></div>)}
          {owner && <form onSubmit={async e => { e.preventDefault(); const t = (reply[n.id] ?? '').trim(); if (!t) return; await replyNote(n.id, t); setReply({ ...reply, [n.id]: '' }); load(); }} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={reply[n.id] ?? ''} onChange={e => setReply({ ...reply, [n.id]: e.target.value })} placeholder="Reply…" style={{ flex: 1, minWidth: 0, background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 6, padding: '4px 8px' }} /><button style={btn(true)}>Reply</button></form>}
        </div>))}</div>}
    </div></>);
}
const btn = (on: boolean): React.CSSProperties => ({ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', padding: '5px 9px', borderRadius: 8, background: on ? '#2563eb' : '#222a35', color: '#e6edf3', fontSize: 13, textAlign: 'center' });
