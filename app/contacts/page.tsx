import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { deleteContact, updateContact, addContact, assignContact, unassignContact } from '@/lib/contactActions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
import ImportContacts from './ImportContacts';
export const dynamic = 'force-dynamic';

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0; const { q } = await searchParams;
  const like = `%${(q ?? '').trim()}%`;
  const contacts = await rows('select * from contacts where tenant_id=$1 and (name ilike $2 or email ilike $2 or company ilike $2) order by name', [t, like]);
  const prods = await rows('select p.id, p.name, b.name bname from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by b.id, p.id', [t]);
  const pc = await rows('select pc.contact_id, pc.production_id from production_contacts pc join contacts c on c.id=pc.contact_id where c.tenant_id=$1', [t]);
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Contacts</h1>
      <div className="row" style={{ gap: 8 }}><ImportContacts /><AddDialog inline action={addContact} label="Add Contact" title="New contact" placeholder="Name">
        <input name="email" type="email" placeholder="Email" required /><input name="company" placeholder="Company (optional)" />
        <select name="production"><option value="">Assign to Production…</option>{prods.map((p: any) => <option key={p.id} value={p.id}>{p.bname} / {p.name}</option>)}</select></AddDialog></div></div>
    <p className="mut">Your tenant's contact list. Assign a contact to the Productions they work on, then share walls with them from Productions.</p>
    <form className="row"><input name="q" placeholder="Search contacts" defaultValue={q} /><button className="sec">Search</button></form>
    {contacts.length === 0 && <p className="mut">No contacts yet.</p>}
    {contacts.map((c: any) => { const mine = pc.filter((x: any) => x.contact_id === c.id).map((x: any) => x.production_id); const free = prods.filter((p: any) => !mine.includes(p.id));
      return (<div key={c.id} className="card tile"><div style={{ flex: 1, paddingRight: 34 }}><b>{c.name}</b> <span className="mut">{c.email}{c.company ? ` · ${c.company}` : ''}</span>
        <div>{mine.length === 0 && <span className="mut">Not assigned to any Production.</span>}
          {mine.map((pid: number) => { const p = prods.find((x: any) => x.id === pid); return p && (<form key={pid} action={unassignContact} style={{ display: 'inline' }}><input type="hidden" name="contact" value={c.id} /><input type="hidden" name="production" value={pid} />
            <span className="tag">{p.bname} / {p.name} <button title="Remove from this Production" style={{ background: 'none', color: 'inherit', border: 0, padding: 0, minHeight: 0 }}>×</button></span></form>); })}</div>
        {free.length > 0 && <form action={assignContact} className="row"><input type="hidden" name="contact" value={c.id} /><select name="production">{free.map((p: any) => <option key={p.id} value={p.id}>{p.bname} / {p.name}</option>)}</select><button className="sec">Assign to Production</button></form>}</div>
        <Menu><b>Edit contact</b><form action={updateContact} className="stack"><input type="hidden" name="id" value={c.id} /><input name="name" defaultValue={c.name} required /><input name="email" type="email" defaultValue={c.email} required /><input name="company" defaultValue={c.company} placeholder="Company (optional)" /><button className="sec">Save</button></form>
          <form action={deleteContact} className="del-row"><input type="hidden" name="id" value={c.id} /><span className="mut">Delete this contact? Walls already shared with them stay shared until switched off.</span><button className="del">Yes, delete</button></form></Menu></div>); })}</>);
}
