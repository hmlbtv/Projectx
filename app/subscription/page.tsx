import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows, one } from '@/lib/db';
import { requireMe, isAdmin } from '@/lib/session';
import { LIMIT_DEFS, UNLIMITED, dayStr, getLimits, limitText, money } from '@/lib/subscriptions';
export const dynamic = 'force-dynamic';

// Read only, for the Admins of a workspace: their own plan and what each tier will allow. Nothing here can be changed or bought yet; the site admin manages subscriptions.
export default async function Subscription() {
  const me = await requireMe(); if (me.role === 'webappdev') redirect('/webappdev/subscriptions'); if (!isAdmin(me)) redirect('/account');
  const t = me.tenant_id!; const g = await getLimits(t);
  const tiers = await rows<any>("select key, name, description, limits, price_month, price_year, currency, active from plans where public and key<>'owner' order by sort, key");
  const used: Record<string, number> = {
    wall_templates: (await one('select count(*)::int n from wall_templates where tenant_id=$1 and not demo', [t]))!.n,
    broadcasters: (await one('select count(*)::int n from broadcasters where tenant_id=$1 and not demo', [t]))!.n };
  return (<>
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 50, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <span style={{ transform: 'rotate(-30deg)', fontSize: 'clamp(48px, 14vw, 180px)', fontWeight: 800, letterSpacing: '.05em', whiteSpace: 'nowrap', color: 'rgba(229,53,43,.13)', textTransform: 'uppercase', userSelect: 'none' }}>In development</span></div>
    <h1>Subscription</h1>
    <p className="mut">Subscriptions are not available yet. This page is read only: it shows your current plan and what the plans will include. Nothing here can be changed or bought at the moment.</p>
    <div className="card"><h2 style={{ marginTop: 0 }}>Your plan: {g.name}</h2>
      <p className="mut">{g.status === 'grace' ? `Ended. Everything keeps working until ${dayStr(g.graceUntil)}, then the workspace goes back to Demo. Nothing you made is deleted.` : g.periodEnd ? `Runs until ${dayStr(g.periodEnd)}.` : 'No end date.'}</p>
      <ul className="mut" style={{ margin: 0, paddingLeft: 18 }}>{LIMIT_DEFS.map(d => <li key={d.key}>{d.label}: {used[d.key] !== undefined ? used[d.key] + ' of ' : 'up to '}{limitText(g.limits[d.key])} <span style={{ opacity: .7 }}>({d.per})</span></li>)}</ul></div>
    <h2>Plans</h2>
    <div className="tablewrap"><table><thead><tr><th>Plan</th>{LIMIT_DEFS.map(d => <th key={d.key}>{d.label}<div className="mut" style={{ fontWeight: 400 }}>{d.per}</div></th>)}<th>Price</th></tr></thead><tbody>
      {tiers.map((p: any) => (<tr key={p.key}><td><b>{p.name}</b>{p.key === g.plan && <span className="tag">yours</span>}{!p.active && p.key !== 'demo' && <div className="mut">coming soon</div>}</td>
        {LIMIT_DEFS.map(d => <td key={d.key}>{limitText(Number(p.limits?.[d.key] ?? d.def))}</td>)}
        <td>{p.key === 'demo' ? 'Free' : p.active && p.price_month ? `${money(p.price_month, p.currency)} / month` : 'To be announced'}</td></tr>))}</tbody></table></div>
    <p className="mut">Anything you have made is always kept. If you go over a plan&apos;s limits, the extra items stay viewable but cannot be edited or added to. <Link href="/account">Back to Account</Link></p></>);
}
