'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { saveGroup } from '@/lib/mailLib';
type K = { email: string; name: string; src: string };
const OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export default function GroupEditor({ known, id, name: n0, emails: e0 }: { known: K[]; id?: number; name?: string; emails?: string[] }) {
  const [name, setName] = useState(n0 ?? ''), [sel, setSel] = useState<Set<string>>(new Set(e0 ?? [])), [q, setQ] = useState(''), [custom, setCustom] = useState(''), [err, setErr] = useState('');
  const shown = useMemo(() => { const t = q.trim().toLowerCase(); return known.filter(k => !t || k.email.includes(t) || k.name.toLowerCase().includes(t) || k.src.toLowerCase().includes(t)); }, [known, q]);
  const page = shown.slice(0, 100);
  const setMany = (l: string[], on: boolean) => setSel(x => { const n = new Set(x); l.forEach(e => on ? n.add(e) : n.delete(e)); return n; });
  const knownSet = useMemo(() => new Set(known.map(k => k.email)), [known]);
  const addCustom = () => { const e = custom.trim().toLowerCase(); if (!OK.test(e)) { setErr('Enter a valid email address.'); return; } setErr(''); setMany([e], true); setCustom(''); };
  const extra = [...sel].filter(e => !knownSet.has(e)); // addresses not registered and not on the interest list
  return (<form action={saveGroup} className="card" style={{ display: 'grid', gap: 10 }}>
    <b>{id ? 'Edit group' : 'New group'}</b>{id && <input type="hidden" name="id" value={id} />}
    <label>Group name<input name="name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} /></label>
    <label>Find registered users and interest emails<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email, role or Interest" style={{ width: '100%' }} /></label>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" className="sec" onClick={() => setMany(shown.map(k => k.email), true)}>Select all {q ? 'matching' : ''} ({shown.length})</button>
      <button type="button" className="sec" onClick={() => setMany(shown.map(k => k.email), false)}>Deselect {q ? 'matching' : 'all shown'}</button>
      <span className="mut">{sel.size} in this group</span></div>
    <div style={{ maxHeight: 260, overflow: 'auto', display: 'grid', gap: 4, border: '1px solid var(--line, #8883)', borderRadius: 8, padding: 8 }}>
      {page.length === 0 && <span className="mut">No matches. You can add an unregistered address below.</span>}
      {page.map(k => <label key={k.email} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={sel.has(k.email)} onChange={e => setMany([k.email], e.target.checked)} /><span>{k.email} <span className="mut">· {k.name ? k.name + ' · ' : ''}{k.src}</span></span></label>)}
      {shown.length > page.length && <span className="mut">Showing the first {page.length} of {shown.length}. Search to narrow the list.</span>}</div>
    <label>Add an address that is not registered
      <span style={{ display: 'flex', gap: 8 }}><input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} placeholder="name@example.com" style={{ flex: 1 }} /><button type="button" className="sec" onClick={addCustom}>Add</button></span></label>
    {err && <div role="alert" style={{ color: 'var(--bad)' }}>{err}</div>}
    {extra.length > 0 && <div><span className="mut">Unregistered addresses in this group:</span>{extra.map(e => <div key={e} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{e}<button type="button" className="sec small" onClick={() => setMany([e], false)}>Remove</button></div>)}</div>}
    <textarea name="emails" value={[...sel].join('\n')} readOnly hidden />
    <div style={{ display: 'flex', gap: 8 }}><button>{id ? 'Save changes' : 'Save group'}</button>{id && <Link href="/mail" className="btn sec">Cancel</Link>}</div></form>);
}
