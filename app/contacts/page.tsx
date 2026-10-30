import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { deleteContact, updateContact, addContact } from '@/lib/contactActions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
import ImportContacts from './ImportContacts';
import ContactsTable from './ContactsTable';
export const dynamic = 'force-dynamic';

export default async function Contacts() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const contacts = await rows('select * from contacts where tenant_id=$1 order by name', [t]);
  const links = await rows(`select lower(wl.email) email, wl.id, wl.access, wl.revoked, j.id job_id, j.name job, p.name prod, rw.name wall, r.name room, (j.expires_at < current_date) expired,
      (select count(*)::int from job_wall_plans mp where mp.job_id=wl.job_id and mp.room_wall_id=wl.room_wall_id) saved, (select to_char(max(mp.updated_at), 'YYYY-MM-DD') from job_wall_plans mp where mp.job_id=wl.job_id and mp.room_wall_id=wl.room_wall_id) last
    from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
      join room_walls rw on rw.id=wl.room_wall_id join rooms r on r.id=rw.room_id where b.tenant_id=$1 order by j.job_date desc nulls last, wl.id desc`, [t]);
  const itemsOf = (email: string) => links.filter((l: any) => l.email === String(email).toLowerCase()).map((l: any) => ({ id: l.id, jobId: l.job_id, prod: l.prod, job: l.job, room: l.room, wall: l.wall, access: l.access, status: l.revoked ? 'off' : l.expired ? 'archived' : 'current', saved: l.saved, last: l.last }));
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Contacts</h1>
      <div className="row" style={{ gap: 8 }}><ImportContacts /><AddDialog inline action={addContact} label="Add Contact" title="New contact" placeholder="Name">
        <input name="email" type="email" placeholder="Email" required /><input name="company" placeholder="Company (optional)" /></AddDialog></div></div>
    <p className="mut">Your contact list. Pick a contact when you invite someone to a Monitor Plan.</p>
    <ContactsTable rows={contacts.map((c: any) => ({ id: c.id, name: c.name, email: c.email, company: c.company ?? '', items: itemsOf(c.email) as any, menu: <Menu><b>Edit contact</b><form action={updateContact} className="stack"><input type="hidden" name="id" value={c.id} /><input name="name" defaultValue={c.name} required /><input name="email" type="email" defaultValue={c.email} required /><input name="company" defaultValue={c.company} placeholder="Company (optional)" /><button className="sec">Save</button></form>
          <form action={deleteContact} className="del-row"><input type="hidden" name="id" value={c.id} /><span className="mut">Delete this contact? Walls already shared with them stay shared until switched off.</span><button className="del">Yes, delete</button></form></Menu> }))} /></>);
}
