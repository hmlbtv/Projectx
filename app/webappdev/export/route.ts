import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
export const dynamic = 'force-dynamic';
const q = (v: any) => { let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
// CSV exports of the Site admin logs. Addresses of people without an account stay masked, as on screen.
const KINDS: Record<string, { file: string; cols: string[]; sql: string }> = {
  email: { file: 'email-log', cols: ['at', 'to', 'subject', 'result', 'error'], sql: `select l.at, case when exists(select 1 from users u where lower(u.email)=lower(l.to_email)) then l.to_email
    else left(l.to_email,1)||'***'||substring(l.to_email from '@.*$') end "to", l.subject, case when l.ok then 'sent' else 'failed' end result, l.error from email_log l order by l.at desc` },
  campaigns: { file: 'email-library', cols: ['id', 'subject', 'status', 'category', 'audience', 'sent_count', 'skipped', 'sent_at', 'updated_at'], sql: `select id, subject, status, category, audience, sent_count, skipped, sent_at, updated_at from mail_messages order by coalesce(sent_at, updated_at) desc` },
  signins: { file: 'sign-ins', cols: ['started_at', 'last_seen_at', 'minutes', 'workspace', 'role'], sql: `select e.started_at, e.last_seen_at, round(extract(epoch from (e.last_seen_at - e.started_at))/60)::int minutes, coalesce(t.name,'(no workspace)') workspace, u.role
    from login_events e left join tenants t on t.id=e.tenant_id left join users u on u.id=e.user_id order by e.started_at desc limit 50000` },
};
export async function GET(req: Request) {
  const me = await requireMe(); if (me.role !== 'webappdev') return new Response('Not allowed', { status: 403 });
  const k = KINDS[new URL(req.url).searchParams.get('kind') ?? ''];
  if (!k) return new Response('Unknown export', { status: 404 });
  const r = await rows<any>(k.sql);
  const body = [k.cols.join(','), ...r.map(x => k.cols.map(c => q(x[c])).join(','))].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="teleplanner-${k.file}.csv"` } });
}
