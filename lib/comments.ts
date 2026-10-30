import { rows } from './db';

// Comments are kept per Wall Template and Job (room_wall_id + job_id). A comment is "new" to someone when another person wrote it after they last opened that wall's plan.
export async function unreadByJob(userId: number): Promise<Record<number, number>> {
  const r = await rows(`select c.job_id, count(*)::int n from comments c join job_walls jw on jw.job_id=c.job_id and jw.room_wall_id=c.room_wall_id
    left join comment_seen s on s.user_id=$1 and s.job_id=c.job_id and s.room_wall_id=c.room_wall_id
    where c.room_wall_id is not null and c.user_id<>$1 and (s.seen_at is null or c.created_at > s.seen_at) group by c.job_id`, [userId]);
  return Object.fromEntries(r.map((x: any) => [x.job_id, x.n]));
}
export async function unreadByWall(userId: number): Promise<Record<string, number>> {
  const r = await rows(`select c.job_id, c.room_wall_id, count(*)::int n from comments c
    left join comment_seen s on s.user_id=$1 and s.job_id=c.job_id and s.room_wall_id=c.room_wall_id
    where c.room_wall_id is not null and c.user_id<>$1 and (s.seen_at is null or c.created_at > s.seen_at) group by c.job_id, c.room_wall_id`, [userId]);
  return Object.fromEntries(r.map((x: any) => [`${x.job_id}:${x.room_wall_id}`, x.n]));
}
export async function markSeen(userId: number, job: number, walls: number[]) {
  if (!walls.length) return;
  await rows('insert into comment_seen(user_id,job_id,room_wall_id,seen_at) select $1, $2, w, now() from unnest($3::int[]) w on conflict (user_id,job_id,room_wall_id) do update set seen_at=now()', [userId, job, walls]);
}
export const wallComments = (job: number, wall: number) => rows(`select c.id, c.body, c.created_at, coalesce(u.name, u.email, c.guest_email, 'Guest') who from comments c left join users u on u.id=c.user_id where c.job_id=$1 and c.room_wall_id=$2 order by c.id`, [job, wall]);
export async function wallCommentsFor(job: number, walls: number[]): Promise<Record<number, any[]>> {
  const out: Record<number, any[]> = Object.fromEntries(walls.map(w => [w, []]));
  if (!walls.length) return out;
  for (const c of await rows(`select c.id, c.room_wall_id, c.body, c.created_at, coalesce(u.name, u.email, c.guest_email, 'Guest') who from comments c left join users u on u.id=c.user_id where c.job_id=$1 and c.room_wall_id = any($2::int[]) order by c.id`, [job, walls])) out[c.room_wall_id].push(c);
  return out;
}
