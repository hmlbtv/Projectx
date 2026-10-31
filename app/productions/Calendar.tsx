'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export type Ev = { id: number; title: string; prod: string; bc: number; bcName: string; start: string; end: string };
const COLORS = ['#4285f4', '#ea4335', '#34a853', '#fa7b17', '#a142f4', '#00acc1', '#e91e63', '#7cb342', '#795548', '#5c6bc0'];
const DAY = 86400000, key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mon = (d: Date) => add(d, -((d.getDay() + 6) % 7)); // weeks start on Monday
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A Google-Calendar style view of every Job by date, coloured by Broadcaster.
export default function Calendar({ events }: { events: Ev[] }) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('month'), [cur, setCur] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }), [hide, setHide] = useState<number[]>([]);
  const bcs = useMemo(() => Array.from(new Map(events.map(e => [e.bc, e.bcName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [events]);
  const col = (bc: number) => COLORS[bcs.findIndex(b => b[0] === bc) % COLORS.length];
  const vis = events.filter(e => !hide.includes(e.bc));
  const on = (d: Date) => vis.filter(e => key(d) >= e.start && key(d) <= e.end);
  const today = key(new Date());
  const step = (n: number) => setCur(view === 'month' ? new Date(cur.getFullYear(), cur.getMonth() + n, 1) : add(cur, n * (view === 'week' ? 7 : 1)));
  const title = view === 'month' ? `${MN[cur.getMonth()]} ${cur.getFullYear()}` : view === 'day' ? cur.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : (() => { const a = mon(cur), b = add(a, 6); return `${a.getDate()} ${MN[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MN[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`; })();
  const chip = (e: Ev, d: Date, full = false) => { const first = key(d) === e.start || d.getDay() === 1; return (<Link key={e.id} href={`/productions?j=${e.id}`} title={`${e.bcName} › ${e.prod} › ${e.title}`} style={{ display: 'block', background: col(e.bc), color: '#fff', borderRadius: 4, padding: full ? '4px 8px' : '1px 6px', fontSize: full ? '.9rem' : '.75rem', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: full ? 'normal' : 'nowrap', textDecoration: 'none', marginBottom: 2 }}>{first || full ? <b>{e.title}</b> : ' '}{full && <div style={{ opacity: .9, fontSize: '.8rem' }}>{e.bcName} › {e.prod}</div>}</Link>); };
  const grid = (days: Date[], tall: boolean, full = false) => (<div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length === 1 ? 1 : 7}, minmax(0, 1fr))`, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
    {days.length > 1 && DN.map(n => <div key={n} className="mut" style={{ padding: '6px 4px', textAlign: 'center', fontSize: '.75rem', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>{n}</div>)}
    {days.map((d, i) => { const k = key(d), t = k === today, out = view === 'month' && d.getMonth() !== cur.getMonth(); return (<div key={k + i} style={{ minHeight: tall ? (full ? 240 : 110) : 80, padding: 4, borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: out ? 'rgba(128,128,128,.07)' : undefined, minWidth: 0 }}>
      <button type="button" onClick={() => { setCur(d); setView('day'); }} style={{ all: 'unset', cursor: 'pointer', display: 'inline-grid', placeItems: 'center', minWidth: 24, height: 24, borderRadius: 12, fontSize: '.8rem', fontWeight: t ? 700 : 400, background: t ? '#e5352b' : undefined, color: t ? '#fff' : out ? 'var(--mut, #888)' : undefined, marginBottom: 2 }}>{view === 'week' ? `${d.getDate()}` : d.getDate() === 1 && view === 'month' ? `${d.getDate()} ${MN[d.getMonth()].slice(0, 3)}` : d.getDate()}</button>
      {on(d).map(e => chip(e, d, full))}</div>); })}</div>);
  const month = () => { const a = mon(new Date(cur.getFullYear(), cur.getMonth(), 1)), end = add(mon(new Date(cur.getFullYear(), cur.getMonth() + 1, 0)), 6), n = Math.round((end.getTime() - a.getTime()) / DAY) + 1; return Array.from({ length: n }, (_, i) => add(a, i)); };
  return (<div style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="sec small" onClick={() => setCur(new Date())}>Today</button>
      <button type="button" className="sec small" aria-label="Previous" onClick={() => step(-1)}>‹</button><button type="button" className="sec small" aria-label="Next" onClick={() => step(1)}>›</button>
      <b style={{ fontSize: '1.15rem', flex: 1, minWidth: 140 }}>{title}</b>
      <div style={{ display: 'flex', gap: 0 }}>{(['day', 'week', 'month'] as const).map(v => <button key={v} type="button" className={view === v ? 'small' : 'sec small'} onClick={() => setView(v)} style={{ textTransform: 'capitalize', borderRadius: v === 'day' ? '8px 0 0 8px' : v === 'month' ? '0 8px 8px 0' : 0 }}>{v}</button>)}</div></div>
    {bcs.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{bcs.map(([id, name]) => { const off = hide.includes(id); return (<button key={id} type="button" className="sec small" aria-pressed={!off} onClick={() => setHide(off ? hide.filter(x => x !== id) : [...hide, id])} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: off ? .5 : 1 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: col(id), display: 'inline-block' }} />{name}</button>); })}</div>}
    {events.length === 0 && <p className="mut">No Jobs with dates yet. Add a Job date to a Job and it appears here.</p>}
    {view === 'month' ? grid(month(), true) : view === 'week' ? grid(Array.from({ length: 7 }, (_, i) => add(mon(cur), i)), true, true) : grid([cur], true, true)}
  </div>);
}
