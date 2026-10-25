import { requireMe } from '@/lib/session';
import PasswordForm from './PasswordForm';
export const dynamic = 'force-dynamic';
export default async function Account() {
  const me = await requireMe();
  return (<div style={{ maxWidth: 460 }}><div className="card"><h1>Account</h1><p className="mut">{me.name} · {me.email} · {me.role}</p><h2>Change password</h2><PasswordForm /></div></div>);
}
