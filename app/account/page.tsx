import { requireMe } from '@/lib/session';
import PasswordForm from './PasswordForm';
import TwoFactor from './TwoFactor';
import { one } from '@/lib/db';
export const dynamic = 'force-dynamic';
export default async function Account() {
  const me = await requireMe(); const tf = await one('select totp_enabled from users where id=$1', [me.id]);
  return (<div style={{ maxWidth: 460 }}><div className="card"><h1>Account</h1><p className="mut">{me.name} · {me.email} · {me.role}</p><h2>Change password</h2><PasswordForm /></div><div className="card"><h2 style={{ marginTop: 0 }}>Two-step sign-in</h2><TwoFactor enabled={!!tf?.totp_enabled} /></div></div>);
}
