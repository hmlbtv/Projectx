import { headers } from 'next/headers';
import { one, rows } from './db';

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim();
}

// Simple database-backed rate limit: at most `max` hits of `action` per `key` in the last `minutes`.
// Returns true if the caller is allowed (and records the hit).
export async function allow(action: string, key: string, max: number, minutes: number): Promise<boolean> {
  const k = `${action}:${key}`.slice(0, 200);
  const r = await one("select count(*)::int c from attempts where key=$1 and at > now() - ($2 || ' minutes')::interval", [k, String(minutes)]);
  if (r.c >= max) return false;
  await rows('insert into attempts(key) values($1)', [k]);
  if (Math.random() < 0.02) { // occasional housekeeping
    await rows("delete from attempts where at < now() - interval '1 day'");
    await rows('delete from sessions where expires_at < now()');
  }
  return true;
}
