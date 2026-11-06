import { one, rows } from './db';
import { brandedMail } from './brandMail';
import { mailTemplates as T } from './mailTemplates';
import { baseUrl, emailOn } from './mail';
import { money } from './money';

// Subscriptions, tiers and limits. No payment provider is connected: the site admin records who is on which tier and until when, and everything
// else (limits, reminders, falling back to Demo) follows from that. A payment provider can later write to the same tables (see provider / provider_ref).
//
// To add a limit: add a line to LIMIT_DEFS, then call limitCheck() where the thing is created. Plans, the admin pages and the workspace's plan page
// pick it up with no other change.
export const LIMIT_DEFS = [
  { key: 'wall_templates', label: 'Wall Templates', per: 'per workspace', def: 1 },
  { key: 'broadcasters', label: 'Broadcasters', per: 'per workspace', def: 2 },
  { key: 'productions', label: 'Productions', per: 'per Broadcaster', def: 3 },
  { key: 'jobs_per_production', label: 'Jobs', per: 'per Production', def: 4 },
  { key: 'wall_defaults', label: 'Default configurations', per: 'per Wall Template', def: 5 },
  { key: 'guest_invites', label: 'Guest invitations', per: 'per Job', def: 3 },
] as const;
export type LimitKey = typeof LIMIT_DEFS[number]['key'];
export type Limits = Record<LimitKey, number>;
export const UNLIMITED = 100000; // anything at or above this is shown as "unlimited"
export const DEMO = 'demo';

export { money };
export const limitText = (n: number) => n >= UNLIMITED ? 'Unlimited' : String(n);
export const dayStr = (d: any) => d ? new Date(d).toISOString().slice(0, 10) : '';
const DAY = 86400_000;

export async function graceDays(): Promise<number> {
  const v = Number((await one("select value from settings where key='subscription_grace_days'"))?.value); return Number.isFinite(v) && v >= 0 ? Math.min(v, 90) : 5;
}

type Row = { plan: string; pname: string; ov: Partial<Limits>; limits: Partial<Limits>; status: string | null; pe: string | null; gu: string | null; cancel: boolean | null };
const LOAD = `select t.plan, p.name pname, t.limit_overrides ov, p.limits, s.status, s.current_period_end pe, s.grace_until gu, s.cancel_at_period_end cancel
  from tenants t join plans p on p.key=t.plan left join subscriptions s on s.tenant_id=t.id where t.id=$1`;
const merge = (r: Row): Limits => Object.fromEntries(LIMIT_DEFS.map(d => { const v = Number(r.ov?.[d.key] ?? r.limits?.[d.key] ?? d.def); return [d.key, Number.isFinite(v) ? v : d.def]; })) as Limits;

// What this workspace can do right now. A subscription that has run out (and its grace period) is dropped back to Demo here, so limits are right
// even if the daily check has not run yet.
export async function getLimits(tid: number): Promise<{ plan: string; name: string; limits: Limits; status: string | null; periodEnd: string | null; graceUntil: string | null }> {
  let r = await one<Row>(LOAD, [tid]);
  if (r && (r.status === 'active' || r.status === 'grace') && r.pe && dueForDemo(r)) { await expireTenant(tid, 'auto'); r = await one<Row>(LOAD, [tid]); }
  if (!r) return { plan: DEMO, name: 'Demo', limits: Object.fromEntries(LIMIT_DEFS.map(d => [d.key, d.def])) as Limits, status: null, periodEnd: null, graceUntil: null };
  return { plan: r.plan, name: r.pname, limits: merge(r), status: r.status, periodEnd: r.pe, graceUntil: r.gu };
}
function dueForDemo(r: Row) { const end = new Date(r.pe!).getTime(); if (Date.now() <= end) return false; if (r.cancel) return true; return !!r.gu && Date.now() > new Date(r.gu).getTime(); }

// The one place a limit is checked. Returns the message to show, or null when there is room. Editing what already exists is never blocked.
export async function limitCheck(tid: number, key: LimitKey, count: number): Promise<string | null> {
  const g = await getLimits(tid); const max = g.limits[key]; if (count < max) return null;
  const d = LIMIT_DEFS.find(x => x.key === key)!;
  const over = g.plan === DEMO && g.status === 'expired' ? ' Your subscription has ended, so your workspace is back on the Demo plan and everything you made is kept.' : '';
  return `Your ${g.name} plan allows ${limitText(max)} ${d.label} ${d.per}${count > max ? ` (you have ${count})` : ''}.${over} Contact us to upgrade.`;
}

// ---- View only: when a workspace has more than its plan allows (for example after dropping back to Demo), the oldest items up to the limit stay editable
// and the rest are view only. Nothing is deleted; deleting is always allowed, which is how a workspace gets back under its limit. Upgrading unlocks everything.
type LockKind = 'walls' | 'broadcasters' | 'productions' | 'jobs';
export async function lockMessage(kind: LockKind, id: number): Promise<string | null> {
  const q = (sql: string) => one<any>(sql, [id]);
  let tid: number | null = null, rank = 0, key: LimitKey = 'wall_templates', label = 'Wall Template', parent: string | null = null;
  if (kind === 'walls') { const r = await q('select tenant_id t, (select count(*)::int from wall_templates o where o.tenant_id=w.tenant_id and o.id<w.id) k from wall_templates w where id=$1'); if (!r) return null; tid = r.t; rank = r.k; }
  else if (kind === 'broadcasters') { const r = await q('select tenant_id t, (select count(*)::int from broadcasters o where o.tenant_id=b.tenant_id and o.id<b.id) k from broadcasters b where id=$1'); if (!r) return null; tid = r.t; rank = r.k; key = 'broadcasters'; label = 'Broadcaster'; }
  else if (kind === 'productions') { const r = await q('select b.tenant_id t, p.broadcaster_id bid, (select count(*)::int from productions o where o.broadcaster_id=p.broadcaster_id and o.id<p.id) k from productions p join broadcasters b on b.id=p.broadcaster_id where p.id=$1'); if (!r) return null; tid = r.t; rank = r.k; key = 'productions'; label = 'Production'; parent = await lockMessage('broadcasters', r.bid); }
  else { const r = await q('select b.tenant_id t, j.production_id pid, (j.expires_at is null or j.expires_at >= current_date) act, (select count(*)::int from jobs o where o.production_id=j.production_id and o.id<j.id and (o.expires_at is null or o.expires_at >= current_date)) k from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1'); if (!r) return null; tid = r.t; rank = r.act ? r.k : 0; key = 'jobs_per_production'; label = 'Job'; if (r.act) parent = await lockMessage('productions', r.pid); }
  const why = (n: string, plan: string) => `This ${n} is over what your ${plan} plan allows, so it is view only. You can still delete things to get back under the limit. Contact us to upgrade.`;
  if (tid == null) return null;
  const g = await getLimits(tid); if (g.plan === 'owner') return null;
  if (rank >= g.limits[key]) return why(label, g.name);
  return parent ? why(label, g.name) : null;
}

// True when the workspace holds more than its plan allows, so some of it is view only (used for the notice on the pages).
export async function overLimits(tid: number): Promise<boolean> {
  const L = (await getLimits(tid)).limits;
  const r = await one<any>(`select (select count(*)::int from wall_templates where tenant_id=$1) w, (select count(*)::int from broadcasters where tenant_id=$1) b,
    (select coalesce(max(c),0)::int from (select count(*) c from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 group by p.broadcaster_id) x) p,
    (select coalesce(max(c),0)::int from (select count(*) c from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 and (j.expires_at is null or j.expires_at >= current_date) group by j.production_id) x) j`, [tid]);
  return r.w > L.wall_templates || r.b > L.broadcasters || r.p > L.productions || r.j > L.jobs_per_production;
}

export async function logEvent(tid: number | null, kind: string, o: { from?: string | null; to?: string | null; amount?: number | null; detail?: string; by?: number | null } = {}) {
  await rows('insert into subscription_events(tenant_id,kind,from_plan,to_plan,amount,detail,by_user) values($1,$2,$3,$4,$5,$6,$7)', [tid, kind, o.from ?? null, o.to ?? null, o.amount ?? null, (o.detail ?? '').slice(0, 300), o.by ?? null]);
}

// ---- Who to tell ----
const owners = (tid: number) => rows<{ email: string; name: string }>("select email, name from users where tenant_id=$1 and role in ('master_admin','admin') and suspended=false and email_verified=true order by role desc, id", [tid]);
const siteAdmins = () => rows<{ email: string; name: string }>("select email, name from users where role='webappdev' and suspended=false and email_verified=true");
async function tell(tid: number, build: (name: string, org: string, url: string) => ReturnType<typeof T.subscriptionStarted>, toAdmins = true) {
  if (!emailOn()) return; const url = `${await baseUrl().catch(() => '')}/account`;
  const org = (await one('select name from tenants where id=$1', [tid]))?.name ?? 'your workspace';
  for (const u of await owners(tid)) { const t = build(u.name, org, url); await brandedMail(u.email, t.subject, t.text, t.b).catch(() => false); }
  if (toAdmins) for (const a of await siteAdmins()) { const t = T.adminSubscription(org, build('', org, url).subject, `${await baseUrl().catch(() => '')}/webappdev/subscriptions`); await brandedMail(a.email, t.subject, t.text, t.b).catch(() => false); }
}

// ---- Changing a subscription (the site admin, or later a payment provider) ----
export type SubInput = { plan: string; period: 'monthly' | 'yearly' | 'manual'; price?: number | null; periodEnd?: Date | null; notes?: string; by?: number | null; provider?: string | null; providerRef?: string | null };
export const addPeriod = (from: Date, period: string) => { const d = new Date(from); if (period === 'yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1); return d; };

export async function setSubscription(tid: number, i: SubInput): Promise<{ error?: string }> {
  const plan = await one<any>('select * from plans where key=$1', [i.plan]); if (!plan) return { error: 'That plan does not exist.' };
  const t = await one<any>('select plan from tenants where id=$1', [tid]); if (!t) return { error: 'Workspace not found.' };
  const prev = await one<any>('select * from subscriptions where tenant_id=$1', [tid]);
  if (plan.key === DEMO) return endSubscription(tid, i.by ?? null, 'Set back to Demo by the site admin');
  const price = i.price != null && Number.isFinite(i.price) ? Math.max(0, Math.round(i.price)) : i.period === 'yearly' ? plan.price_year : i.period === 'monthly' ? plan.price_month : 0;
  const end = i.period === 'manual' ? (i.periodEnd ?? null) : (i.periodEnd ?? addPeriod(new Date(), i.period));
  const renewal = !!prev && prev.plan_key === plan.key && (prev.status === 'active' || prev.status === 'grace');
  await rows(`insert into subscriptions(tenant_id,plan_key,status,period,price,currency,started_at,current_period_end,grace_until,cancel_at_period_end,provider,provider_ref,notes,updated_at)
    values($1,$2,'active',$3,$4,$5,now(),$6,null,false,$7,$8,$9,now())
    on conflict (tenant_id) do update set plan_key=excluded.plan_key, status='active', period=excluded.period, price=excluded.price, currency=excluded.currency,
      started_at=case when subscriptions.status in ('active','grace') and subscriptions.plan_key=excluded.plan_key then subscriptions.started_at else now() end,
      current_period_end=excluded.current_period_end, grace_until=null, cancel_at_period_end=false, provider=excluded.provider, provider_ref=excluded.provider_ref, notes=excluded.notes, updated_at=now()`,
    [tid, plan.key, i.period, price, plan.currency, end, i.provider ?? null, i.providerRef ?? null, (i.notes ?? '').slice(0, 500)]);
  await rows('update tenants set plan=$1, plan_since=case when plan=$1 then coalesce(plan_since, now()) else now() end where id=$2', [plan.key, tid]);
  const kind = renewal ? 'renewed' : t.plan === DEMO || !prev ? 'subscribed' : 'changed';
  await logEvent(tid, kind, { from: t.plan, to: plan.key, amount: price, detail: `${i.period}${end ? ' until ' + dayStr(end) : ''}${i.notes ? ' · ' + i.notes : ''}`, by: i.by });
  await tell(tid, (name, org, url) => T.subscriptionStarted(name, org, plan.name, i.period, price, plan.currency, end ? dayStr(end) : '', kind, url));
  return {};
}

export async function cancelAtPeriodEnd(tid: number, by: number | null, on = true) {
  const s = await one<any>('select plan_key from subscriptions where tenant_id=$1', [tid]); if (!s) return;
  await rows('update subscriptions set cancel_at_period_end=$2, updated_at=now() where tenant_id=$1', [tid, on]);
  await logEvent(tid, on ? 'cancel_requested' : 'cancel_withdrawn', { from: s.plan_key, by });
  if (on) { const e = (await one<any>('select current_period_end pe from subscriptions where tenant_id=$1', [tid]))?.pe; const nm = (await one<any>('select name from plans where key=$1', [s.plan_key]))?.name ?? s.plan_key;
    await tell(tid, (name, org, url) => T.subscriptionCancelled(name, org, nm, e ? dayStr(e) : '', url)); }
}

// Back to Demo. Nothing is deleted: their Wall Templates, Jobs and everything else stay, they just cannot add more than Demo allows until they subscribe again.
export async function endSubscription(tid: number, by: number | null, why: string): Promise<{ error?: string }> {
  const t = await one<any>('select plan from tenants where id=$1', [tid]); if (!t) return { error: 'Workspace not found.' };
  const had = await one<any>('select plan_key from subscriptions where tenant_id=$1', [tid]);
  if (had) await rows("update subscriptions set status='expired', grace_until=null, cancel_at_period_end=false, updated_at=now() where tenant_id=$1", [tid]);
  await rows("update tenants set plan=$1, plan_since=now() where id=$2", [DEMO, tid]);
  if (had || t.plan !== DEMO) { await logEvent(tid, 'downgraded', { from: t.plan, to: DEMO, detail: why, by });
    const nm = (await one<any>('select name from plans where key=$1', [t.plan]))?.name ?? t.plan; await tell(tid, (name, org, url) => T.subscriptionEnded(name, org, nm, url)); }
  return {};
}
async function expireTenant(tid: number, by: 'auto' | number) { await endSubscription(tid, typeof by === 'number' ? by : null, by === 'auto' ? 'Subscription ended' : 'Ended'); }

// ---- The daily check: grace periods, falling back to Demo, and "ending soon" reminders. Safe to run as often as you like. ----
export async function runSweep(): Promise<{ grace: number; expired: number; reminders: number }> {
  const out = { grace: 0, expired: 0, reminders: 0 }; const gd = await graceDays();
  for (const s of await rows<any>("select s.*, p.name pname from subscriptions s join plans p on p.key=s.plan_key where s.status in ('active','grace') and s.current_period_end is not null")) {
    const end = new Date(s.current_period_end).getTime(), now = Date.now();
    if (now > end && s.status === 'active') {
      if (s.cancel_at_period_end || gd === 0) { await expireTenant(s.tenant_id, 'auto'); out.expired++; continue; }
      const until = new Date(end + gd * DAY);
      await rows("update subscriptions set status='grace', grace_until=$2, updated_at=now() where tenant_id=$1", [s.tenant_id, until]);
      await logEvent(s.tenant_id, 'grace_started', { from: s.plan_key, detail: `grace until ${dayStr(until)}` }); out.grace++;
      await tell(s.tenant_id, (name, org, url) => T.subscriptionGrace(name, org, s.pname, dayStr(until), url)); continue;
    }
    if (s.status === 'grace' && s.grace_until && now > new Date(s.grace_until).getTime()) { await expireTenant(s.tenant_id, 'auto'); out.expired++; continue; }
    // Ending soon: one email at 7 days and one at 1 day before the end, once each per period.
    if (s.status === 'active' && !s.cancel_at_period_end) {
      for (const [kind, days] of [['reminder_1', 1], ['reminder_7', 7]] as const) {
        if (end - now <= days * DAY && end > now) {
          if (!(await one('select 1 from subscription_events where tenant_id=$1 and kind=$2 and detail=$3', [s.tenant_id, kind, dayStr(s.current_period_end)]))) {
            await logEvent(s.tenant_id, kind, { from: s.plan_key, detail: dayStr(s.current_period_end) }); out.reminders++;
            await tell(s.tenant_id, (name, org, url) => T.subscriptionEnding(name, org, s.pname, dayStr(s.current_period_end), Math.max(1, Math.ceil((end - now) / DAY)), url), false);
          }
          break;
        }
      }
    }
  }
  return out;
}

// ---- Reports (site admin) ----
export async function subscriptionReport() {
  const subs = await rows<any>(`select s.*, p.name pname, p.price_month, p.price_year, t.name tname from subscriptions s join plans p on p.key=s.plan_key join tenants t on t.id=s.tenant_id`);
  const live = subs.filter(s => s.status === 'active' || s.status === 'grace');
  const mrr = live.reduce((n, s) => n + (s.period === 'yearly' ? Math.round(s.price / 12) : s.period === 'monthly' ? s.price : 0), 0);
  const soon = (d: number) => live.filter(s => s.current_period_end && new Date(s.current_period_end).getTime() - Date.now() <= d * DAY && new Date(s.current_period_end).getTime() > Date.now()).length;
  const ev = (kind: string, d: number) => rows<any>("select count(*)::int n from subscription_events where kind=$1 and at > now() - ($2 || ' days')::interval", [kind, String(d)]).then(r => r[0].n as number);
  const signups = async (d: number) => (await rows<any>("select count(*)::int n from tenants where id<>1 and created_at > now() - ($1 || ' days')::interval", [String(d)]))[0].n as number;
  return { live: live.length, mrr, arr: mrr * 12, grace: subs.filter(s => s.status === 'grace').length, soon7: soon(7), soon30: soon(30), expired: subs.filter(s => s.status === 'expired').length,
    cancelling: live.filter(s => s.cancel_at_period_end).length, subscribed30: await ev('subscribed', 30), churn30: await ev('downgraded', 30), signups7: await signups(7), signups30: await signups(30), subs };
}
