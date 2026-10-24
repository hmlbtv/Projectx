import { requireMe } from '@/lib/session';
import { rows } from '@/lib/db';
import { removeAltEmail } from '@/lib/actions';
import PasswordForm from './PasswordForm';
import AltEmails from './AltEmails';
export const dynamic = 'force-dynamic';
export default async function Account({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  const me = await requireMe(); const { added } = await searchParams;
  const alts = await rows('select email, verified from user_emails where user_id=$1 order by email', [me.id]);
  return (<div style={{ maxWidth: 460 }}><div className="card"><h1>Account</h1><p className="mut">{me.name} · {me.email} · {me.role}</p><h2>Change password</h2><PasswordForm /></div>
    <div className="card"><h2 style={{ marginTop: 0 }}>Other email addresses</h2>
      <p className="mut">Add any other address people use to invite you. Walls shared with a confirmed address appear in Shared with me, even though you sign in with {me.email}.</p>
      {added && <div style={{ color: 'var(--ok)' }}>Email address added.</div>}
      {alts.map((a: any) => (<form key={a.email} action={removeAltEmail} className="row"><input type="hidden" name="email" value={a.email} /><span>{a.email}</span><span className="tag">{a.verified ? 'confirmed' : 'waiting for confirmation'}</span><button className="del" style={{ minHeight: 0, padding: '2px 10px' }}>Remove</button></form>))}
      <AltEmails /></div></div>);
}
