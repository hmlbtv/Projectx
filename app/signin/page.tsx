import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import SignInForm from './SignInForm';
export const dynamic = 'force-dynamic';
export default async function SignIn() {
  if (await getMe()) redirect('/');
  return (<div className="card" style={{ maxWidth: 400, margin: '40px auto' }}><h1>Sign in to Wall Maker</h1><SignInForm />
    <p className="mut">Access is by invitation. Use the link in your invite email to set your password.</p></div>);
}
