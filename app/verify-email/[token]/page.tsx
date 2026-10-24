import Link from 'next/link';
import { redirect } from 'next/navigation';
import { one, rows } from '@/lib/db';
import { sha256 } from '@/lib/password';
import { requireMe } from '@/lib/session';
export const dynamic = 'force-dynamic';

// Confirms an extra email address. You must be signed in to the account it is being added to.
export default async function VerifyEmail({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const me = await requireMe();
  const e = await one('select email from user_emails where token_hash=$1 and user_id=$2 and expires_at > now() and not verified', [sha256(token), me.id]);
  if (e) { await rows('update user_emails set verified=true, token_hash=null, expires_at=null where email=$1', [e.email]); redirect('/account?added=1'); }
  return (<div className="card" style={{ maxWidth: 440, margin: '40px auto' }}><h1>Link not valid</h1><p>This confirmation link is invalid or has expired, or it belongs to a different account. Add the address again from <Link href="/account">Account</Link>.</p></div>);
}
