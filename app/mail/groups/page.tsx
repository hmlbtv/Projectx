import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { deleteGroup } from '@/lib/mailLib';
import { loadInterest } from '@/lib/interestList';
import GroupEditor from '../GroupEditor';
export const dynamic = 'force-dynamic';
type SP = { edit?: string; q?: string; status?: string; cat?: string; from?: string; to?: string };
export default async function MailGroups({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const groups = await rows('select id,name,emails from mail_groups order by name');
  // Everyone the group picker can offer: registered users here, plus the registered-interest list.
  const kn = new Map<string, { email: string; name: string; src: string }>();
  for (const u of await rows('select email,name,role from users order by email limit 5000')) kn.set(String(u.email).toLowerCase(), { email: String(u.email).toLowerCase(), name: u.name, src: 'Registered ' + u.role });
  try { for (const i of (await loadInterest()).list) { const e = String(i.email).toLowerCase(), o = kn.get(e); if (o) o.src += ' + Interest'; else kn.set(e, { email: e, name: i.name, src: 'Interest' }); } } catch { /* interest list unavailable */ }
  const known = [...kn.values()].sort((a, b) => a.email.localeCompare(b.email));
  const edit = groups.find((g: any) => String(g.id) === sp.edit);
  return (<><div className="crumbs"><Link href="/mail" className="btn sec small">← Email</Link></div>
    <h1>Email · Groups</h1>
    <p className="mut">Role groups (all Users, all Admins…) and the registered-interest list are built in. Add your own groups of addresses here.</p>
    <h2>Your groups</h2>
    {groups.length === 0 && <p className="mut">No groups yet.</p>}
    {groups.map((g: any) => (<div key={g.id} className="card"><b>{g.name}</b> <span className="mut">· {String(g.emails).split('\n').filter(Boolean).length} addresses</span>
      <Link href={`/mail/groups?edit=${g.id}`} style={{ marginLeft: 8 }}>Edit</Link><form action={deleteGroup} style={{ display: 'inline', marginLeft: 8 }}><input type="hidden" name="id" value={g.id} /><button className="del" title="Delete this group?">Delete</button></form></div>))}
    <h2>{edit ? 'Edit group' : 'Add a group'}</h2>
    <GroupEditor key={edit?.id ?? 'new'} known={known} id={edit?.id} name={edit?.name} emails={edit ? String(edit.emails).split('\n').filter(Boolean) : []} /></>);
}
