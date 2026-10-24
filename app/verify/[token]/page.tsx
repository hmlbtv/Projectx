import { redirect } from 'next/navigation';
import Link from 'next/link';
import { one, rows } from '@/lib/db';
import { sha256 } from '@/lib/password';
import { createSession } from '@/lib/session';
export const dynamic = 'force-dynamic';
export default async function Verify({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await one('select id from users where verify_hash=$1 and verify_expires > now()', [sha256(token)]);
  if (u) { await rows('update users set email_verified=true, verify_hash=null, verify_expires=null where id=$1', [u.id]); await createSession(u.id); redirect('/'); }
  return (<div className="card" style={{ maxWidth: 400, margin: '40px auto' }}><h1>Link not valid</h1><p>This verification link is invalid or has expired.</p><Link href="/forgot">Get a new link</Link></div>);
}
