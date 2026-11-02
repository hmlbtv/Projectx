import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows, one } from '@/lib/db';
import { requireMe, canManage, isAdmin } from '@/lib/session';
import { removeMember, setUserMaxJobs, setUserRole, setUserSuspended, resendInvite, inviteTeam } from '@/lib/actions';
import { reset2fa } from '@/lib/twofa';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
export const dynamic = 'force-dynamic';
export default async function Team() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0; const adm = isAdmin(me); const top = me.role === 'master_admin' || me.role === 'webappdev';
  const tenant_p = one('select name,plan,max_walls_per_broadcaster m from tenants where id=$1', [t]);
  // Home members, then people who work here through a membership (they show only their role here, never their other organizations).
  const members_p = rows(`select * from (
    select id,null::int mid,name,email,role,suspended,totp_enabled,(password_hash is null) pending, max_jobs,
      (select count(*)::int from job_users ju join jobs j on j.id=ju.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where ju.user_id=users.id and b.tenant_id=$1 and j.expires_at >= current_date) active, 0 ord
    from users where tenant_id=$1
    union all
    select u.id,m.id mid,u.name,u.email,m.role,m.suspended,false totp_enabled,false pending,m.max_jobs,
      (select count(*)::int from job_users ju join jobs j on j.id=ju.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where ju.user_id=u.id and b.tenant_id=$1 and j.expires_at >= current_date) active, 1 ord
    from memberships m join users u on u.id=m.user_id where m.tenant_id=$1) x order by ord, id`, [t]);
  const [tenant, members] = await Promise.all([tenant_p, members_p]);
  const founderId = members.find((x: any) => x.role === 'master_admin' && !x.mid)?.id;
  const mayManage = (m: any) => adm && m.id !== me.id && m.role !== 'webappdev' && (m.role === 'user' || m.role === 'manager' || (top && (m.role === 'admin' || (m.role === 'master_admin' && (m.mid || m.id !== founderId)))));
  return (<><div className="pagehead"><h1 style={{ margin: 0 }}>Team · {tenant.name}</h1>
      <AddDialog inline noName action={inviteTeam} label="Invite" title="Invite someone to your workspace"><p className="mut" style={{ margin: 0 }}>Everyone you invite can use your Wall Templates in their Monitor Plans. Each User can be on 5 active Jobs by default; change it per person from their menu.</p>
        <input name="email" type="email" placeholder="colleague@email" required autoFocus /><select name="role"><option value="user">User</option>{adm && <option value="manager">Manager</option>}{top && <option value="master_admin">Master Admin</option>}</select></AddDialog></div>
    {['master_admin', 'webappdev'].includes(me.role) && <p><Link href="/audit" className="btn small">Audit trail</Link></p>}
    <p className="mut">Plan <span className="tag">{tenant.plan}</span> · {tenant.m >= 100000 ? 'Unlimited' : tenant.m} Wall Template{tenant.m === 1 ? '' : 's'} per workspace</p>
    <div className="tiles">{members.map((m: any) => { const canEdit = adm && m.role === 'user'; const canRole = mayManage(m); const canSusp = canRole; const canRemove = canRole;
      return (<div key={m.mid ? 'm' + m.mid : m.id} className="card tile"><div className="tilelink"><b>{m.name}</b><span className="mut">{m.email}</span>
        <span><span className="tag">{m.role}</span>{m.pending && <span className="tag">invite pending</span>}{m.suspended && <span className="tag">suspended</span>}</span>
        <span className="mut">{m.role === 'user' ? `${m.active} of ${m.max_jobs} active Jobs` : 'no Job limit'}</span>
        {m.pending && <AddDialog inline noName action={resendInvite} label="Resend invite" title={`Send ${m.email} a new invite link`}><input type="hidden" name="id" value={m.id} />{m.mid && <input type="hidden" name="mid" value={m.mid} />}<p className="mut" style={{ margin: 0 }}>A new link is emailed (valid 7 days). The old link stops working.</p></AddDialog>}</div>
        {(canEdit || canRemove || canRole || canSusp) && <Menu>
          {canSusp && <form action={setUserSuspended} className="stack"><input type="hidden" name="id" value={m.id} />{m.mid && <input type="hidden" name="mid" value={m.mid} />}<input type="hidden" name="suspend" value={m.suspended ? '0' : '1'} /><button className="sec">{m.suspended ? 'Reactivate' : 'Suspend'} {m.name}</button></form>}
          {canSusp && m.totp_enabled && <form action={reset2fa} className="stack"><input type="hidden" name="id" value={m.id} />{m.mid && <input type="hidden" name="mid" value={m.mid} />}<button className="sec">Reset {m.name}'s 2FA</button></form>}
          {canRole && <><b>Role</b><form action={setUserRole} className="stack"><input type="hidden" name="id" value={m.id} />{m.mid && <input type="hidden" name="mid" value={m.mid} />}<select name="role" defaultValue={m.role}><option value="user">User</option><option value="manager">Manager</option>{top && <option value="admin">Admin</option>}{top && <option value="master_admin">Master Admin</option>}</select><button className="sec">Save role</button></form></>}
          {canEdit && <><b>Active Jobs limit</b><form action={setUserMaxJobs} className="stack"><input type="hidden" name="id" value={m.id} />{m.mid && <input type="hidden" name="mid" value={m.mid} />}<input name="max" type="number" min="0" defaultValue={m.max_jobs} /><button className="sec">Save</button></form></>}
          {canRemove && <form action={removeMember} className="del-row"><input type="hidden" name="id" value={m.id} />{m.mid && <input type="hidden" name="mid" value={m.mid} />}<span className="mut">Remove {m.name} from your workspace?</span><button className="del">Yes, remove</button></form>}</Menu>}</div>); })}</div></>);
}
