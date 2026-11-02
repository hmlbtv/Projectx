import { redirect } from 'next/navigation';
import { requireMe, myOrgs, pendingInvites } from '@/lib/session';
import { acceptInvite, declineInvite, leaveOrg } from '@/lib/orgInvites';
export const dynamic = 'force-dynamic';
export default async function Organizations() {
  const me = await requireMe(); if (me.role === 'webappdev') redirect('/');
  const [orgs, pend] = await Promise.all([myOrgs(me.id), pendingInvites(me.id)]);
  const cur = me.membership_id ? String(me.membership_id) : 'home';
  return (<div className="stack"><h1>Organizations</h1>
    <p className="mut">One login, several organizations. Each organization only sees its own part of your account.</p>
    {pend.length > 0 && <><h2>Invitations</h2>{pend.map(p => (<div key={p.id} className="card"><b>{p.org}</b> <span className="tag">{p.role}</span>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><form action={acceptInvite}><input type="hidden" name="id" value={p.id} /><button>Accept</button></form>
      <form action={declineInvite}><input type="hidden" name="id" value={p.id} /><button className="sec">Decline</button></form></div></div>))}</>}
    <h2>Your organizations</h2>
    {orgs.map(o => (<div key={o.key} className="card"><b>{o.name}</b> <span className="tag">{o.role}</span>{o.key === cur && <span className="mut"> · working here now</span>}
      {o.role !== 'master_admin' && (o.key !== 'home' || orgs.length > 1) && <form action={leaveOrg} style={{ marginTop: 8 }}><input type="hidden" name="org" value={o.key} /><button className="sec">Leave organization</button></form>}</div>))}
  </div>);
}
