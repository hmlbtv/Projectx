import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: any) => Promise<Buffer>;
const OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64, OPTS);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  // Always do the work, even for unknown users, so timing doesn't reveal which emails exist.
  const [, saltB64, keyB64] = (stored ?? DUMMY).split('$');
  const key = Buffer.from(keyB64, 'base64');
  const test = await scryptAsync(pw, Buffer.from(saltB64, 'base64'), key.length, OPTS);
  return !!stored && timingSafeEqual(key, test);
}
const DUMMY = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letters and at least one number.';
  return null;
}
