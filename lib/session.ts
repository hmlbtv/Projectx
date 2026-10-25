import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one, rows } from './db';
import { newToken, sha256 } from './password';

export type Me = { id: number; name: string; email: string; role: string; tenant_id: number | null };
export const canManage = (me: Me) => ['webappdev', 'master_admin', 'admin', 'manager'].includes(me.role);
export const isAdmin = (me: Me) => ['webappdev', 'master_admin', 'admin'].includes(me.role);

// __Host- prefix (production): browser only accepts it over HTTPS, for this exact host, with no Domain attribute.
const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-gp_session' : 'gp_session', DAYS = 7;

// The cookie holds a random token; only its SHA-256 hash is stored, so a database leak can't be used to log in.
export async function createSession(userId: number) {
  // Suspended or archived accounts never get a session (the site admin is exempt).
  const st = await one<{ status: string; suspended: boolean }>("select t.status, u.suspended from users u left join tenants t on t.id=u.tenant_id where u.id=$1 and u.role<>'webappdev'", [userId]);
  if (st && st.suspended) redirect('/suspended?r=suspended');
  if (st && st.status && st.status !== 'active') redirect('/suspended?r=' + st.status);
  const token = newToken();
  await rows("insert into sessions(id,user_id,expires_at) values($1,$2,now() + interval '7 days')", [sha256(token), userId]);
  await rows('insert into login_events(session_id,user_id,tenant_id) select $1,id,tenant_id from users where id=$2', [sha256(token), userId]);
  await rows('update users set last_login_at=now(), login_count=login_count+1 where id=$1', [userId]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DAYS * 86400 });
}
export async function destroySession() {
  const c = await cookies(); const t = c.get(COOKIE)?.value;
  if (t) await rows('delete from sessions where id=$1', [sha256(t)]);
  c.delete(COOKIE);
}
export async function getMe(): Promise<Me | null> {
  const t = (await cookies()).get(COOKIE)?.value; if (!t) return null;
  const h = sha256(t);
  const me = (await one<Me>(`select u.id,u.name,u.email,u.role,u.tenant_id from sessions s join users u on u.id=s.user_id
    left join tenants t on t.id=u.tenant_id
    where s.id=$1 and s.expires_at > now() and (u.role='webappdev' or (not u.suspended and (t.id is null or t.status='active')))`, [h])) ?? null;
  // Activity heartbeat (at most once a minute) so session length can be measured; stores no page content.
  if (me) await rows("update login_events set last_seen_at=now() where session_id=$1 and last_seen_at < now() - interval '1 minute'", [h]);
  return me;
}
export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) {
    const t = (await cookies()).get(COOKIE)?.value;
    const st = t ? await one<{ status: string }>(`select case when u.suspended then 'suspended' else tn.status end status from sessions s join users u on u.id=s.user_id left join tenants tn on tn.id=u.tenant_id where s.id=$1 and (u.suspended or tn.status<>'active')`, [sha256(t)]) : null;
    redirect(st ? '/suspended?r=' + st.status : '/signin');
  }
  return me;
}
