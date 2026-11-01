import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';
import { devSite } from '@/lib/devmode';
import Link from 'next/link';
import { loadInterest, loadOptouts } from '@/lib/interestList';
export const dynamic = 'force-dynamic';
export default async function Interest() {
  const me = await requireMe(); if (me.role !== 'webappdev' || !devSite()) redirect('/');
  let r: Awaited<ReturnType<typeof loadInterest>> | null = null, err = '';
  try { r = await loadInterest(); } catch { err = 'Could not read the interest list.'; }
  let outs: Awaited<ReturnType<typeof loadOptouts>> = []; try { outs = await loadOptouts(); } catch { /* shown as empty */ }
  const optBy = new Map<string, string[]>(); for (const o of outs) { const k = String(o.email).toLowerCase(); optBy.set(k, [...(optBy.get(k) ?? []), o.category === 'important' ? 'important updates' : 'marketing']); }
  const d = (x: any) => new Date(x).toISOString().slice(0, 16).replace('T', ' ');
  return (<><h1>Interest</h1>
    <p className="mut">Registrations from the holding page{r ? ` (${r.source === 'live' ? 'live site' : 'this site only: LIVE_DATABASE_URL is not set'})` : ''}. {r ? `${r.list.length} so far.` : ''}</p>
    <p><Link href="/mail">Write an email to these people →</Link></p>
    <h2>Unsubscribed ({outs.length})</h2>
    {outs.length === 0 ? <p className="mut">Nobody has unsubscribed.</p> : outs.map((o: any) => <div key={o.email + o.category} className="card">{o.email} <span className="tag">{o.category === 'important' ? 'Important updates' : 'Marketing'}</span> <span className="mut">· {d(o.at)}</span></div>)}
    <h2>Registered</h2>
    {err && <div role="alert" style={{ color: 'var(--bad)' }}>{err}</div>}
    {r?.list.length === 0 && <p className="mut">Nobody has registered yet.</p>}
    {r?.list.map((i: any) => (<div key={i.id} className="card"><b>{i.name}</b>{i.company ? <> · {i.company}</> : null}
      <div><a href={`mailto:${i.email}`}>{i.email}</a>{optBy.get(String(i.email).toLowerCase()) && <span className="tag" style={{ marginLeft: 6 }}>Unsubscribed: {optBy.get(String(i.email).toLowerCase())!.join(', ')}</span>} <span className="mut">· {d(i.created_at)}</span></div>
      {i.comment && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{i.comment}</p>}</div>))}</>);
}
