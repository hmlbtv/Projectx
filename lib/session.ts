import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one, rows } from './db';
import { newToken, sha256 } from './password';

export type Me = { id: number; name: string; email: string; role: string; tenant_id: number | null };
export const canManage = (me: Me) => ['webappdev', 'master_admin', 'admin', 'manager'].includes(me.role);
export const isAdmin = (me: Me) => ['webappdev', 'master_admin', 'admin'].includes(me.role);

const COOKIE = 'wm_session', DAYS = 7;

// The cookie holds a random token; only its SHA-256 hash is stored, so a database leak can't be used to log in.
export async function createSession(userId: number) {
  const token = newToken();
  await rows("insert into sessions(id,user_id,expires_at) values($1,$2,now() + interval '7 days')", [sha256(token), userId]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DAYS * 86400 });
}
export async function destroySession() {
  const c = await cookies(); const t = c.get(COOKIE)?.value;
  if (t) await rows('delete from sessions where id=$1', [sha256(t)]);
  c.delete(COOKIE);
}
export async function getMe(): Promise<Me | null> {
  const t = (await cookies()).get(COOKIE)?.value; if (!t) return null;
  return (await one<Me>(`select u.id,u.name,u.email,u.role,u.tenant_id from sessions s join users u on u.id=s.user_id
    where s.id=$1 and s.expires_at > now()`, [sha256(t)])) ?? null;
}
export async function requireMe(): Promise<Me> {
  const me = await getMe(); if (!me) redirect('/signin'); return me;
}
