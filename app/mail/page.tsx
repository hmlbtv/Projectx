import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { newMail, saveGroup, deleteGroup } from '@/lib/mailLib';
export const dynamic = 'force-dynamic';
const ST: Record<string, string> = { draft: 'Draft', tested: 'Tested', signed_off: 'Signed off', sending: 'Sending', sent: 'Sent' };
export default async function Mail() {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const list = await rows('select id,subject,status,updated_at,sent_at,audience,sent_count from mail_messages order by coalesce(sent_at,updated_at) desc limit 300');
  const groups = await rows('select id,name,emails from mail_groups order by name');
  const d = (x: any) => new Date(x).toISOString().slice(0, 16).replace('T', ' ');
  return (<><h1>Email</h1>
    <p className="mut">Draft press releases, updates and other news. Test it to {'info@teleplanner.tv'}, sign it off, then send it to groups or individuals. Every email is kept here with who it went to.</p>
    <form action={newMail}><button>New email</button></form>
    <h2>Library</h2>
    {list.length === 0 && <p className="mut">No emails yet.</p>}
    {list.map((m: any) => (<Link key={m.id} href={`/mail/${m.id}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      <b>{m.subject || '(no subject)'}</b> <span className="tag">{ST[m.status] ?? m.status}</span>
      <div className="mut">{m.status === 'sent' ? `Sent ${d(m.sent_at)} to ${m.sent_count} · ${m.audience}` : `Edited ${d(m.updated_at)}`}</div></Link>))}
    <h2>Groups</h2>
    <p className="mut">Role groups (all Users, all Admins…) and the registered-interest list are built in. Add your own groups of addresses here.</p>
    {groups.map((g: any) => (<div key={g.id} className="card"><b>{g.name}</b> <span className="mut">· {String(g.emails).split('\n').filter(Boolean).length} addresses</span>
      <form action={deleteGroup} style={{ display: 'inline', marginLeft: 8 }}><input type="hidden" name="id" value={g.id} /><button className="sec">Delete</button></form></div>))}
    <form action={saveGroup} className="card" style={{ display: 'grid', gap: 8 }}><b>Add or replace a group</b>
      <label>Group name<input name="name" required maxLength={80} style={{ width: '100%' }} /></label>
      <label>Email addresses (one per line, or separated by commas)<textarea name="emails" rows={4} style={{ width: '100%' }} /></label>
      <button className="sec">Save group</button></form></>);
}
