'use client';
import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';

type Item = { id: number; jobId: number; prod: string; job: string; room: string; wall: string; access: string; status: 'current' | 'archived' | 'off'; saved: number; last: string | null };
type Row = { id: number; name: string; email: string; company: string; menu: ReactNode; items: Item[] };
type Col = 'name' | 'email' | 'company';
const LABEL: Record<Col, string> = { name: 'Name', email: 'Email', company: 'Company' };
const BLANK = '(Blanks)';
const val = (r: Row, c: Col) => (r[c] || '').trim();

// Excel-style filter menu: sort, search the values, tick the ones to keep.
function Filter({ col, all, picked, onPick, onSort, sort, close }: { col: Col; all: string[]; picked: Set<string> | null; onPick: (s: Set<string> | null) => void; onSort: (d: 'asc' | 'desc' | null) => void; sort: 'asc' | 'desc' | null; close: () => void }) {
  const [q, setQ] = useState(''); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [close]);
  const shown = all.filter(v => v.toLowerCase().includes(q.trim().toLowerCase()));
  const on = (v: string) => picked === null || picked.has(v);
  const toggle = (v: string) => { const s = new Set(picked ?? all); s.has(v) ? s.delete(v) : s.add(v); onPick(s.size === all.length ? null : s); };
  return (<div ref={ref} role="dialog" aria-label={`Filter ${LABEL[col]}`} style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, minWidth: 240, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 10, boxShadow: '0 12px 30px rgba(0,0,0,.25)', display: 'grid', gap: 6, textAlign: 'left', fontWeight: 400 }}>
    <button type="button" className={sort === 'asc' ? '' : 'sec'} style={{ minHeight: 0, padding: '4px 10px' }} onClick={() => onSort(sort === 'asc' ? null : 'asc')}>Sort A to Z</button>
    <button type="button" className={sort === 'desc' ? '' : 'sec'} style={{ minHeight: 0, padding: '4px 10px' }} onClick={() => onSort(sort === 'desc' ? null : 'desc')}>Sort Z to A</button>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search values" aria-label="Search values" autoFocus />
    <div className="row" style={{ gap: 6 }}><button type="button" className="sec small" onClick={() => onPick(null)}>Select all</button><button type="button" className="sec small" onClick={() => onPick(new Set())}>Clear</button></div>
    <div style={{ maxHeight: 220, overflow: 'auto', display: 'grid', gap: 2 }}>
      {shown.map(v => (<label key={v || BLANK} style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-start', fontWeight: 400, padding: '1px 0' }}><input type="checkbox" checked={on(v)} onChange={() => toggle(v)} />{v || BLANK}</label>))}
      {shown.length === 0 && <span className="mut">No values match.</span>}</div></div>);
}

const STATUS = { current: 'Currently assigned', archived: 'Archived', off: 'Switched off' } as const;
// What one contact has been given: every wall they were invited to, whether it is live, archived with its Job, or switched off, and what they have saved.
function Detail({ r }: { r: Row }) {
  const [q, setQ] = useState(''), [f, setF] = useState<'all' | Item['status']>('all');
  const n = (k: Item['status']) => r.items.filter(i => i.status === k).length;
  const t = q.trim().toLowerCase();
  const list = r.items.filter(i => (f === 'all' || i.status === f) && (!t || `${i.prod} ${i.job} ${i.room} ${i.wall}`.toLowerCase().includes(t)));
  return (<div style={{ padding: '8px 10px 12px', display: 'grid', gap: 8 }}>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {([['all', `All (${r.items.length})`], ['current', `Currently assigned (${n('current')})`], ['archived', `Archived (${n('archived')})`], ['off', `Switched off (${n('off')})`]] as const).map(([k, l]) => (<button key={k} type="button" className={f === k ? 'small' : 'sec small'} onClick={() => setF(k)}>{l}</button>))}</div>
    <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search Production, Job, Room or wall" aria-label={`Search ${r.name}'s Monitor Plans`} />
    {r.items.length === 0 && <span className="mut">No Monitor Plans have been shared with {r.name} yet.</span>}
    {r.items.length > 0 && list.length === 0 && <span className="mut">Nothing matches.</span>}
    {list.map(i => (<div key={i.id} className="card" style={{ margin: 0, padding: '8px 12px' }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span><b>{i.wall}</b> <span className="mut">· {i.room} · {i.prod} / {i.job}</span></span>
        <span className="row" style={{ gap: 6 }}><span className="tag">{i.access === 'edit' ? 'can edit' : 'view only'}</span><span className="tag">{STATUS[i.status]}</span></span></div>
      <div className="mut" style={{ fontSize: 13 }}>{i.saved ? `${i.saved} saved plan${i.saved === 1 ? '' : 's'}, last saved ${i.last}` : 'Nothing saved yet'}{i.status === 'current' && <> · <a href={`/plans?job=${i.jobId}`}>Open this Job’s Monitor Plans</a></>}{i.status === 'archived' && <> · <a href="/archive">Archive</a></>}</div></div>))}</div>);
}

export default function ContactsTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState(''), [open, setOpen] = useState<Col | null>(null), [shown, setShown] = useState<number | null>(null);
  const [pick, setPick] = useState<Partial<Record<Col, Set<string> | null>>>({}), [sort, setSort] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' });
  const values = useMemo(() => Object.fromEntries((['name', 'email', 'company'] as Col[]).map(c => [c, Array.from(new Set(rows.map(r => val(r, c)))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))])) as Record<Col, string[]>, [rows]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = rows.filter(r => (!t || `${r.name} ${r.email} ${r.company}`.toLowerCase().includes(t)) && (['name', 'email', 'company'] as Col[]).every(c => { const p = pick[c]; return !p || p.has(val(r, c)); }));
    return f.sort((a, b) => val(a, sort.col).localeCompare(val(b, sort.col), undefined, { sensitivity: 'base', numeric: true }) * (sort.dir === 'asc' ? 1 : -1));
  }, [rows, q, pick, sort]);
  const active = (['name', 'email', 'company'] as Col[]).filter(c => pick[c]);
  const reset = () => { setQ(''); setPick({}); };
  return (<div>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0' }}><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or company" aria-label="Search contacts" style={{ flex: 1, minWidth: 220 }} />
      {(q || active.length > 0) && <button type="button" className="sec" onClick={reset}>Clear filters</button>}</div>
    <p className="mut" style={{ margin: '0 0 6px' }}>{list.length} of {rows.length} contact{rows.length === 1 ? '' : 's'}{active.length ? ` · filtered by ${active.map(c => LABEL[c]).join(', ')}` : ''}</p>
    <div className="card" style={{ padding: 0, overflow: 'visible' }}><div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
        {(['name', 'email', 'company'] as Col[]).map(c => (<th key={c} style={{ position: 'relative', textAlign: 'left', padding: '8px 10px', whiteSpace: 'nowrap' }}>
          <button type="button" onClick={() => setOpen(open === c ? null : c)} aria-haspopup="dialog" aria-expanded={open === c} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', gap: 6, alignItems: 'center', color: pick[c] ? '#e5352b' : undefined }}>
            {LABEL[c]}{sort.col === c ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''} <span aria-hidden>▾</span></button>
          {open === c && <Filter col={c} all={values[c]} picked={pick[c] ?? null} close={() => setOpen(null)} sort={sort.col === c ? sort.dir : null}
            onPick={s => setPick({ ...pick, [c]: s })} onSort={d => setSort(d ? { col: c, dir: d } : { col: 'name', dir: 'asc' })} />}</th>))}
        <th style={{ width: 50 }} /></tr></thead>
        <tbody>{list.flatMap(r => ([<tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}><td style={{ padding: '8px 10px' }}><button type="button" aria-expanded={shown === r.id} onClick={() => setShown(shown === r.id ? null : r.id)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700 }}>{shown === r.id ? '▾' : '▸'} {r.name}</button> <span className="mut" style={{ fontSize: 12 }}>{r.items.length ? `${r.items.length} plan${r.items.length === 1 ? '' : 's'}` : ''}</span></td><td style={{ padding: '8px 10px' }}>{r.email}</td><td style={{ padding: '8px 10px' }}>{r.company || <span className="mut">—</span>}</td>
          <td style={{ padding: '4px 10px', position: 'relative', textAlign: 'right' }}>{r.menu}</td></tr>, shown === r.id && <tr key={r.id + 'd'}><td colSpan={4} style={{ background: 'var(--bg, transparent)' }}><Detail r={r} /></td></tr>]))}</tbody></table></div></div>
    {list.length === 0 && <p className="mut">{rows.length === 0 ? 'No contacts yet.' : 'No contacts match these filters.'}</p>}</div>);
}
