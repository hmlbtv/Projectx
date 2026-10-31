import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { rows, one } from './db';
import { seal, unseal } from './totp';
import type { Rec } from './jobImport';

export type Mapping = Partial<Record<'broadcaster' | 'production' | 'job' | 'date' | 'final' | 'expires' | 'sourceSet', string>>; // "path.to.field" or "=fixed text"
export const TARGETS: { key: keyof Mapping; label: string; required?: boolean; hint: string }[] = [
  { key: 'broadcaster', label: 'Broadcaster', required: true, hint: 'Who the programme is for' },
  { key: 'production', label: 'Production', required: true, hint: 'The show or series' },
  { key: 'job', label: 'Job name', required: true, hint: 'The episode / event / booking' },
  { key: 'date', label: 'Job date', hint: 'First day' },
  { key: 'final', label: 'Final date', hint: 'Last day (empty = Job date)' },
  { key: 'expires', label: 'Expires', hint: 'Empty = 5 days after the final date' },
  { key: 'sourceSet', label: 'Source Set', hint: 'Matched by name' },
];
export type Config = { name: string; url: string; auth_header: string; auth_value: string; records_path: string; mapping: Mapping };

export async function loadConfig(tenant: number) { return one<any>('select * from integrations where tenant_id=$1', [tenant]); }
export const secretOf = (c: { auth_value?: string } | null) => (c?.auth_value ? unseal(c.auth_value) ?? '' : '');
export async function saveConfig(tenant: number, c: { name: string; url: string; auth_header: string; auth_value?: string; records_path: string; mapping: Mapping }) {
  const old = await loadConfig(tenant), sealed = c.auth_value ? seal(c.auth_value) : old?.auth_value ?? '';
  const map: Mapping = {}; for (const t of TARGETS) { const v = String(c.mapping?.[t.key] ?? '').slice(0, 200); if (v) map[t.key] = v; }
  await rows(`insert into integrations(tenant_id,name,url,auth_header,auth_value,records_path,mapping,updated_at) values($1,$2,$3,$4,$5,$6,$7,now())
    on conflict (tenant_id) do update set name=$2,url=$3,auth_header=$4,auth_value=$5,records_path=$6,mapping=$7,updated_at=now()`,
    [tenant, c.name.slice(0, 80), c.url.slice(0, 500), c.auth_header.replace(/[^A-Za-z0-9\-_]/g, '').slice(0, 60), sealed, c.records_path.slice(0, 200), JSON.stringify(map)]);
}

const privateIp = (ip: string) => { if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; } const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:'); };
// Calls the scheduling system's endpoint. HTTPS only, never to internal addresses, with a time and size limit.
export async function pull(url: string, header: string, value: string): Promise<unknown> {
  let u: URL; try { u = new URL(url); } catch { throw new Error('That is not a valid web address.'); }
  if (u.protocol !== 'https:') throw new Error('The address must start with https://');
  if (u.username || u.password) throw new Error('Do not put a username or password in the address; use the key field.');
  const addrs = await lookup(u.hostname, { all: true }).catch(() => { throw new Error('Could not find that server.'); });
  if (!addrs.length || addrs.some(a => privateIp(a.address))) throw new Error('That address is not allowed (it points to a private network).');
  const h: Record<string, string> = { Accept: 'application/json' }; if (header && value) h[header] = value;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try { const r = await fetch(u, { headers: h, redirect: 'error', signal: ctl.signal, cache: 'no-store' }); if (!r.ok) throw new Error(`The scheduling system answered ${r.status}${r.status === 401 || r.status === 403 ? ' (check the key)' : ''}.`);
    const t = await r.text(); if (t.length > 4_000_000) throw new Error('The answer is too large (4 MB maximum).'); try { return JSON.parse(t); } catch { throw new Error('The answer was not JSON.'); } }
  catch (e: any) { if (e?.name === 'AbortError') throw new Error('The scheduling system took too long to answer.'); if (e?.message && /^(The|That|Could)/.test(e.message)) throw e; throw new Error('Could not reach the scheduling system.'); }
  finally { clearTimeout(timer); }
}
const dig = (o: any, path: string) => path.split('.').filter(Boolean).reduce((a, k) => (a == null ? a : a[k]), o);
export function records(data: unknown, path: string): Record<string, unknown>[] {
  let v: any = path.trim() ? dig(data, path.trim()) : data;
  if (!Array.isArray(v) && v && typeof v === 'object' && !path.trim()) v = Object.values(v).find(x => Array.isArray(x)) ?? v;
  if (!Array.isArray(v)) throw new Error(path.trim() ? `No list of records found at "${path}".` : 'No list of records found. Enter where the list is, e.g. data.events');
  return v.filter(x => x && typeof x === 'object').slice(0, 5000);
}
// Flatten one record to dotted field names: { show: { title: "X" } } -> show.title
export function flat(o: any, pre = '', depth = 0, out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(o ?? {})) { const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 3) flat(v, key, depth + 1, out); else out[key] = Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? (x.name ?? x.title ?? JSON.stringify(x)) : x)).join(', ') : v; }
  return out;
}
export const fieldsOf = (recs: Record<string, unknown>[]) => Array.from(new Set(recs.slice(0, 50).flatMap(r => Object.keys(flat(r)))));
export function mapRecords(recs: Record<string, unknown>[], m: Mapping): Rec[] {
  const get = (f: Record<string, unknown>, k?: string) => (!k ? null : k.startsWith('=') ? k.slice(1) : f[k] ?? null);
  return recs.map(r => { const f = flat(r); return { broadcaster: String(get(f, m.broadcaster) ?? ''), production: String(get(f, m.production) ?? ''), job: String(get(f, m.job) ?? ''), date: get(f, m.date) as any, final: get(f, m.final) as any, expires: get(f, m.expires) as any, sourceSet: get(f, m.sourceSet) as any }; });
}
