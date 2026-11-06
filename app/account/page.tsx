import { requireMe } from '@/lib/session';
import PasswordForm from './PasswordForm';
import TwoFactor from './TwoFactor';
import { one, rows } from '@/lib/db';
import { getLimits, LIMIT_DEFS, limitText, dayStr } from '@/lib/subscriptions';
export const dynamic = 'force-dynamic';
export default async function Account() {
  const me = await requireMe(); const tf = await one('select totp_enabled from users where id=$1', [me.id]);
  const L = me.role === 'webappdev' ? null : await getLimits(me.tenant_id!);
  const used: Record<string, number> = L ? { wall_templates: (await one('select count(*)::int n from wall_templates where tenant_id=$1', [me.tenant_id!])).n, broadcasters: (await one('select count(*)::int n from broadcasters where tenant_id=$1', [me.tenant_id!])).n } : {};
  return (<div style={{ maxWidth: 460 }}>{L && <div className="card"><h2 style={{ marginTop: 0 }}>Your plan: {L.name}</h2>
    <p className="mut">{L.status === 'grace' ? `Your subscription has ended. Everything keeps working until ${dayStr(L.graceUntil)}, then the workspace goes back to Demo. Nothing you made is deleted.` : L.periodEnd ? `Renews or ends on ${dayStr(L.periodEnd)}.` : L.plan === 'demo' ? 'The Demo plan has limits on how much you can add. To get more, contact us to upgrade. Nothing you have made is ever deleted.' : 'No end date.'}</p>
    <ul className="mut" style={{ margin: 0, paddingLeft: 18 }}>{LIMIT_DEFS.map(d => <li key={d.key}>{d.label}: {used[d.key] !== undefined ? used[d.key] + ' of ' : 'up to '}{limitText(L.limits[d.key])} <span style={{ opacity: .7 }}>({d.per})</span></li>)}</ul>{['master_admin', 'admin'].includes(me.role) && <p style={{ margin: '8px 0 0' }}><a href="/subscription">View plans (read only)</a></p>}</div>}<div className="card"><h1>Account</h1><p className="mut">{me.name} · {me.email} · {me.role}</p><h2>Change password</h2><PasswordForm /></div><div className="card"><h2 style={{ marginTop: 0 }}>Two-step sign-in</h2><TwoFactor enabled={!!tf?.totp_enabled} /></div></div>);
}
