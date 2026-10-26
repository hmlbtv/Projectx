import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { redirect } from 'next/navigation';
import { auditRows } from '@/lib/auditQuery';
import { actionLabel } from '@/lib/audit';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
const PAGE = 100;

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; who?: string; from?: string; to?: string; p?: string }> }) {
  const me = await requireMe(); if (!['master_admin', 'webappdev'].includes(me.role) || !me.tenant_id) redirect('/');
  const s = await searchParams, t = me.tenant_id, page = Math.max(1, Number(s.p) || 1);
  const data = await auditRows({ tenant: t, q: s.q, who: s.who, from: s.from, to: s.to }, PAGE + 1, (page - 1) * PAGE);
  const more = data.length > PAGE, list = data.slice(0, PAGE);
  const people = await rows('select distinct who from audit_log where tenant_id=$1 order by who limit 200', [t]);
  const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ q: s.q, who: s.who, from: s.from, to: s.to, ...o })) if (v) p.set(k, v); const x = p.toString(); return x ? '?' + x : ''; };
  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><h1 style={{ margin: 0 }}>Audit trail</h1>
      <a className="btn small" href={`/audit/export${qs({ p: undefined })}`}>Export CSV</a></div>
    <p className="mut">Every change made in this workspace: who made it and when. Times are shown in UTC. Only Master Admins can see this.</p>
    <form className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <input name="q" placeholder="Search actions and details" defaultValue={s.q} aria-label="Search" />
      <select name="who" defaultValue={s.who ?? ''} aria-label="Person"><option value="">Everyone</option>{people.map((x: any) => <option key={x.who}>{x.who}</option>)}</select>
      <label className="mut" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>From<input type="date" name="from" defaultValue={s.from} /></label>
      <label className="mut" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>To<input type="date" name="to" defaultValue={s.to} /></label>
      <button className="sec">Filter</button>{(s.q || s.who || s.from || s.to) && <Link href="/audit" className="btn small">Clear</Link>}</form>
    {list.length === 0 ? <p className="mut">Nothing recorded{s.q || s.who || s.from || s.to ? ' for those filters' : ' yet'}. Changes made from now on appear here.</p> :
      <div className="card" style={{ overflowX: 'auto' }}><table className="lay-list"><thead><tr><th>When (UTC)</th><th>Person</th><th>Action</th><th>Details</th></tr></thead><tbody>
        {list.map((r: any) => <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toISOString().replace('T', ' ').slice(0, 19)}</td><td>{r.who}</td><td>{actionLabel(r.action)}</td><td className="mut" style={{ overflowWrap: 'anywhere' }}>{r.detail}</td></tr>)}</tbody></table></div>}
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{page > 1 && <Link className="btn small" href={`/audit${qs({ p: String(page - 1) })}`}>← Newer</Link>}{more && <Link className="btn small" href={`/audit${qs({ p: String(page + 1) })}`}>Older →</Link>}</div></>);
}
