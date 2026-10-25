import Link from 'next/link';
import { Logo } from '../../Logo';
export default function Invalid() {
  return (<div className="auth"><div className="logo"><Logo size={40} tagline /></div><div className="card"><h1>Link not valid</h1><p>This verification link is invalid or has expired.</p><Link href="/forgot">Get a new link</Link></div></div>);
}
