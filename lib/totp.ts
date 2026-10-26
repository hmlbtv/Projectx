import { createHmac, createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
// Authenticator-app codes (RFC 6238 TOTP: HMAC-SHA1, 30 second steps, 6 digits). Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden...
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret(): string { const b = randomBytes(20); let bits = '', out = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function b32decode(s: string): Buffer { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); } const out: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter)); const h = createHmac('sha1', b32decode(secret)).update(buf).digest(); const o = h[h.length - 1] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1_000_000).padStart(6, '0');
}
/** Returns the matching time step (so it can't be used twice) or null. Allows one step either side for clock drift. */
export function checkCode(secret: string, code: string, after = 0, now = Date.now()): number | null {
  const c = code.replace(/\s/g, ''); if (!/^\d{6}$/.test(c)) return null; const step = Math.floor(now / 30000);
  for (const d of [0, -1, 1]) { const n = step + d; if (n <= after) continue; const want = Buffer.from(hotp(secret, n)), got = Buffer.from(c); if (want.length === got.length && timingSafeEqual(want, got)) return n; }
  return null;
}
export const otpUri = (secret: string, email: string) => `otpauth://totp/${encodeURIComponent('TelePlanner:' + email)}?secret=${secret}&issuer=TelePlanner&algorithm=SHA1&digits=6&period=30`;
// The secret is stored encrypted, so a copy of the database alone is not enough to make codes. Set TOTP_KEY on the host to use your own key.
const key = () => createHash('sha256').update(process.env.TOTP_KEY || process.env.DATABASE_URL || 'teleplanner-dev').digest();
export function seal(s: string): string { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv); const enc = Buffer.concat([c.update(s, 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.'); }
export function unseal(s: string): string | null { try { const [iv, tag, enc] = s.split('.').map(x => Buffer.from(x, 'base64')); const d = createDecipheriv('aes-256-gcm', key(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); } catch { return null; } }
export function newRecoveryCodes(): string[] { return Array.from({ length: 8 }, () => { const b = randomBytes(5).toString('hex'); return b.slice(0, 5) + '-' + b.slice(5); }); }
