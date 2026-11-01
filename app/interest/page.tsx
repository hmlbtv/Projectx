import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';
import { devSite } from '@/lib/devmode';
import MailAll from './MailAll';
import { loadInterest } from '@/lib/interestList';
export const dynamic = 'force-dynamic';
export default async function Interest() {
  const me = await requireMe(); if (me.role !== 'webappdev' || !devSite()) redirect('/');
  let r: Awaited<ReturnType<typeof loadInterest>> | null = null, err = '';
  try { r = await loadInterest(); } catch { err = 'Could not read the interest list.'; }
  const d = (x: any) => new Date(x).toISOString().slice(0, 16).replace('T', ' ');
  return (<><h1>Interest</h1>
    <p className="mut">Registrations from the holding page{r ? ` (${r.source === 'live' ? 'live site' : 'this site only: LIVE_DATABASE_URL is not set'})` : ''}. {r ? `${r.list.length} so far.` : ''}</p>
    {r && r.list.length > 0 && <MailAll count={new Set(r.list.map((i: any) => String(i.email).toLowerCase())).size} />}
    {err && <div role="alert" style={{ color: 'var(--bad)' }}>{err}</div>}
    {r?.list.length === 0 && <p className="mut">Nobody has registered yet.</p>}
    {r?.list.map((i: any) => (<div key={i.id} className="card"><b>{i.name}</b>{i.company ? <> · {i.company}</> : null}
      <div><a href={`mailto:${i.email}`}>{i.email}</a> <span className="mut">· {d(i.created_at)}</span></div>
      {i.comment && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{i.comment}</p>}</div>))}</>);
}
