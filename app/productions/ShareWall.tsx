'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { createWallLink } from '@/lib/guestActions';
import { assignContact } from '@/lib/contactActions';

type C = { id: number; name: string; email: string; company: string };
export default function ShareWall({ job, production, walls, assigned, others }: { job: number; production: number; walls: { id: number; label: string }[]; assigned: C[]; others: C[] }) {
  const [st, act, pending] = useActionState(createWallLink, undefined);
  const [q, setQ] = useState('');
  if (walls.length === 0) return <div className="mut">Add a Room with a Wall Template to this Job to share a wall with a guest.</div>;
  const hits = q.trim() ? others.filter(c => (c.name + ' ' + c.email + ' ' + c.company).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (<div>
    {assigned.length === 0 ? <div className="mut">No contacts are assigned to this Production yet. Search your contact list below to add one.</div> :
      <form action={act} className="row"><input type="hidden" name="job" value={job} />
        <select name="wall">{walls.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select>
        <select name="contact">{assigned.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}</select>
        <select name="access"><option value="edit">Can edit</option><option value="view">View only</option></select>
        <button className="sec" disabled={pending}>Create link</button></form>}
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    {st?.ok && <div className="mut">{st.ok}</div>}{st?.link && <input readOnly value={st.link} style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} />}
    <div className="row"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all contacts to add to this Production" />
      <Link href="/contacts" className="mut">Manage contacts</Link></div>
    {hits.map(c => (<form key={c.id} action={assignContact} className="row" style={{ margin: '2px 0' }}><input type="hidden" name="contact" value={c.id} /><input type="hidden" name="production" value={production} />
      <span>{c.name} <span className="mut">{c.email}{c.company ? ` · ${c.company}` : ''}</span></span><button className="sec" style={{ minHeight: 0, padding: '3px 12px' }}>Add to this Production</button></form>))}
    {q.trim() && hits.length === 0 && <div className="mut">No other contacts match. <Link href="/contacts">Add one in Contacts</Link>.</div>}</div>);
}
