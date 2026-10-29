'use client';
import { useActionState, useState } from 'react';
import { inviteToWalls, updateInvite, removeInvite } from '@/lib/guestActions';

type W = { id: number; room: string; name: string };
type C = { id: number; name: string; email: string; company: string };
type Inv = { email: string; access: string; walls: number[] };

function WallTicks({ walls, on }: { walls: W[]; on: Set<number> }) {
  const rooms = Array.from(new Set(walls.map(w => w.room)));
  return (<div style={{ display: 'grid', gap: 4 }}>{rooms.map(r => (<div key={r}><div className="mut" style={{ fontSize: '.8rem' }}>{r}</div>
    {walls.filter(w => w.room === r).map(w => (<label key={w.id} style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', fontWeight: 400 }}><input type="checkbox" name="wall" value={w.id} defaultChecked={on.has(w.id)} />{w.name}</label>))}</div>))}</div>);
}
function EditInvite({ job, inv, walls }: { job: number; inv: Inv; walls: W[] }) {
  const [st, act, pending] = useActionState(updateInvite, undefined);
  return (<form action={act} className="stack" style={{ margin: '6px 0' }}><input type="hidden" name="job" value={job} /><input type="hidden" name="email" value={inv.email} />
    <WallTicks walls={walls} on={new Set(inv.walls)} />
    <select name="access" defaultValue={inv.access}><option value="edit">Can edit</option><option value="view">View only</option></select>
    <button className="sec" disabled={pending}>Save changes</button>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.ok && <div className="mut">{st.ok}</div>}</form>);
}
function ContactPick({ contacts }: { contacts: C[] }) {
  const [q, setQ] = useState(''), [sel, setSel] = useState<C | null>(null), [open, setOpen] = useState(false);
  const k = q.trim().toLowerCase();
  const list = (k ? contacts.filter(c => `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(k)) : contacts).slice(0, 50);
  return (<div style={{ position: 'relative' }}><input type="hidden" name="contact" value={sel?.id ?? ''} />
    {sel ? (<div className="row" style={{ gap: 8 }}><span className="tag">{sel.name} ({sel.email})</span><button type="button" className="sec small" onClick={() => { setSel(null); setQ(''); }}>Change</button></div>)
      : (<><input type="search" placeholder="Search contacts by name, email or company…" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoComplete="off" />
        {open && (<div className="card" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, maxHeight: 240, overflowY: 'auto', padding: 4 }}>
          {list.length === 0 ? <div className="mut" style={{ padding: 6 }}>No matching contacts</div> : list.map(c => (
            <button type="button" key={c.id} className="sec" style={{ display: 'block', width: '100%', textAlign: 'left', margin: '2px 0' }} onClick={() => { setSel(c); setOpen(false); }}>
              <b>{c.name}</b> <span className="mut">{c.email}{c.company ? ` · ${c.company}` : ''}</span></button>))}</div>)}</>)}</div>);
}
export default function Invites({ job, walls, contacts, invited }: { job: number; walls: W[]; contacts: C[]; invited: Inv[] }) {
  const [st, act, pending] = useActionState(inviteToWalls, undefined);
  if (walls.length === 0) return null;
  return (<div className="card"><b>Invite people to these plans</b>
    <form action={act} className="stack" style={{ margin: '6px 0' }}><input type="hidden" name="job" value={job} />
      <div className="mut">Tick the walls they should open:</div><WallTicks walls={walls} on={new Set()} />
      <ContactPick contacts={contacts} />
      <input name="email" type="email" placeholder="…or type any email address" />
      <select name="access" defaultValue="edit"><option value="edit">Can edit</option><option value="view">View only</option></select>
      <button disabled={pending}>Send invitation</button></form>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    {st?.ok && <div className="mut">{st.ok}</div>}{st?.link && <input readOnly value={st.link} style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} />}
    {invited.length > 0 && <div style={{ marginTop: 10 }}><b>People invited</b>
      {invited.map(i => (<div key={i.email} className="card" style={{ margin: '6px 0' }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><b>{i.email}</b><span className="tag">{i.access === 'edit' ? 'can edit' : 'view only'}</span>
          {i.walls.map(id => <span key={id} className="tag">{walls.find(w => w.id === id)?.name ?? 'wall'}</span>)}</div>
        <details><summary className="mut" style={{ cursor: 'pointer' }}>Edit invitation</summary><EditInvite job={job} inv={i} walls={walls} />
          <form action={removeInvite}><input type="hidden" name="job" value={job} /><input type="hidden" name="email" value={i.email} /><button className="del small">Remove this person</button></form></details></div>))}</div>}</div>);
}
