import { redirect } from 'next/navigation';
import { rows, one } from '@/lib/db';
import { requireMe, canManage, isAdmin } from '@/lib/session';
import { removeMember, setUserMaxJobs, setUserRole, resendInvite, inviteTeam } from '@/lib/actions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
export const dynamic = 'force-dynamic';
export default async function Team() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0; const adm = isAdmin(me);
  const tenant = await one('select name,plan,max_walls_per_broadcaster m from tenants where id=$1', [t]);
  const members = await rows(`select id,name,email,role,(password_hash is null) pending, max_jobs,
    (select count(*)::int from job_users ju join jobs j on j.id=ju.job_id where ju.user_id=users.id and j.expires_at >= current_date) active
    from users where tenant_id=$1 order by id`, [t]);
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Team · {tenant.name}</h1>
      <AddDialog inline noName action={inviteTeam} label="Invite" title="Invite someone to your workspace"><p className="mut" style={{ margin: 0 }}>Everyone you invite can use your Wall Templates in their Monitor Plans. Each User can be on 5 active Jobs by default; change it per person from their menu.</p>
        <input name="email" type="email" placeholder="colleague@email" required autoFocus /><select name="role"><option value="user">User</option>{adm && <option value="manager">Manager</option>}</select></AddDialog></div>
    <p className="mut">Plan <span className="tag">{tenant.plan}</span> · {tenant.m} Wall Template{tenant.m === 1 ? '' : 's'} per Broadcaster</p>
    <div className="tiles">{members.map((m: any) => { const canEdit = adm && m.role === 'user'; const canRole = adm && m.id !== me.id && ['user', 'manager', 'admin'].includes(m.role) && (me.role !== 'admin' || m.role !== 'admin'); const canRemove = adm && m.id !== me.id && m.role !== 'master_admin' && m.role !== 'webappdev';
      return (<div key={m.id} className="card tile"><div className="tilelink"><b>{m.name}</b><span className="mut">{m.email}</span>
        <span><span className="tag">{m.role}</span>{m.pending && <span className="tag">invite pending</span>}</span>
        <span className="mut">{m.role === 'user' ? `${m.active} of ${m.max_jobs} active Jobs` : 'no Job limit'}</span>
        {m.pending && <AddDialog inline noName action={resendInvite} label="Resend invite" title={`Send ${m.email} a new invite link`}><input type="hidden" name="id" value={m.id} /><p className="mut" style={{ margin: 0 }}>A new link is emailed (valid 7 days). The old link stops working.</p></AddDialog>}</div>
        {(canEdit || canRemove || canRole) && <Menu>
          {canRole && <><b>Role</b><form action={setUserRole} className="stack"><input type="hidden" name="id" value={m.id} /><select name="role" defaultValue={m.role}><option value="user">User</option><option value="manager">Manager</option>{me.role !== 'admin' && <option value="admin">Admin</option>}</select><button className="sec">Save role</button></form></>}
          {canEdit && <><b>Active Jobs limit</b><form action={setUserMaxJobs} className="stack"><input type="hidden" name="id" value={m.id} /><input name="max" type="number" min="0" defaultValue={m.max_jobs} /><button className="sec">Save</button></form></>}
          {canRemove && <form action={removeMember} className="del-row"><input type="hidden" name="id" value={m.id} /><span className="mut">Remove {m.name} from your workspace?</span><button className="del">Yes, remove</button></form>}</Menu>}</div>); })}</div></>);
}
