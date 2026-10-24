import { redirect } from 'next/navigation';
import { rows, one } from '@/lib/db';
import { requireMe, canManage, isAdmin } from '@/lib/session';
import { removeMember, setUserMaxJobs } from '@/lib/actions';
import TeamInvite from './TeamInvite';
export const dynamic = 'force-dynamic';
export default async function Team() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 1;
  const tenant = await one('select name,plan,max_wall_templates m, (select count(*)::int from wall_templates where tenant_id=$1) c from tenants where id=$1', [t]);
  const members = await rows(`select id,name,email,role,(password_hash is null) pending, max_jobs,
    (select count(*)::int from job_users ju join jobs j on j.id=ju.job_id where ju.user_id=users.id and j.expires_at >= current_date) active
    from users where tenant_id=$1 order by id`, [t]);
  return (<><h1>Team · {tenant.name}</h1>
    <div className="card"><b>Plan:</b> <span className="tag">{tenant.plan}</span> · Wall Templates used: {tenant.c} of {tenant.m}
      {tenant.c >= tenant.m && <div className="mut">You have reached your plan limit. Contact us to upgrade.</div>}</div>
    <div className="card"><b>Invite someone to your workspace</b><p className="mut" style={{ margin: '2px 0 8px' }}>Everyone you invite can use your Wall Templates in their Monitor Plans. Each User can be on 5 active Jobs by default; change it per person below.</p><TeamInvite canAddManagers={isAdmin(me)} /></div>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active Jobs / limit</th><th></th></tr></thead><tbody>
      {members.map((m: any) => (<tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td><span className="tag">{m.role}</span>{m.pending && <span className="tag">invite pending</span>}</td>
        <td>{m.role === 'user' ? (isAdmin(me) ? <form action={setUserMaxJobs} className="row" style={{ margin: 0 }}>{m.active} of <input type="hidden" name="id" value={m.id} /><input name="max" type="number" min="0" defaultValue={m.max_jobs} style={{ width: 70 }} /><button className="sec">Save</button></form> : `${m.active} of ${m.max_jobs}`) : <span className="mut">no limit</span>}</td>
        <td>{isAdmin(me) && m.id !== me.id && m.role !== 'master_admin' && m.role !== 'webappdev' && <form action={removeMember}><input type="hidden" name="id" value={m.id} /><button className="del">Remove</button></form>}</td></tr>))}</tbody></table></>);
}
