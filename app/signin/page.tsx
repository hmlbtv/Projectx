import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import SignInForm from './SignInForm';
export const dynamic = 'force-dynamic';
export default async function SignIn() {
  if (await getMe()) redirect('/');
  return (<div style={{ maxWidth: 400, margin: '40px auto' }}>
    <div className="card"><h1>Sign in</h1><SignInForm /><p style={{ margin: '12px 0 0' }}><Link href="/forgot">Forgot your password?</Link></p></div>
    <div className="card"><b>New to Wall Maker?</b><p className="mut" style={{ margin: '4px 0 10px' }}>Create a free demo account with your own workspace and one Wall Template. Invite your team to share it.</p>
      <Link href="/signup"><button type="button" className="sec">Create a demo account</button></Link></div></div>);
}
