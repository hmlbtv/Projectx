import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
export const dynamic = 'force-dynamic';
const q = (v: any) => { const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export async function GET(req: Request) {
  const me = await requireMe(); if (me.role !== 'webappdev') return new Response('Not allowed', { status: 403 });
  const ev = new URL(req.url).searchParams.get('events');
  const r = ev
    ? await rows<any>(`select e.at, t.name workspace, e.kind, e.from_plan, e.to_plan, e.amount, e.detail from subscription_events e left join tenants t on t.id=e.tenant_id order by e.at desc`)
    : await rows<any>(`select t.name workspace, (select min(u.email) from users u where u.tenant_id=t.id and u.role='master_admin') owner, t.plan, s.status, s.period, s.price, s.currency, s.started_at, s.current_period_end, s.cancel_at_period_end, t.created_at signed_up,
        (select max(e.started_at) from login_events e where e.tenant_id=t.id) last_login from tenants t left join subscriptions s on s.tenant_id=t.id where t.id<>1 order by t.id`);
  const cols = r[0] ? Object.keys(r[0]) : ev ? ['at', 'workspace', 'kind', 'from_plan', 'to_plan', 'amount', 'detail'] : ['workspace', 'owner', 'plan', 'status', 'period', 'price', 'currency', 'started_at', 'current_period_end', 'cancel_at_period_end', 'signed_up', 'last_login'];
  const body = [cols.join(','), ...r.map(x => cols.map(c => q(x[c])).join(','))].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="teleplanner-${ev ? 'subscription-history' : 'workspaces'}.csv"` } });
}
