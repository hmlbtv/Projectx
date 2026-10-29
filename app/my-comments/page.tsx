import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { devSite } from '@/lib/devmode';
import { devAccess, myNotes } from '@/lib/devfeedback';
export const dynamic = 'force-dynamic';
const COL = ['', '#2ea043', '#e3a008', '#e5352b'];
// Dev site only, and only for people with Dev comment turned on: what they have left, and any replies.
export default async function MyComments() {
  if (!devSite()) notFound(); await requireMe(); if (!(await devAccess()).on) notFound();
  const list = await myNotes(); const at = (d: string) => new Date(d).toLocaleString('en-GB');
  return (<><h1>My comments</h1><p className="mut">Everything you have marked on the dev site, and the replies from the developer.</p>
    {list.length === 0 && <p className="mut">You haven’t left any comments yet. Use the DEV bar at the bottom right of any page.</p>}
    {list.map(n => (<div key={n.id} className="card" style={{ borderLeft: `6px solid ${COL[n.severity]}`, margin: '10px 0' }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><span><b style={{ color: COL[n.severity] }}>Severity {n.severity}</b> · {n.device === 'mobile' ? '📱 mobile' : '🖥 desktop'} · {n.kind} · <b>{n.status === 'done' ? 'Done' : 'Open'}</b></span><span className="mut">{at(n.created_at)}</span></div>
      {n.subject && <p style={{ margin: '6px 0 0' }}><b>On: {n.subject}</b></p>}
      <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>{n.body || <span className="mut">(drawing / highlight only)</span>}</p>
      {n.replies.map(r => <div key={r.id} style={{ margin: '4px 0', padding: '6px 10px', background: 'var(--bg)', borderLeft: '3px solid var(--line)' }}><b>{r.user_name}</b> <span className="mut">replied · {at(r.created_at)}</span><div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div></div>)}
      <p style={{ margin: '6px 0 0' }}><Link href={`${n.page}${n.page.includes('?') ? '&' : '?'}devnote=${n.id}`}>Open page: {n.page}</Link> <span className="mut">(open it on a {n.device} screen to see the mark)</span></p></div>))}</>);
}
