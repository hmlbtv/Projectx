'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export type Ev = { id: number; title: string; prod: string; bc: number; bcName: string; start: string; end: string };
const COLORS = ['#4285f4', '#ea4335', '#34a853', '#fa7b17', '#a142f4', '#00acc1', '#e91e63', '#7cb342', '#795548', '#5c6bc0'];
const DAY = 86400000, key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mon = (d: Date) => add(d, -((d.getDay() + 6) % 7)); // weeks start on Monday
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A Google-Calendar style view of every Job by date, coloured by Broadcaster.
export default function Calendar({ events, initView = 'month', initDate }: { events: Ev[]; initView?: 'day' | 'week' | 'month'; initDate?: string }) {
  const [view, setView] = useState<'day' | 'week' | 'month'>(initView), [cur, setCur] = useState(() => { if (initDate && /^\d{4}-\d{2}-\d{2}$/.test(initDate)) return parse(initDate); const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }), [hide, setHide] = useState<number[]>([]);
  // keep the address in step with what is on screen, so the browser's Back button also returns to this same view
  useEffect(() => { try { window.history.replaceState(window.history.state, '', `/productions?v=cal&cd=${key(cur)}&cv=${view}`); } catch { /* ignore */ } }, [cur, view]);
  const bcs = useMemo(() => Array.from(new Map(events.map(e => [e.bc, e.bcName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [events]);
  const col = (bc: number) => COLORS[bcs.findIndex(b => b[0] === bc) % COLORS.length];
  const vis = events.filter(e => !hide.includes(e.bc));
  const on = (d: Date) => vis.filter(e => key(d) >= e.start && key(d) <= e.end);
  const today = key(new Date());
  const step = (n: number) => setCur(view === 'month' ? new Date(cur.getFullYear(), cur.getMonth() + n, 1) : add(cur, n * (view === 'week' ? 7 : 1)));
  const title = view === 'month' ? `${MN[cur.getMonth()]} ${cur.getFullYear()}` : view === 'day' ? cur.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : (() => { const a = mon(cur), b = add(a, 6); return `${a.getDate()} ${MN[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MN[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`; })();
  const chip = (e: Ev, d: Date, full = false) => { const first = key(d) === e.start || d.getDay() === 1; return (<Link key={e.id} href={`/productions?j=${e.id}&from=cal&cd=${key(cur)}&cv=${view}`} title={`${e.bcName} › ${e.prod} › ${e.title}`} style={{ display: 'block', background: col(e.bc), color: '#fff', borderRadius: 4, padding: full ? '4px 8px' : '1px 6px', fontSize: full ? '.9rem' : '.75rem', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: full ? 'normal' : 'nowrap', textDecoration: 'none', marginBottom: 2 }}>{first || full ? <b>{e.title}</b> : ' '}{full && <div style={{ opacity: .9, fontSize: '.8rem' }}>{e.bcName} › {e.prod}</div>}</Link>); };
  const grid = (days: Date[], tall: boolean, full = false) => (<div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length === 1 ? 1 : 7}, minmax(0, 1fr))`, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
    {days.length > 1 && DN.map(n => <div key={n} className="mut" style={{ padding: '6px 4px', textAlign: 'center', fontSize: '.75rem', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>{n}</div>)}
    {days.map((d, i) => { const k = key(d), t = k === today, out = view === 'month' && d.getMonth() !== cur.getMonth(); return (<div key={k + i} style={{ minHeight: tall ? (full ? 240 : 110) : 80, padding: 4, borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: out ? 'rgba(128,128,128,.07)' : undefined, minWidth: 0 }}>
      <button type="button" onClick={() => { setCur(d); setView('day'); }} style={{ all: 'unset', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', minWidth: 24, height: 24, borderRadius: 12, fontSize: '.8rem', fontWeight: t ? 700 : 400, background: t ? '#e5352b' : undefined, color: t ? '#fff' : out ? 'var(--mut, #888)' : undefined, marginBottom: 2 }}>{view === 'week' ? `${d.getDate()}` : d.getDate() === 1 && view === 'month' ? `${d.getDate()} ${MN[d.getMonth()].slice(0, 3)}` : d.getDate()}</button>
      {on(d).map(e => chip(e, d, full))}</div>); })}</div>);
  // Month and Week: one row per week; a multi-day Job is a single bar across its days (continuing onto the next week's row if it runs on).
  const weeks = (days: Date[], full: boolean) => { const rowsOut = []; for (let i = 0; i < days.length; i += 7) rowsOut.push(days.slice(i, i + 7));
    return (<div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>{DN.map(n => <div key={n} className="mut" style={{ padding: '6px 4px', textAlign: 'center', fontSize: '.75rem', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>{n}</div>)}</div>
      {rowsOut.map(wk => { const a = key(wk[0]), z = key(wk[6]); const evs = vis.filter(e => e.end >= a && e.start <= z).sort((x, y) => x.start.localeCompare(y.start) || y.end.localeCompare(x.end));
        const lanes: number[] = [], placed = evs.map(e => { const s0 = Math.max(0, wk.findIndex(d => key(d) >= e.start) < 0 ? 0 : wk.findIndex(d => key(d) >= e.start)), s = e.start < a ? 0 : s0, en = e.end > z ? 6 : wk.findIndex(d => key(d) === e.end); let l = 0; while (lanes[l] !== undefined && lanes[l] >= s) l++; lanes[l] = en; return { e, s, en, l }; });
        const h = Math.max(full ? 200 : 96, 34 + lanes.length * 24 + 6);
        return (<div key={a} style={{ position: 'relative', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>{wk.map((d, i) => { const k = key(d), t = k === today, out = view === 'month' && d.getMonth() !== cur.getMonth(); return (<div key={k} style={{ height: h, padding: 4, borderRight: i < 6 ? '1px solid var(--line)' : undefined, background: out ? 'rgba(128,128,128,.07)' : undefined, minWidth: 0 }}>
            <button type="button" onClick={() => { setCur(d); setView('day'); }} style={{ all: 'unset', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', minWidth: 24, height: 24, padding: '0 2px', borderRadius: 12, fontSize: '.8rem', fontWeight: t ? 700 : 400, background: t ? '#e5352b' : undefined, color: t ? '#fff' : out ? 'var(--mut, #888)' : undefined }}>{d.getDate() === 1 && view === 'month' ? `${d.getDate()} ${MN[d.getMonth()].slice(0, 3)}` : d.getDate()}</button></div>); })}</div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 32, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridAutoRows: 22, rowGap: 2, padding: '0 3px', pointerEvents: 'none' }}>
            {placed.map(({ e, s, en, l }) => (<Link key={e.id} href={`/productions?j=${e.id}&from=cal&cd=${key(cur)}&cv=${view}`} title={`${e.bcName} › ${e.prod} › ${e.title} (${e.start}${e.end !== e.start ? ' to ' + e.end : ''})`} style={{ gridColumn: `${s + 1} / ${en + 2}`, gridRow: l + 1, pointerEvents: 'auto', background: col(e.bc), color: '#fff', textDecoration: 'none', fontSize: '.75rem', lineHeight: '22px', padding: '0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: `${e.start < a ? 0 : 4}px ${e.end > z ? 0 : 4}px ${e.end > z ? 0 : 4}px ${e.start < a ? 0 : 4}px`, margin: '0 1px' }}><b>{e.title}</b>{full || en > s ? <span style={{ opacity: .85 }}> · {e.prod}</span> : null}</Link>))}</div></div>); })}</div>); };
  const month = () => { const a = mon(new Date(cur.getFullYear(), cur.getMonth(), 1)), end = add(mon(new Date(cur.getFullYear(), cur.getMonth() + 1, 0)), 6), n = Math.round((end.getTime() - a.getTime()) / DAY) + 1; return Array.from({ length: n }, (_, i) => add(a, i)); };
  return (<div style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="sec small" onClick={() => setCur(new Date())}>Today</button>
      <button type="button" className="sec small" aria-label="Previous" onClick={() => step(-1)}>‹</button><button type="button" className="sec small" aria-label="Next" onClick={() => step(1)}>›</button>
      <b style={{ fontSize: '1.15rem', flex: 1, minWidth: 140 }}>{title}</b>
      <div style={{ display: 'flex', gap: 0 }}>{(['day', 'week', 'month'] as const).map(v => <button key={v} type="button" className={view === v ? 'small' : 'sec small'} onClick={() => setView(v)} style={{ textTransform: 'capitalize', borderRadius: v === 'day' ? '8px 0 0 8px' : v === 'month' ? '0 8px 8px 0' : 0 }}>{v}</button>)}</div></div>
    {bcs.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{bcs.map(([id, name]) => { const off = hide.includes(id); return (<button key={id} type="button" className="sec small" aria-pressed={!off} onClick={() => setHide(off ? hide.filter(x => x !== id) : [...hide, id])} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: off ? .5 : 1 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: col(id), display: 'inline-block' }} />{name}</button>); })}</div>}
    {events.length === 0 && <p className="mut">No Jobs with dates yet. Add a Job date to a Job and it appears here.</p>}
    {view === 'month' ? weeks(month(), false) : view === 'week' ? weeks(Array.from({ length: 7 }, (_, i) => add(mon(cur), i)), true) : grid([cur], true, true)}
  </div>);
}
