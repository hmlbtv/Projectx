import Link from 'next/link';
import ForgotForm from './ForgotForm';
export default function Forgot() {
  return (<div className="card" style={{ maxWidth: 400, margin: '40px auto' }}><h1>Reset your password</h1><ForgotForm /><p><Link href="/signin">Back to sign in</Link></p></div>);
}
