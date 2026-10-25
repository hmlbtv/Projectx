import { redirect } from 'next/navigation';
import { one, rows } from '@/lib/db';
import { sha256 } from '@/lib/password';
import { createSession } from '@/lib/session';
export const dynamic = 'force-dynamic';
// A route handler (not a page) because signing in sets a cookie, which pages are not allowed to do.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await one('select id from users where verify_hash=$1 and verify_expires > now()', [sha256(token)]);
  if (!u) redirect('/verify/invalid');
  await rows('update users set email_verified=true, verify_hash=null, verify_expires=null where id=$1', [u.id]);
  await createSession(u.id);
  redirect('/');
}
