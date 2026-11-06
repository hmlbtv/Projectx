import { redirect } from 'next/navigation';
import Link from 'next/link';
import AutoSelect from './AutoSelect';
import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { emailOn } from '@/lib/mail';
import { LIMIT_DEFS, UNLIMITED, dayStr, getLimits, graceDays, limitText, money, subscriptionReport } from '@/lib/subscriptions';
import { savePlan, deletePlan, setTenantSubscription, extendSubscription, renewSubscription, cancelSubscription, endSubscriptionNow, saveTenantOverrides, saveGraceDays, runSweepNow } from '@/lib/subscriptionActions';
import { runSweep } from '@/lib/subscriptions';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { active: 'Active', grace: 'Grace period', expired: 'Ended (back on Demo)', cancelled: 'Cancelled' };
const KIND: Record<string, string> = { subscribed: 'Subscribed', renewed: 'Renewed', changed: 'Changed plan', extended: 'Extended', downgraded: 'Back to Demo', grace_started: 'Grace period started', cancel_requested: 'Cancel at period end',
  cancel_withdrawn: 'Cancel withdrawn', signed_up: 'Signed up (Demo)', reminder_7: 'Reminder sent (7 days)', reminder_1: 'Reminder sent (1 day)', limits_overridden: 'Limits overridden', plan_created: 'Plan created', plan_edited: 'Plan edited', plan_deleted: 'Plan deleted' };

export default async function Subscriptions({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; err?: string }> }) {
  const { q: q0, f: ff, err } = await searchParams; const q = (q0 ?? '').trim().slice(0, 80).replace(/[%_\\]/g, ''); const f = ['active', 'grace', 'expired', 'demo', 'cancelling'].includes(ff ?? '') ? ff! : '';
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  await runSweep().catch(() => undefined); // keep grace periods, endings and reminders up to date whenever the admin looks
  const rep = await subscriptionReport(); const gd = await graceDays();
  const plans = await rows<any>('select p.*, (select count(*)::int from tenants t where t.plan=p.key) used from plans p order by sort, key');
  const ts = await rows<any>(`select t.id, t.name, t.plan, t.status tstatus, t.created_at, t.plan_since, t.limit_overrides ov, p.name pname,
      s.status, s.period, s.price, s.currency, s.started_at, s.current_period_end pe, s.grace_until gu, s.cancel_at_period_end cancel, s.notes,
      (select min(u.email) from users u where u.tenant_id=t.id and u.role='master_admin') owner,
      (select max(e.started_at) from login_events e where e.tenant_id=t.id) last_login,
      (select count(*)::int from login_events e where e.tenant_id=t.id and e.started_at > now()-interval '30 days') logins30,
      (select count(*)::int from wall_templates w where w.tenant_id=t.id) walls,
      (select count(*)::int from broadcasters b where b.tenant_id=t.id) bcs,
      (select coalesce(max(c),0)::int from (select count(*) c from productions pr join broadcasters b on b.id=pr.broadcaster_id where b.tenant_id=t.id group by b.id) x) prods,
      (select coalesce(max(c),0)::int from (select count(*) c from jobs j join productions pr on pr.id=j.production_id join broadcasters b on b.id=pr.broadcaster_id where b.tenant_id=t.id and (j.expires_at is null or j.expires_at >= current_date) group by pr.id) x) jobs
    from tenants t join plans p on p.key=t.plan left join subscriptions s on s.tenant_id=t.id
    where t.id<>1 and ($1='' or t.name ilike '%'||$1||'%' or exists(select 1 from users u where u.tenant_id=t.id and (u.email ilike '%'||$1||'%' or u.name ilike '%'||$1||'%')))
      and ($2='' or ($2='demo' and t.plan='demo') or ($2='cancelling' and s.cancel_at_period_end) or ($2 in ('active','grace','expired') and s.status=$2))
    order by (t.plan='demo'), s.current_period_end nulls last, t.id desc limit 300`, [q, f]);
  const events = await rows<any>(`select e.*, t.name tname from subscription_events e left join tenants t on t.id=e.tenant_id where e.kind not like 'reminder%' order by e.at desc limit 100`);
  const ago = (d: any) => { if (!d) return 'never'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
  const left = (d: any) => { if (!d) return ''; const n = Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000); return n < 0 ? `${-n} d ago` : n === 0 ? 'today' : `in ${n} d`; };
  const Stat = ({ k, v }: { k: string; v: any }) => (<div className="stat"><b>{v}</b><span>{k}</span></div>);
  const cur = plans.find(p => p.key !== 'demo' && p.key !== 'owner')?.currency ?? 'GBP';
  const live = plans.filter(p => p.active);

  const PlanForm = ({ p }: { p?: any }) => { const sys = p && (p.key === 'demo' || p.key === 'owner'); return (
    <form action={savePlan} className="stack" style={{ borderTop: p ? undefined : '1px solid var(--line)', padding: p ? 0 : '8px 0' }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="mut">Name<input name="name" defaultValue={p?.name ?? ''} required maxLength={60} style={{ width: 160 }} /></label>
        <label className="mut">Key<input name="key" defaultValue={p?.key ?? ''} readOnly={!!p} placeholder="auto" maxLength={40} style={{ width: 120, opacity: p ? .6 : 1 }} /></label>
        {!sys && <><label className="mut">Per month<input name="price_month" inputMode="decimal" defaultValue={p ? (p.price_month / 100).toFixed(2) : '0.00'} style={{ width: 90 }} /></label>
          <label className="mut">Per year<input name="price_year" inputMode="decimal" defaultValue={p ? (p.price_year / 100).toFixed(2) : '0.00'} style={{ width: 90 }} /></label></>}
        <label className="mut">Currency<input name="currency" defaultValue={p?.currency ?? cur} maxLength={3} style={{ width: 60 }} /></label>
        <label className="mut">Order<input name="sort" type="number" defaultValue={p?.sort ?? 100} style={{ width: 70 }} /></label>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {LIMIT_DEFS.map(d => { const v = Number(p?.limits?.[d.key] ?? d.def); return (<label key={d.key} className="mut">{d.label} <span style={{ opacity: .7 }}>({d.per})</span>
          <span className="row" style={{ gap: 4, margin: 0 }}><input name={'lim_' + d.key} type="number" min={0} defaultValue={v >= UNLIMITED ? '' : v} placeholder={v >= UNLIMITED ? 'unlimited' : ''} style={{ width: 90 }} /><label style={{ fontWeight: 400, display: 'flex', gap: 3, alignItems: 'center' }}><input type="checkbox" name={'unl_' + d.key} defaultChecked={v >= UNLIMITED} />unlimited</label></span></label>); })}
      </div>
      <label className="mut">Description (shown to the workspace)<input name="description" defaultValue={p?.description ?? ''} maxLength={300} style={{ width: '100%' }} /></label>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {!sys && <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" name="active" defaultChecked={p ? p.active : true} />On offer (can be given to workspaces)</label>}
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" name="public" defaultChecked={p ? p.public : true} />Shown to workspaces</label>
        <button className="small">{p ? 'Save plan' : 'Add plan'}</button>
        {p && !sys && p.used === 0 && <button formAction={deletePlan} className="del small" data-noconfirm="">Delete plan</button>}
        {p && <span className="mut">{p.used} workspace{p.used === 1 ? '' : 's'} on it</span>}
      </div></form>); };

  return (<><div className="crumbs"><Link href="/webappdev" className="btn sec small">← Site admin</Link></div>
    <h1>Site admin · Subscriptions</h1>
    <p className="mut">Plans (tiers), who is on which one and until when. No payment provider is connected: you record subscriptions here, and the limits, reminder emails and the fall back to Demo all follow from what you record.</p>
    {err && <p role="alert" className="err" style={{ color: 'var(--bad)' }}>{err}</p>}
    {!emailOn() && <p className="mut">Email is not set up, so subscription emails are not being sent (see Site admin).</p>}

    <div className="stats" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', margin: '8px 0' }}>
      <Stat k="Paying workspaces" v={rep.live} /><Stat k="Monthly revenue (MRR)" v={money(rep.mrr, cur)} /><Stat k="Yearly (ARR)" v={money(rep.arr, cur)} />
      <Stat k="Ending in 7 days" v={rep.soon7} /><Stat k="Ending in 30 days" v={rep.soon30} /><Stat k="In grace period" v={rep.grace} /><Stat k="Won't renew" v={rep.cancelling} />
      <Stat k="Back on Demo (ended)" v={rep.expired} /><Stat k="Subscribed, last 30 days" v={rep.subscribed30} /><Stat k="Went back to Demo, last 30 days" v={rep.churn30} />
      <Stat k="New sign-ups, 7 days" v={rep.signups7} /><Stat k="New sign-ups, 30 days" v={rep.signups30} /></div>
    <p className="row" style={{ gap: 8, margin: '6px 0 14px' }}><a className="btn sec small" href="/webappdev/subscriptions/export">Download workspaces (CSV)</a><a className="btn sec small" href="/webappdev/subscriptions/export?events=1">Download history (CSV)</a></p>

    <details className="card acc" open><summary><b>Plans</b> <span className="mut">tiers, prices and what each one allows. Change a number and it applies to every workspace on that plan straight away.</span></summary>
      <div style={{ display: 'grid', gap: 12 }}>{plans.map(p => (<details key={p.key} className="card acc" style={{ margin: 0 }}><summary><div className="row" style={{ margin: 0, gap: 8, display: 'inline-flex' }}><b>{p.name}</b><span className="tag">{p.key}</span>{p.free && <span className="tag">free</span>}{!p.active && <span className="tag">draft / off</span>}
          {p.key !== 'demo' && p.key !== 'owner' && <span className="mut">{money(p.price_month, p.currency)} / month · {money(p.price_year, p.currency)} / year</span>}<span className="mut">· {p.used} workspace{p.used === 1 ? '' : 's'}</span></div></summary><PlanForm p={p} /></details>))}</div>
      <details className="sub"><summary><b>+ Add a plan</b></summary><PlanForm /></details>
      <p className="mut" style={{ marginTop: 8 }}>To add a new kind of limit (for example Sites or team size), it is added once in the code and then appears here on every plan.</p></details>

    <details className="card acc"><summary><b>Settings and daily check</b> <span className="mut">grace period before a workspace goes back to Demo</span></summary>
      <form action={saveGraceDays} className="row" style={{ gap: 8, alignItems: 'flex-end' }}><label className="mut">Grace period (days)<input name="days" type="number" min={0} max={90} defaultValue={gd} style={{ width: 90 }} /></label><button className="small">Save</button></form>
      <p className="mut">After a subscription ends, everything keeps working for this many days, then the workspace goes back to the Demo plan. Nothing they made is ever deleted. Reminder emails go out 7 days and 1 day before the end. This check runs every time you open this page and once a day on its own.</p>
      <form action={runSweepNow}><button className="sec small">Run the check now</button></form></details>

    <h2 style={{ margin: '18px 0 6px' }}>Workspaces</h2>
    <form method="get" className="searchbar"><input name="q" defaultValue={q} placeholder="Search workspaces, users or emails" aria-label="Search" />
      <AutoSelect name="f" value={f} label="Show" options={[['', 'All'], ['active', 'Subscribed'], ['grace', 'In grace period'], ['cancelling', 'Not renewing'], ['expired', 'Ended (back on Demo)'], ['demo', 'On Demo']]} /><button className="sec">Filter</button>{(q || f) && <Link href="/webappdev/subscriptions" className="btn small">Clear filters</Link>}</form>
    {ts.length === 0 ? <p className="mut">No workspaces match.</p> : ts.map(t => { const st = t.status ?? (t.plan === 'demo' ? 'demo' : 'active'); const lim = Object.fromEntries(LIMIT_DEFS.map(d => [d.key, Number(t.ov?.[d.key] ?? plans.find(p => p.key === t.plan)?.limits?.[d.key] ?? d.def)]));
      return (<details key={t.id} className="card acc" style={{ margin: '6px 0' }}><summary><b>{t.name}</b> <span className="tag">{t.pname}</span>{st === 'grace' && <span className="tag" style={{ color: 'var(--bad)' }}>grace period</span>}{t.cancel && <span className="tag">won&apos;t renew</span>}
          <span className="mut">{t.owner ?? 'no owner'}{t.pe ? ` · ends ${dayStr(t.pe)} (${left(t.pe)})` : ''}{t.price ? ` · ${money(t.price, t.currency)} ${t.period === 'yearly' ? '/ year' : t.period === 'monthly' ? '/ month' : ''}` : ''} · signed up {dayStr(t.created_at)} · last sign-in {ago(t.last_login)}</span></summary>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
          <Stat k="Status" v={STATUS[t.status] ?? (t.plan === 'demo' ? 'Demo' : 'Active')} /><Stat k="Subscribed since" v={t.started_at ? dayStr(t.started_at) : '-'} /><Stat k="Paid until" v={t.pe ? dayStr(t.pe) : t.status ? 'no end date' : '-'} />
          <Stat k="Sign-ins, 30 days" v={t.logins30} /><Stat k="Wall Templates" v={`${t.walls} / ${limitText(lim.wall_templates)}`} /><Stat k="Broadcasters" v={`${t.bcs} / ${limitText(lim.broadcasters)}`} /><Stat k="Productions (most in one)" v={`${t.prods} / ${limitText(lim.productions)}`} /><Stat k="Active Jobs (most in one)" v={`${t.jobs} / ${limitText(lim.jobs_per_production)}`} /></div>
        {t.notes && <p className="mut">Note: {t.notes}</p>}
        <form action={setTenantSubscription} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}><input type="hidden" name="tenant" value={t.id} />
          <label className="mut">Plan<select name="plan" defaultValue={t.plan}>{live.concat(plans.filter(p => !p.active && p.key === t.plan)).filter((p, i, a) => a.findIndex(x => x.key === p.key) === i && p.key !== 'owner').map(p => <option key={p.key} value={p.key}>{p.name}{p.key === 'demo' ? ' (ends subscription)' : ''}</option>)}</select></label>
          <label className="mut">Billing<select name="period" defaultValue={t.period ?? 'monthly'}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="manual">Manual / invoice</option></select></label>
          <label className="mut">Price override ({t.currency ?? cur})<input name="price" inputMode="decimal" placeholder="plan price" style={{ width: 110 }} /></label>
          <label className="mut">Paid until<input name="end" type="date" defaultValue={t.pe ? dayStr(t.pe) : ''} /></label>
          <label className="mut">Note<input name="notes" defaultValue={t.notes ?? ''} maxLength={500} style={{ width: 200 }} /></label><button className="small">Set subscription</button></form>
        <p className="mut" style={{ margin: '4px 0' }}>Leave &quot;Paid until&quot; empty to run a month or a year from today (or no end date for manual billing). Setting the same plan again renews it.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {t.status && t.status !== 'expired' && <><form action={renewSubscription}><input type="hidden" name="tenant" value={t.id} /><button className="sec small">Renew one period</button></form>
            <form action={extendSubscription} className="row" style={{ gap: 4, margin: 0 }}><input type="hidden" name="tenant" value={t.id} /><input name="days" type="number" min={1} defaultValue={30} style={{ width: 70 }} aria-label="Days to add" /><button className="sec small">Add days</button></form>
            <form action={cancelSubscription}><input type="hidden" name="tenant" value={t.id} />{t.cancel ? <><input type="hidden" name="undo" value="1" /><button className="sec small">Keep renewing</button></> : <button className="sec small">Don&apos;t renew</button>}</form>
            <form action={endSubscriptionNow}><input type="hidden" name="tenant" value={t.id} /><button className="del small">End now (back to Demo)</button></form></>}</div>
        <details className="sub"><summary>Custom limits for this workspace only (override the plan)</summary>
          <form action={saveTenantOverrides} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}><input type="hidden" name="tenant" value={t.id} />
            {LIMIT_DEFS.map(d => <label key={d.key} className="mut">{d.label}<input name={'ov_' + d.key} type="number" min={0} defaultValue={t.ov?.[d.key] ?? ''} placeholder={String(limitText(Number(plans.find(p => p.key === t.plan)?.limits?.[d.key] ?? d.def)))} style={{ width: 90 }} /></label>)}<button className="small">Save</button></form>
          <p className="mut">Empty means &quot;use the plan&quot;. Use this for a special deal or to keep what an older workspace already had.</p></details></details>); })}

    <h2 style={{ margin: '18px 0 6px' }}>History</h2>
    {events.length === 0 ? <p className="mut">Nothing yet.</p> : <div className="tablewrap"><table><thead><tr><th>When</th><th>Workspace</th><th>What</th><th>From</th><th>To</th><th>Amount</th><th>Detail</th></tr></thead><tbody>
      {events.map((e: any) => (<tr key={e.id}><td title={new Date(e.at).toISOString()}>{ago(e.at)}</td><td>{e.tname ?? '-'}</td><td>{KIND[e.kind] ?? e.kind}</td><td>{e.from_plan ?? ''}</td><td>{e.to_plan ?? ''}</td><td>{e.amount ? money(e.amount, cur) : ''}</td><td>{e.detail}</td></tr>))}</tbody></table></div>}
  </>);
}
