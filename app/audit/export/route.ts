import { getMe } from '@/lib/session';
import { auditRows } from '@/lib/auditQuery';
import { actionLabel } from '@/lib/audit';
export const dynamic = 'force-dynamic';

// A cell that starts with = + - @ could run as a formula in Excel, so it is prefixed with an apostrophe.
const cell = (v: any) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
export async function GET(req: Request) {
  const me = await getMe(); if (!me || !me.tenant_id || !['master_admin', 'webappdev'].includes(me.role)) return new Response('Not allowed', { status: 403 });
  const u = new URL(req.url).searchParams; const data = await auditRows({ tenant: me.tenant_id, q: u.get('q') ?? '', who: u.get('who') ?? '', from: u.get('from') ?? '', to: u.get('to') ?? '' }, 50000);
  const csv = '﻿' + ['Date and time (UTC)', 'Person', 'Action', 'Details'].map(cell).join(',') + '\r\n' + data.map((r: any) => [new Date(r.at).toISOString().replace('T', ' ').slice(0, 19), r.who, actionLabel(r.action), r.detail].map(cell).join(',')).join('\r\n') + '\r\n';
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
