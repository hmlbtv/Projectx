import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import SignUpForm from './SignUpForm';
export const dynamic = 'force-dynamic';
export default async function SignUp() {
  if (await getMe()) redirect('/');
  return (<div className="card" style={{ maxWidth: 420, margin: '40px auto' }}><h1>Create a demo account</h1>
    <p className="mut">You will be the Admin of your own workspace. The demo includes one Wall Template, and you can invite other people to use it.</p>
    <SignUpForm /><p style={{ margin: '12px 0 0' }}>Already have an account? <Link href="/signin">Sign in</Link></p></div>);
}
