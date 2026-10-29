import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import { Logo } from '../Logo';
import { devSite } from '@/lib/devmode';
import SignInForm from './SignInForm';
export const dynamic = 'force-dynamic';
export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next, email } = await searchParams;
  if (await getMe()) redirect('/');
  const dev = process.env.DEV_TOOLS_BUILD === '1' && devSite();
  return (<div className="auth">{dev && <div role="note" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, background: '#f59e0b', color: '#111', fontWeight: 800, textAlign: 'center', letterSpacing: '.06em' }}>🛠 DEVELOPMENT SITE · not the live TelePlanner</div>}<div className="logo"><Logo size={40} tagline /></div>
    <div className="card"><h1>Sign in</h1><SignInForm next={next} email={email} /><p style={{ margin: '12px 0 0' }}><Link href="/forgot">Forgot your password?</Link></p></div>
    <div className="card"><b>New to TelePlanner?</b><p className="mut" style={{ margin: '4px 0 10px' }}>Create a free demo account with your own workspace and one Wall Template. Invite your team to share it.</p>
      <Link href="/signup"><button type="button" className="sec">Create a demo account</button></Link></div></div>);
}
