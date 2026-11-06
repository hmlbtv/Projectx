'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { one, rows } from './db';
import { requireMe } from './session';
import { LIMIT_DEFS, UNLIMITED, addPeriod, cancelAtPeriodEnd, endSubscription, logEvent, runSweep, setSubscription } from './subscriptions';

// Everything here is for the site admin (webappdev) only. Prices are typed in pounds and stored in pence.
async function dev() { const me = await requireMe(); if (me.role !== 'webappdev') fail('Site admin only'); return me; }
const str = (f: FormData, k: string, n = 200) => String(f.get(k) ?? '').trim().slice(0, n);
const pence = (f: FormData, k: string) => { const v = parseFloat(str(f, k).replace(/[^0-9.]/g, '')); return Number.isFinite(v) ? Math.max(0, Math.round(v * 100)) : 0; };
const fail = (m: string): never => redirect('/webappdev/subscriptions?err=' + encodeURIComponent(m));
const done = () => { revalidatePath('/webappdev/subscriptions'); revalidatePath('/webappdev'); revalidatePath('/account'); };

export async function savePlan(f: FormData) {
  const me = await dev(); let key = str(f, 'key', 40).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const name = str(f, 'name', 60); if (!name) return;
  if (!key) key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'plan';
  const limits: Record<string, number> = {}; for (const d of LIMIT_DEFS) { const raw = str(f, 'lim_' + d.key); const v = f.get('unl_' + d.key) ? UNLIMITED : parseInt(raw); limits[d.key] = Number.isFinite(v) ? Math.min(Math.max(v, 0), UNLIMITED) : d.def; }
  const old = await one('select key from plans where key=$1', [key]);
  const cur = (str(f, 'currency', 3) || 'GBP').toUpperCase();
  if (old) {
    const sys = key === 'demo' || key === 'owner'; // these two always exist and stay free
    await rows('update plans set name=$2, sort=$3, price_month=$4, price_year=$5, currency=$6, limits=$7, description=$8, public=$9, active=$10 where key=$1',
      [key, name, parseInt(str(f, 'sort')) || 0, sys ? 0 : pence(f, 'price_month'), sys ? 0 : pence(f, 'price_year'), cur, JSON.stringify(limits), str(f, 'description', 300), !!f.get('public'), sys ? true : !!f.get('active')]);
  } else {
    await rows('insert into plans(key,name,sort,price_month,price_year,currency,limits,description,public,active) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [key, name, parseInt(str(f, 'sort')) || 100, pence(f, 'price_month'), pence(f, 'price_year'), cur, JSON.stringify(limits), str(f, 'description', 300), !!f.get('public'), !!f.get('active')]);
  }
  await logEvent(null, old ? 'plan_edited' : 'plan_created', { to: key, detail: name, by: me.id }); done();
}
export async function deletePlan(f: FormData) {
  const me = await dev(); const key = str(f, 'key', 40); if (key === 'demo' || key === 'owner') return;
  if (await one('select 1 from tenants where plan=$1 union select 1 from subscriptions where plan_key=$1', [key])) fail('Workspaces are using this plan. Switch it off instead.');
  await rows('delete from plans where key=$1', [key]); await logEvent(null, 'plan_deleted', { to: key, by: me.id }); done();
}
export async function setTenantSubscription(f: FormData) {
  const me = await dev(); const tid = Number(f.get('tenant')); const plan = str(f, 'plan', 40); const period = (['monthly', 'yearly', 'manual'].includes(str(f, 'period')) ? str(f, 'period') : 'monthly') as 'monthly' | 'yearly' | 'manual';
  const endRaw = str(f, 'end', 10); const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? new Date(endRaw + 'T23:59:59Z') : null;
  const priceRaw = str(f, 'price'); const r = await setSubscription(tid, { plan, period, price: priceRaw === '' ? null : pence(f, 'price'), periodEnd: end, notes: str(f, 'notes', 500), by: me.id });
  if (r.error) fail(r.error); done();
}
export async function extendSubscription(f: FormData) {
  const me = await dev(); const tid = Number(f.get('tenant')); const days = Math.min(Math.max(parseInt(str(f, 'days')) || 0, 1), 3650);
  const s = await one<any>('select * from subscriptions where tenant_id=$1', [tid]); if (!s) fail('This workspace has no subscription to extend.');
  const base = s.current_period_end && new Date(s.current_period_end).getTime() > Date.now() ? new Date(s.current_period_end) : new Date();
  const end = new Date(base.getTime() + days * 86400_000);
  const r = await setSubscription(tid, { plan: s.plan_key, period: s.period, price: s.price, periodEnd: end, notes: s.notes, by: me.id }); if (r.error) fail(r.error);
  await logEvent(tid, 'extended', { to: s.plan_key, detail: `+${days} days, now until ${end.toISOString().slice(0, 10)}`, by: me.id }); done();
}
export async function renewSubscription(f: FormData) {
  const me = await dev(); const tid = Number(f.get('tenant')); const s = await one<any>('select * from subscriptions where tenant_id=$1', [tid]); if (!s) fail('No subscription.');
  const base = s.current_period_end && new Date(s.current_period_end).getTime() > Date.now() ? new Date(s.current_period_end) : new Date();
  const r = await setSubscription(tid, { plan: s.plan_key, period: s.period, price: s.price, periodEnd: s.period === 'manual' ? null : addPeriod(base, s.period), notes: s.notes, by: me.id }); if (r.error) fail(r.error); done();
}
export async function cancelSubscription(f: FormData) { const me = await dev(); await cancelAtPeriodEnd(Number(f.get('tenant')), me.id, f.get('undo') ? false : true); done(); }
export async function endSubscriptionNow(f: FormData) { const me = await dev(); const r = await endSubscription(Number(f.get('tenant')), me.id, 'Ended by the site admin'); if (r.error) fail(r.error); done(); }
export async function saveTenantOverrides(f: FormData) {
  const me = await dev(); const tid = Number(f.get('tenant')); const ov: Record<string, number> = {};
  for (const d of LIMIT_DEFS) { const raw = str(f, 'ov_' + d.key); if (raw !== '') { const v = parseInt(raw); if (Number.isFinite(v)) ov[d.key] = Math.min(Math.max(v, 0), UNLIMITED); } }
  await rows('update tenants set limit_overrides=$1 where id=$2', [JSON.stringify(ov), tid]); await logEvent(tid, 'limits_overridden', { detail: Object.entries(ov).map(([k, v]) => `${k}=${v}`).join(', ') || 'cleared', by: me.id }); done();
}
export async function saveGraceDays(f: FormData) {
  await dev(); const d = Math.min(Math.max(parseInt(str(f, 'days')) || 0, 0), 90);
  await rows("insert into settings(key,value) values('subscription_grace_days',$1) on conflict (key) do update set value=excluded.value", [String(d)]); done();
}
export async function runSweepNow() { await dev(); await runSweep(); done(); }
