import { cookies } from 'next/headers';
import { one, rows } from './db';
import { newToken, sha256 } from './password';

const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-gp_guest' : 'gp_guest';
export type Guest = { link_id: number; job_id: number; room_wall_id: number; email: string; access: 'edit' | 'view' };

export async function createGuestSession(linkId: number) {
  const token = newToken();
  await rows("insert into guest_sessions(id,link_id,expires_at) values($1,$2,now() + interval '12 hours')", [sha256(token), linkId]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 12 * 3600 });
}
export async function destroyGuestSession() {
  const c = await cookies(); const t = c.get(COOKIE)?.value;
  if (t) await rows('delete from guest_sessions where id=$1', [sha256(t)]);
  c.delete(COOKIE);
}
// A guest session only counts while its link is active and the Job has not expired.
export async function getGuest(): Promise<Guest | null> {
  const t = (await cookies()).get(COOKIE)?.value; if (!t) return null;
  return (await one<Guest>(`select wl.id link_id, wl.job_id, wl.room_wall_id, wl.email, wl.access
    from guest_sessions gs join wall_links wl on wl.id=gs.link_id join jobs j on j.id=wl.job_id
    where gs.id=$1 and gs.expires_at > now() and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date)`, [sha256(t)])) ?? null;
}
