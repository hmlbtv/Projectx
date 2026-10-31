import { rows, one } from './db';
import { record } from './audit';
import type { Me } from './session';

// One Job to bring in, from an Excel file or from an external scheduling system.
export type Rec = { broadcaster: string; production: string; job: string; date?: string | null; final?: string | null; expires?: string | null; sourceSet?: string | null };
export type Result = { broadcasters: number; productions: number; jobs: number; skipped: number; duplicates: number; problems: string[] };

const clean = (v: unknown, n: number) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
// Accepts a Date, an Excel/ISO date, 2026-11-02, 02/11/2026 (day first), or a timestamp; returns YYYY-MM-DD or null.
export function toDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(+v) ? null : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  const t = String(v).trim(); let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(t); if (m) return ok(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  const d = new Date(t); return isNaN(+d) ? null : d.toISOString().slice(0, 10);
}
const ok = (y: number, mo: number, d: number) => { const x = new Date(Date.UTC(y, mo - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? x.toISOString().slice(0, 10) : null; };

// Creates any missing Broadcasters and Productions, then the Jobs. A Job that already exists (same Production, name and date) is left alone.
export async function importJobs(me: Me, recs: Rec[], source: string): Promise<Result> {
  const t = me.tenant_id ?? 0, res: Result = { broadcasters: 0, productions: 0, jobs: 0, skipped: 0, duplicates: 0, problems: [] };
  const lim = me.role === 'webappdev' ? { b: 1e9, p: 1e9, j: 1e9 } : (await one('select max_broadcasters b, max_productions p, max_jobs_per_production j from tenants where id=$1', [t]))!;
  const bs = await rows<{ id: number; name: string }>('select id, name from broadcasters where tenant_id=$1', [t]);
  const ps = await rows<{ id: number; name: string; broadcaster_id: number }>('select p.id, p.name, p.broadcaster_id from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1', [t]);
  const ss = await rows<{ id: number; name: string }>('select id, name from source_sets where tenant_id=$1', [t]);
  const seen = new Set((await rows<{ production_id: number; name: string; job_date: any }>('select j.production_id, j.name, j.job_date from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1', [t])).map(j => `${j.production_id}|${j.name.toLowerCase()}|${j.job_date ? new Date(j.job_date).toISOString().slice(0, 10) : ''}`));
  const activeCount = new Map<number, number>();
  for (const r of await rows<{ production_id: number; c: number }>('select j.production_id, count(*)::int c from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 and (j.expires_at is null or j.expires_at >= current_date) group by 1', [t])) activeCount.set(r.production_id, r.c);
  const say = (m: string) => { if (res.problems.length < 15) res.problems.push(m); };
  for (const [i, r] of recs.slice(0, 5000).entries()) {
    const bn = clean(r.broadcaster, 120), pn = clean(r.production, 120), jn = clean(r.job, 120);
    if (!jn) { res.skipped++; continue; } if (!bn || !pn) { res.skipped++; say(`Row ${i + 1} (${jn}): Broadcaster or Production missing.`); continue; }
    let b = bs.find(x => x.name.toLowerCase() === bn.toLowerCase());
    if (!b) { if (bs.length >= lim.b) { res.skipped++; say(`${bn}: Broadcaster limit (${lim.b}) reached.`); continue; } b = (await rows<{ id: number; name: string }>('insert into broadcasters(tenant_id,name) values($1,$2) returning id, name', [t, bn]))[0]; bs.push(b); res.broadcasters++; }
    let p = ps.find(x => x.broadcaster_id === b!.id && x.name.toLowerCase() === pn.toLowerCase());
    if (!p) { if (ps.filter(x => x.broadcaster_id === b!.id).length >= lim.p) { res.skipped++; say(`${bn} › ${pn}: Production limit (${lim.p}) reached.`); continue; }
      p = (await rows<{ id: number; name: string; broadcaster_id: number }>('insert into productions(broadcaster_id,name) values($1,$2) returning id, name, broadcaster_id', [b.id, pn]))[0]; ps.push(p); res.productions++; }
    const date = toDate(r.date), fin = toDate(r.final), exp = toDate(r.expires), key = `${p.id}|${jn.toLowerCase()}|${date ?? ''}`;
    if (seen.has(key)) { res.duplicates++; continue; }
    const f = fin ?? date, e = exp ?? (f ? new Date(new Date(f + 'T00:00:00Z').getTime() + 5 * 86400000).toISOString().slice(0, 10) : null), expired = !!e && e < new Date().toISOString().slice(0, 10);
    if (!expired && (activeCount.get(p.id) ?? 0) >= lim.j) { res.skipped++; say(`${bn} › ${pn} › ${jn}: active Job limit (${lim.j}) reached.`); continue; }
    const sn = clean(r.sourceSet, 120), set = sn ? ss.find(x => x.name.toLowerCase() === sn.toLowerCase()) : undefined; if (sn && !set) say(`${jn}: Source Set "${sn}" not found, left empty.`);
    await rows('insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id) values($1,$2,$3,$4,$5,$6)', [p.id, jn, date, f, e, set?.id ?? null]);
    seen.add(key); if (!expired) activeCount.set(p.id, (activeCount.get(p.id) ?? 0) + 1); res.jobs++;
  }
  await record(t, me.id, me.name, 'importJobs', `${source}: ${res.jobs} Jobs, ${res.productions} Productions, ${res.broadcasters} Broadcasters added`);
  return res;
}
