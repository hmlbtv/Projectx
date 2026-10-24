import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { setTenantPlan } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export default async function SiteAdmin() {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const ts = await rows(`select t.id,t.name,t.plan,t.max_walls_per_broadcaster m, t.max_broadcasters b, t.max_productions p, t.max_jobs_per_production j,
    (select count(*)::int from users u where u.tenant_id=t.id) members,
    (select count(*)::int from wall_templates w where w.tenant_id=t.id) walls,
    (select count(*)::int from contacts c where c.tenant_id=t.id) contacts,
    (select min(u.email) from users u where u.tenant_id=t.id and u.role='master_admin') owner from tenants t order by t.id desc`);
  const ms = await rows(`select t.id,t.name,t.created_at,
    (select max(e.started_at) from login_events e where e.tenant_id=t.id) last_login,
    (select max(e.last_seen_at) from login_events e where e.tenant_id=t.id) last_seen,
    (select count(*)::int from login_events e where e.tenant_id=t.id and e.started_at > now()-interval '30 days') logins30,
    (select count(distinct e.user_id)::int from login_events e where e.tenant_id=t.id and e.started_at > now()-interval '7 days') active7,
    (select count(distinct e.user_id)::int from login_events e where e.tenant_id=t.id and e.started_at > now()-interval '30 days') active30,
    (select coalesce(avg(extract(epoch from e.last_seen_at-e.started_at)),0)::int from login_events e where e.tenant_id=t.id and e.started_at > now()-interval '30 days') avg_secs,
    (select coalesce(sum(extract(epoch from e.last_seen_at-e.started_at)),0)::int from login_events e where e.tenant_id=t.id and e.started_at > now()-interval '30 days') total_secs,
    (select count(*)::int from users u where u.tenant_id=t.id) members,
    (select count(*)::int from users u where u.tenant_id=t.id and u.invite_hash is not null) pending,
    (select count(*)::int from users u where u.tenant_id=t.id and u.login_count=0 and u.invite_hash is null) never,
    (select count(*)::int from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id) prods,
    (select count(*)::int from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id) jobs,
    (select count(*)::int from monitor_plans m join jobs j on j.id=m.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id) plans,
    (select count(*)::int from wall_links l join jobs j on j.id=l.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id) links,
    (select count(*)::int from wall_links l join jobs j on j.id=l.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id
       and exists(select 1 from users g where g.role='onetime' and lower(g.email)=lower(l.email))) links_joined
    from tenants t order by last_login desc nulls last, t.id desc`);
  const g = (await rows(`select (select count(*)::int from users where role='onetime') guests,
    (select count(*)::int from users where role='onetime' and last_login_at > now()-interval '30 days') guests30`))[0];
  const ago = (d: any) => { if (!d) return 'never'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
  const dur = (s: number) => s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
  const day = (d: any) => d ? new Date(d).toISOString().slice(0, 10) : '';
  return (<><h1>Site admin · Tenants</h1><p className="mut">Set each tenant's plan name and their limits: Wall Templates per Broadcaster, Broadcasters, Productions per Broadcaster and active Jobs per Production. New sign-ups start on the demo plan: 1 Wall Template per Broadcaster, 2 Broadcasters, 3 Productions each, 4 Jobs each. Column order of the boxes: plan, walls, broadcasters, productions, jobs.</p>
    <div className="tablewrap"><table><thead><tr><th>Tenant</th><th>Owner</th><th>Members</th><th>Walls</th><th>Contacts</th><th>Plan</th><th>Walls / broadcaster</th><th>Broadcasters</th><th>Productions / broadcaster</th><th>Jobs / production</th><th></th></tr></thead><tbody>
      {ts.map((t: any) => (<tr key={t.id}><td>{t.name}</td><td>{t.owner}</td><td>{t.members}</td><td>{t.walls}</td><td>{t.contacts}</td>
        <td colSpan={5}><form action={setTenantPlan} className="row" style={{ margin: 0 }}><input type="hidden" name="id" value={t.id} />
          <input name="plan" defaultValue={t.plan} style={{ width: 100 }} title="Plan name" />
          <input name="max" type="number" min="0" defaultValue={t.m} style={{ width: 70 }} title="Wall Templates per Broadcaster" />
          <input name="b" type="number" min="0" defaultValue={t.b} style={{ width: 70 }} title="Broadcasters" />
          <input name="p" type="number" min="0" defaultValue={t.p} style={{ width: 70 }} title="Productions per Broadcaster" />
          <input name="j" type="number" min="0" defaultValue={t.j} style={{ width: 70 }} title="Active Jobs per Production" />
          <button className="sec">Save</button></form></td></tr>))}</tbody></table></div>
    <h2 style={{ marginTop: 28 }}>Tenant activity</h2>
    <p className="mut">Counts only, never contact emails. "Time logged in" runs from sign-in to the last activity seen (sessions are not counted past the last page the person opened). Last 30 days unless stated. One-Time guests (no tenant): {g.guests} accounts, {g.guests30} signed in during the last 30 days.</p>
    <div className="tablewrap"><table><thead><tr><th>Tenant</th><th>Signed up</th><th>Last login</th><th>Logins 30d</th><th>Active users 7d / 30d</th><th>Avg session</th><th>Total time</th><th>Members</th><th>Invited, not joined</th><th>Never signed in</th><th>Productions</th><th>Jobs</th><th>Monitor Plans</th><th>Guest links (joined)</th></tr></thead><tbody>
      {ms.map((m: any) => (<tr key={m.id}><td>{m.name}</td><td>{day(m.created_at)}</td><td title={m.last_login ? new Date(m.last_login).toISOString() : ''}>{ago(m.last_login)}</td><td>{m.logins30}</td><td>{m.active7} / {m.active30}</td><td>{m.logins30 ? dur(m.avg_secs) : '—'}</td><td>{m.logins30 ? dur(m.total_secs) : '—'}</td><td>{m.members}</td><td>{m.pending}</td><td>{m.never}</td><td>{m.prods}</td><td>{m.jobs}</td><td>{m.plans}</td><td>{m.links} ({m.links_joined})</td></tr>))}</tbody></table></div></>);
}
