import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import { Logo } from '../Logo';
import SignInForm from './SignInForm';
export const dynamic = 'force-dynamic';
export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next, email } = await searchParams;
  if (await getMe()) redirect('/');
  return (<div className="auth"><div className="logo"><Logo size={40} tagline /></div>
    <div className="card"><h1>Sign in</h1><SignInForm next={next} email={email} /><p style={{ margin: '12px 0 0' }}><Link href="/forgot">Forgot your password?</Link></p></div>
    <div className="card"><b>New to TelePlanner?</b><p className="mut" style={{ margin: '4px 0 10px' }}>Create a free demo account with your own workspace and one Wall Template. Invite your team to share it.</p>
      <Link href="/signup"><button type="button" className="sec">Create a demo account</button></Link></div></div>);
}
