import { one } from '@/lib/db';
import { sha256 } from '@/lib/password';
import InviteForm from './InviteForm';
export const dynamic = 'force-dynamic';
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await one('select email from users where invite_hash=$1 and invite_expires > now()', [sha256(token)]);
  return (<div className="card" style={{ maxWidth: 400, margin: '40px auto' }}>
    {u ? (<><h1>Set your password</h1><p className="mut">Set a password for {u.email}.</p><InviteForm token={token} /></>)
      : (<><h1>Link not valid</h1><p>This link is invalid or has expired. Ask for a new invite, or use Forgot password on the sign-in page.</p></>)}</div>);
}
