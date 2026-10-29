'use client';
import { useActionState } from 'react';
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
export default function Invites({ job, walls, contacts, invited }: { job: number; walls: W[]; contacts: C[]; invited: Inv[] }) {
  const [st, act, pending] = useActionState(inviteToWalls, undefined);
  if (walls.length === 0) return null;
  return (<div className="card"><b>Invite people to these plans</b>
    <form action={act} className="stack" style={{ margin: '6px 0' }}><input type="hidden" name="job" value={job} />
      <div className="mut">Tick the walls they should open:</div><WallTicks walls={walls} on={new Set()} />
      <select name="contact" defaultValue=""><option value="">Choose a contact…</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}</select>
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
