import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, sessionLimits } from '@/lib/session';
import { setTenantPlan, setTenantStatus, deleteTenant, setUserSuspended, saveSessionSettings, importKaleidoLayouts, tidyStandardLayouts } from '@/lib/actions';
import { emailOn, mailFrom, baseUrl } from '@/lib/mail';
import TestEmail from './TestEmail';
export const dynamic = 'force-dynamic';
export default async function SiteAdmin({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; imported?: string; of?: string; tidied?: string }> }) {
  const { q: q0, s: sf, imported, of, tidied } = await searchParams; const q = (q0 ?? '').trim().slice(0, 80);
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const ts = await rows(`select t.id,t.name,t.plan,t.max_walls_per_broadcaster m, t.max_broadcasters b, t.max_productions p, t.max_jobs_per_production j, t.max_wall_defaults wd, t.status,
    (select count(*)::int from users u where u.tenant_id=t.id) members,
    (select count(*)::int from wall_templates w where w.tenant_id=t.id) walls,
    (select count(*)::int from contacts c where c.tenant_id=t.id) contacts,
    (select min(u.email) from users u where u.tenant_id=t.id and u.role='master_admin') owner from tenants t where ($1='' or t.name ilike '%'||$1||'%' or exists(select 1 from users u where u.tenant_id=t.id and (u.email ilike '%'||$1||'%' or u.name ilike '%'||$1||'%')))
    and ($2='' or t.status=$2) order by t.id desc`, [q.replace(/[%_\\]/g, ''), ['active', 'suspended', 'archived'].includes(sf ?? '') ? sf : '']);
  const found = await rows(`select u.id,u.tenant_id,u.name,u.email,u.role,u.suspended from users u where u.tenant_id is not null and ($1='' or u.email ilike '%'||$1||'%' or u.name ilike '%'||$1||'%') order by u.name limit 500`, [q.replace(/[%_\\]/g, '')]);
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
    (select count(*)::int from job_wall_plans m join jobs j on j.id=m.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id) plans,
    (select count(*)::int from wall_links l join jobs j on j.id=l.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id) links,
    (select count(*)::int from wall_links l join jobs j on j.id=l.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=t.id
       and exists(select 1 from users g where g.role='onetime' and lower(g.email)=lower(l.email))) links_joined
    from tenants t order by last_login desc nulls last, t.id desc`);
  const mails = await rows(`select l.at, l.subject, l.ok, l.error,
    case when exists(select 1 from users u where lower(u.email)=lower(l.to_email)) then l.to_email
      else left(l.to_email,1)||'***'||substring(l.to_email from '@.*$') end as who from email_log l order by l.at desc limit 50`);
  const mailCount = (await rows(`select count(*) filter (where ok)::int sent, count(*) filter (where not ok)::int failed from email_log where at > now() - interval '24 hours'`))[0];
  const g = (await rows(`select (select count(*)::int from users where role='onetime') guests,
    (select count(*)::int from users where role='onetime' and last_login_at > now()-interval '30 days') guests30`))[0];
  const ago = (d: any) => { if (!d) return 'never'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
  const dur = (s: number) => s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
  const day = (d: any) => d ? new Date(d).toISOString().slice(0, 10) : '';
  const msById = new Map(ms.map((m: any) => [m.id, m]));
  const Stat = ({ k, v }: { k: string; v: any }) => (<div className="stat"><b>{v}</b><span>{k}</span></div>);
  const mailRows: [string, string, boolean][] = [
    ['Email key (RESEND_API_KEY)', emailOn() ? 'Set' : 'Not set - no emails can be sent', emailOn()],
    ['Sender (MAIL_FROM)', process.env.MAIL_FROM ? mailFrom() : `${mailFrom()} (default test sender)`, !!process.env.MAIL_FROM],
    ['Site address in emails (APP_URL)', process.env.APP_URL ? await baseUrl() : `${await baseUrl()} (not set, using fallback)`, !!process.env.APP_URL],
  ];
  const lim = await sessionLimits();
  return (<><h1>Site admin · Tenants</h1>
    <details className="card acc" open={imported !== undefined}><summary><b>Kaleido layouts</b> <span className="mut">add the MV layouts converted from the Kaleido database</span></summary>
      {imported !== undefined && <p><b>{imported}</b> new Standard layout{imported === '1' ? '' : 's'} added{of ? ` (${of} in the file${Number(imported) < Number(of) ? ', the rest were already there' : ''})` : ''}.</p>}
      <form action={importKaleidoLayouts} className="stack"><p className="mut">47 layouts from the KMX database: even grids, one-big-plus-small, and with-timecode variants. Each monitor is placed and sized as in Kaleido and numbered left to right, top to bottom. Clock-only layouts are left out, and clocks inside layouts are not added as monitors. Safe to press again; layouts already added are skipped.</p><button className="sec">Add Kaleido layouts</button></form></details>
    <details className="card acc" open={tidied !== undefined}><summary><b>Tidy Standard layouts</b> <span className="mut">neat 16:9 versions of the Standard MV layouts</span></summary>
      {tidied !== undefined && <p><b>{tidied}</b> layout{tidied === '1' ? '' : 's'} updated.</p>}
      <form action={tidyStandardLayouts} className="stack"><p className="mut">Replaces the shapes of the Standard layouts (the built-in grids, 1 + 5 and the Kaleido ones) so every window is exactly 16:9, small windows around a big one are the same size, edges line up and the layout is centred. Tiles already on a window stay with it. Six layouts with unusual shapes (9-WAY-PGM-PRV, the 9-WAY-SMALL ones and PROD STCK MIMIC) are left as they are. Tenants' own layouts are not touched.</p><button className="sec">Tidy Standard layouts</button></form></details>
    <details className="card acc"><summary><b>Sign-in length</b> <span className="mut">{lim.idleHours ? `signed out after ${lim.idleHours} h idle` : 'no idle sign-out'} · {lim.maxDays} day maximum</span></summary>
      <form action={saveSessionSettings} className="stack"><label className="mut">Sign out after this many hours with no activity (0 = never)<input name="idle" type="number" min="0" max="720" defaultValue={lim.idleHours} /></label>
        <label className="mut">Always sign out after this many days (1 to 90)<input name="days" type="number" min="1" max="90" defaultValue={lim.maxDays} /></label>
        <button className="sec">Save</button>
        <p className="mut">Applies to everyone. Idle time resets whenever a page is used. A new maximum applies to people who sign in after you save; the idle limit applies straight away.</p></form></details>
    <details className="card acc"><summary><b>Email</b> <span className="mut">{emailOn() ? 'Resend is set up' : 'Not set up'} · send a test email</span></summary>
      <p className="mut">Verification, password reset and invitation emails are sent through Resend. Values come from this deployment's environment variables; the key itself is never shown.</p>
      <div className="stats" style={{ gridTemplateColumns: '1fr' }}>{mailRows.map(([k, v, ok]) => (<div key={k} className="stat"><b>{v}</b><span>{k} {ok ? '✓' : '⚠'}</span></div>))}</div>
      <TestEmail defaultTo={me.email} />
      <h3 style={{ margin: '16px 0 6px' }}>Email log</h3>
      <p className="mut" style={{ margin: '0 0 8px' }}>Last 24 hours: {mailCount.sent} sent, {mailCount.failed} failed. Newest 50 attempts, kept 30 days. Addresses of people without an account (such as client contacts) are partly hidden, and email content is never stored.</p>
      {mails.length === 0 ? <p className="mut">Nothing sent yet.</p> : (<div className="tablewrap"><table className="mlog"><thead><tr><th>Time</th><th>To</th><th>Email</th><th>Result</th></tr></thead><tbody>
        {mails.map((m: any, i: number) => (<tr key={i}><td title={new Date(m.at).toISOString()}>{ago(m.at)}</td><td>{m.who}</td><td>{m.subject}</td>
          <td style={{ color: m.ok ? 'inherit' : 'var(--bad)' }}>{m.ok ? 'Sent ✓' : 'Failed: ' + (m.error ?? '')}</td></tr>))}</tbody></table></div>)}</details>
    <p className="mut">Counts only, never contact emails. Time logged in runs from sign-in to the last page seen. Activity is for the last 30 days unless stated. New sign-ups start on the demo plan: 1 Wall Template per Broadcaster, 2 Broadcasters, 3 Productions each, 4 Jobs each. One-Time guests (no tenant): {g.guests} accounts, {g.guests30} signed in during the last 30 days.</p>
    <form method="get" className="searchbar"><input name="q" defaultValue={q} placeholder="Search tenants, users or emails" aria-label="Search" />
      <select name="s" defaultValue={sf ?? ''} aria-label="Status"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select>
      <button>Search</button>{(q || sf) && <a href="/webappdev"><button type="button" className="sec">Clear</button></a>}</form>
    <p className="mut">{ts.length} tenant{ts.length === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''}. Open a card for details.</p>
    {ts.length === 0 && <div className="card mut">No tenants match.</div>}
    {ts.map((t: any) => { const m: any = msById.get(t.id) ?? {}; const mine = found.filter((u: any) => u.tenant_id === t.id); const own = t.id === me.tenant_id; return (
      <details key={t.id} className={'card acc tenant st-' + t.status} open={!!q && ts.length <= 3}>
        <summary><b>{t.name}</b> {t.status !== 'active' && <span className={'badge ' + t.status}>{t.status}</span>}
          <span className="mut">{t.owner || 'No owner'} · {t.members} member{t.members === 1 ? '' : 's'} · last login {ago(m.last_login)}</span></summary>
        <div className="mut" style={{ margin: '4px 0 12px' }}>Signed up {day(m.created_at)}</div>
        {mine.length > 0 && <div className="matches"><b>{q ? 'Matching users' : 'Users'}</b>{mine.map((u: any) => <div key={u.email} className="urow"><span className="mut">{u.name} · {u.email} · {u.role}{u.suspended ? ' · suspended' : ''}</span>
          {u.id !== me.id && u.role !== 'webappdev' && <form action={setUserSuspended}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="suspend" value={u.suspended ? '0' : '1'} /><button className="sec small">{u.suspended ? 'Reactivate' : 'Suspend'}</button></form>}</div>)}</div>}
        <div className="stats">
          <Stat k="Members" v={t.members} /><Stat k="Contacts" v={t.contacts} /><Stat k="Wall Templates" v={t.walls} /><Stat k="Productions" v={m.prods ?? 0} /><Stat k="Jobs" v={m.jobs ?? 0} /><Stat k="Monitor Plans" v={m.plans ?? 0} />
          <Stat k="Logins (30d)" v={m.logins30 ?? 0} /><Stat k="Active users 7d / 30d" v={`${m.active7 ?? 0} / ${m.active30 ?? 0}`} /><Stat k="Avg session" v={m.logins30 ? dur(m.avg_secs) : '—'} /><Stat k="Total time (30d)" v={m.logins30 ? dur(m.total_secs) : '—'} />
          <Stat k="Invited, not joined" v={m.pending ?? 0} /><Stat k="Never signed in" v={m.never ?? 0} /><Stat k="Guest links (joined)" v={`${m.links ?? 0} (${m.links_joined ?? 0})`} />
        </div>
        <form action={setTenantPlan} className="limits"><input type="hidden" name="id" value={t.id} />
          <label>Plan<input name="plan" defaultValue={t.plan} /></label>
          <label>Wall Templates per workspace<input name="max" type="number" min="0" defaultValue={t.m} /></label>
          <label>Broadcasters<input name="b" type="number" min="0" defaultValue={t.b} /></label>
          <label>Productions per Broadcaster<input name="p" type="number" min="0" defaultValue={t.p} /></label>
          <label>Jobs per Production<input name="j" type="number" min="0" defaultValue={t.j} /></label>
          <label>Default configurations per Wall Template<input name="wd" type="number" min="0" defaultValue={t.wd} /></label>
          <button className="sec">Save limits</button></form>
        {own ? <p className="mut">This is your own workspace, so it cannot be suspended, archived or deleted.</p> : (
        <div className="acts">
          {t.status !== 'suspended' && <form action={setTenantStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="suspended" /><button className="sec" title="Members are signed out and see a suspended page">Suspend</button></form>}
          {t.status !== 'archived' && <form action={setTenantStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="archived" /><button className="sec" title="Same as suspend, kept for finished accounts">Archive</button></form>}
          {t.status !== 'active' && <form action={setTenantStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="active" /><button>Reactivate</button></form>}
          <form action={deleteTenant} className="delete"><input type="hidden" name="id" value={t.id} />
            <input name="confirm" placeholder={`Type “${t.name}” to delete`} autoComplete="off" aria-label="Type the tenant name to confirm deletion" />
            <button className="danger">Delete forever</button></form>
        </div>)}
      </details>); })}</>);
}
