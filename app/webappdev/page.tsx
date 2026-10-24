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
  const msById = new Map(ms.map((m: any) => [m.id, m]));
  const Stat = ({ k, v }: { k: string; v: any }) => (<div className="stat"><b>{v}</b><span>{k}</span></div>);
  return (<><h1>Site admin · Tenants</h1>
    <p className="mut">One card per tenant. Counts only, never contact emails. Time logged in runs from sign-in to the last page seen. Activity is for the last 30 days unless stated. New sign-ups start on the demo plan: 1 Wall Template per Broadcaster, 2 Broadcasters, 3 Productions each, 4 Jobs each. One-Time guests (no tenant): {g.guests} accounts, {g.guests30} signed in during the last 30 days.</p>
    {ts.map((t: any) => { const m: any = msById.get(t.id) ?? {}; return (
      <div key={t.id} className="card tenant">
        <div className="th"><div><h2 style={{ margin: 0 }}>{t.name}</h2><div className="mut">{t.owner || 'No owner'} · signed up {day(m.created_at)}</div></div>
          <div className="mut" style={{ textAlign: 'right' }}>Last login<br /><strong style={{ color: 'inherit' }} title={m.last_login ? new Date(m.last_login).toISOString() : ''}>{ago(m.last_login)}</strong></div></div>
        <div className="stats">
          <Stat k="Members" v={t.members} /><Stat k="Contacts" v={t.contacts} /><Stat k="Wall Templates" v={t.walls} /><Stat k="Productions" v={m.prods ?? 0} /><Stat k="Jobs" v={m.jobs ?? 0} /><Stat k="Monitor Plans" v={m.plans ?? 0} />
          <Stat k="Logins (30d)" v={m.logins30 ?? 0} /><Stat k="Active users 7d / 30d" v={`${m.active7 ?? 0} / ${m.active30 ?? 0}`} /><Stat k="Avg session" v={m.logins30 ? dur(m.avg_secs) : '—'} /><Stat k="Total time (30d)" v={m.logins30 ? dur(m.total_secs) : '—'} />
          <Stat k="Invited, not joined" v={m.pending ?? 0} /><Stat k="Never signed in" v={m.never ?? 0} /><Stat k="Guest links (joined)" v={`${m.links ?? 0} (${m.links_joined ?? 0})`} />
        </div>
        <form action={setTenantPlan} className="limits"><input type="hidden" name="id" value={t.id} />
          <label>Plan<input name="plan" defaultValue={t.plan} /></label>
          <label>Wall Templates per Broadcaster<input name="max" type="number" min="0" defaultValue={t.m} /></label>
          <label>Broadcasters<input name="b" type="number" min="0" defaultValue={t.b} /></label>
          <label>Productions per Broadcaster<input name="p" type="number" min="0" defaultValue={t.p} /></label>
          <label>Jobs per Production<input name="j" type="number" min="0" defaultValue={t.j} /></label>
          <button className="sec">Save limits</button></form>
      </div>); })}</>);
}
