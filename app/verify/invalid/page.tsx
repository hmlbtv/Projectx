import Link from 'next/link';
export default function Invalid() {
  return (<div className="card" style={{ maxWidth: 400, margin: '40px auto' }}><h1>Link not valid</h1><p>This verification link is invalid or has expired.</p><Link href="/forgot">Get a new link</Link></div>);
}
