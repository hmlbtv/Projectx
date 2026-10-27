import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one, rows } from './db';
import { newToken, sha256 } from './password';

export type Me = { id: number; name: string; email: string; role: string; tenant_id: number | null };
export const canManage = (me: Me) => ['webappdev', 'master_admin', 'admin', 'manager'].includes(me.role);
export const isAdmin = (me: Me) => ['webappdev', 'master_admin', 'admin'].includes(me.role);

// __Host- prefix (production): browser only accepts it over HTTPS, for this exact host, with no Domain attribute.
const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-gp_session' : 'gp_session';
// Sign-in length is set by the site admin: signed out after IDLE_HOURS with no activity (0 = never), and always after MAX_DAYS.
let limitsAt = 0, limitsVal: { idleHours: number; maxDays: number } | null = null; // settings change rarely: kept for 30 s so most requests skip the query
export const resetLimits = () => { limitsVal = null; };
export async function sessionLimits() {
  if (limitsVal && Date.now() - limitsAt < 30_000) return limitsVal;
  const r = await rows<{ key: string; value: string }>("select key, value from settings where key in ('idle_hours','max_days')");
  const v = (k: string, d: number) => { const x = r.find(y => y.key === k); const n = x ? Number(x.value) : NaN; return Number.isFinite(n) ? n : d; };
  limitsVal = { idleHours: v('idle_hours', 8), maxDays: v('max_days', 30) }; limitsAt = Date.now(); return limitsVal;
}

// The cookie holds a random token; only its SHA-256 hash is stored, so a database leak can't be used to log in.
export async function createSession(userId: number) {
  // Suspended or archived accounts never get a session (the site admin is exempt).
  const st = await one<{ status: string; suspended: boolean }>("select t.status, u.suspended from users u left join tenants t on t.id=u.tenant_id where u.id=$1 and u.role<>'webappdev'", [userId]);
  if (st && st.suspended) redirect('/suspended?r=suspended');
  if (st && st.status && st.status !== 'active') redirect('/suspended?r=' + st.status);
  const token = newToken();
  const { maxDays } = await sessionLimits();
  await rows("insert into sessions(id,user_id,expires_at) values($1,$2,now() + ($3 || ' days')::interval)", [sha256(token), userId, String(maxDays)]);
  await rows('insert into login_events(session_id,user_id,tenant_id) select $1,id,tenant_id from users where id=$2', [sha256(token), userId]);
  await rows('update users set last_login_at=now(), login_count=login_count+1 where id=$1', [userId]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: maxDays * 86400 });
}
export async function destroySession() {
  const c = await cookies(); const t = c.get(COOKIE)?.value;
  if (t) await rows('delete from sessions where id=$1', [sha256(t)]);
  c.delete(COOKIE);
}
// Once per request (the layout and the page both ask): one query, and the activity heartbeat only when it is more than a minute old.
export const getMe = cache(async function getMe(): Promise<Me | null> {
  const t = (await cookies()).get(COOKIE)?.value; if (!t) return null;
  const h = sha256(t);
  const { idleHours } = await sessionLimits();
  const r = await one<Me & { stale: boolean }>(`select u.id,u.name,u.email,u.role,u.tenant_id, (s.last_active < now() - interval '1 minute') stale from sessions s join users u on u.id=s.user_id
    left join tenants t on t.id=u.tenant_id
    where s.id=$1 and s.expires_at > now() and ($2::numeric = 0 or s.last_active > now() - ($2::numeric * interval '1 hour')) and (u.role='webappdev' or (not u.suspended and (t.id is null or t.status='active')))`, [h, idleHours]);
  if (!r) return null;
  const { stale, ...me } = r;
  // Activity heartbeat (at most once a minute) so session length can be measured; stores no page content.
  if (stale) await rows("with a as (update sessions set last_active=now() where id=$1) update login_events set last_seen_at=now() where session_id=$1 and last_seen_at < now() - interval '1 minute'", [h]);
  return me;
});
export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) {
    const t = (await cookies()).get(COOKIE)?.value;
    const st = t ? await one<{ status: string }>(`select case when u.suspended then 'suspended' else tn.status end status from sessions s join users u on u.id=s.user_id left join tenants tn on tn.id=u.tenant_id where s.id=$1 and (u.suspended or tn.status<>'active')`, [sha256(t)]) : null;
    redirect(st ? '/suspended?r=' + st.status : '/signin');
  }
  return me;
}
