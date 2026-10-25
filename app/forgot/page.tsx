import Link from 'next/link';
import ForgotForm from './ForgotForm';
import { Logo } from '../Logo';
export default function Forgot() {
  return (<div className="auth"><div className="logo"><Logo size={40} tagline /></div><div className="card"><h1>Reset your password</h1><ForgotForm /><p><Link href="/signin">Back to sign in</Link></p></div></div>);
}
