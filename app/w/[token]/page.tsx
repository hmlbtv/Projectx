import { redirect } from 'next/navigation';
import Link from 'next/link';
import { one } from '@/lib/db';
import { sha256 } from '@/lib/password';
import { myEmails } from '@/lib/emails';
import { getMe } from '@/lib/session';
import { Logo } from '@/app/Logo';
import GuestSignUp from './GuestSignUp';
export const dynamic = 'force-dynamic';

// Entry point for an invitation link: sends the person to the right place.
export default async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await one(`select wl.id, wl.email, t.name tenant from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id
    join broadcasters b on b.id=p.broadcaster_id join tenants t on t.id=b.tenant_id
    where wl.token_hash=$1 and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date) and (select tn.status from tenants tn join broadcasters bb on bb.tenant_id=tn.id join productions pp on pp.broadcaster_id=bb.id where pp.id=j.production_id)='active'`, [sha256(token)]);
  const head = <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 22px' }}><Logo size={30} /></div>;
  if (!link) return (<div className="auth">{head}<div className="card"><h1>Link not active</h1><p>This invitation has expired, been switched off, or the account that sent it is no longer active. Ask the person who sent it for a new one.</p></div></div>);
  const me = await getMe();
  if (me) {
    const mine = await one(`select 1 where $1 in ${myEmails(2)}`, [link.email.toLowerCase(), me.id]);
    if (mine) redirect(`/shared/${link.id}`);
    return (<div className="auth">{head}<div className="card"><h1>Sent to a different email</h1><p>This invitation was sent to <b>{link.email}</b>, which is not on your account. If it is your address, add it under <Link href="/account">Account → Other email addresses</Link> and confirm it, then open this link again. Otherwise sign out and use the invited email.</p></div></div>);
  }
  const exists = await one('select 1 from users where email=$1', [link.email]);
  if (exists) redirect(`/signin?next=${encodeURIComponent('/shared/' + link.id)}&email=${encodeURIComponent(link.email)}`);
  if (await one('select 1 from user_emails where email=$1 and verified', [link.email.toLowerCase()])) redirect(`/signin?next=${encodeURIComponent('/shared/' + link.id)}`);
  return (<div className="auth">{head}<div className="card"><h1>Create your account</h1>
    <p className="mut">{link.tenant} shared a monitor wall with you. Create an account for <b>{link.email}</b>. Everything shared with you will be in one place when you sign in.</p>
    <GuestSignUp token={token} email={link.email} /><p style={{ margin: '12px 0 0' }}>Already have an account? <Link href={`/signin?next=${encodeURIComponent('/shared/' + link.id)}&email=${encodeURIComponent(link.email)}`}>Sign in</Link></p></div></div>);
}
