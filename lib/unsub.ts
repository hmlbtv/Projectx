import { createHmac, timingSafeEqual } from 'node:crypto';
// Unsubscribe links work without signing in: each carries a signature of (address, kind of email) made with UNSUB_SECRET, shared by the live and dev sites.
const secret = () => process.env.UNSUB_SECRET || 'dev-only-unsub-secret';
export const unsubToken = (email: string, cat: string) => createHmac('sha256', secret()).update(`${email.toLowerCase()}|${cat}`).digest('hex').slice(0, 32);
export function unsubValid(email: string, cat: string, t: string) { const a = Buffer.from(unsubToken(email, cat)), b = Buffer.from(String(t)); return a.length === b.length && timingSafeEqual(a, b); }
// Always points at the live site, so opt-outs are recorded in one place whichever site sent the email.
export const unsubUrl = (email: string, cat: string) => `${(process.env.UNSUB_BASE || 'https://www.teleplanner.tv').replace(/\/$/, '')}/unsubscribe?e=${encodeURIComponent(email.toLowerCase())}&c=${cat}&t=${unsubToken(email, cat)}`;
