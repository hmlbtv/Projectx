import { rows } from './db';
// Filters shared by the Audit trail page and its CSV export. Always limited to one workspace.
export type AuditFilter = { tenant: number; q?: string; who?: string; from?: string; to?: string };
export async function auditRows(f: AuditFilter, limit: number, offset = 0) {
  const w = ['a.tenant_id=$1']; const p: any[] = [f.tenant];
  const q = (f.q ?? '').trim().slice(0, 80), who = (f.who ?? '').trim().slice(0, 120);
  if (q) { p.push(`%${q.replace(/[%_\\]/g, m => '\\' + m)}%`); w.push(`(a.action ilike $${p.length} or a.detail ilike $${p.length})`); }
  if (who) { p.push(who); w.push(`a.who=$${p.length}`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from ?? '')) { p.push(f.from); w.push(`a.at >= $${p.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to ?? '')) { p.push(f.to); w.push(`a.at < ($${p.length}::date + 1)`); }
  p.push(limit, offset);
  return rows(`select a.id, a.at, a.who, a.action, a.detail from audit_log a where ${w.join(' and ')} order by a.at desc, a.id desc limit $${p.length - 1} offset $${p.length}`, p);
}
