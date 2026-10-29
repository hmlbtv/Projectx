import { headers } from 'next/headers';
import { rows } from './db';

// Email goes through Resend. Without RESEND_API_KEY nothing is sent.
export const emailOn = () => !!process.env.RESEND_API_KEY;
// In production an address is never trusted without a verification email: sign-up is refused while email is not set up. (Local testing can still auto-verify.)
export const signupBlocked = () => !emailOn() && process.env.NODE_ENV === 'production';
export const SIGNUP_BLOCKED_MSG = 'Sign-up is temporarily unavailable because email verification is not set up. Please contact the site administrator.';
export const mailFrom = () => process.env.MAIL_FROM || 'TelePlanner <onboarding@resend.dev>';
// Like sendMail, but says why it failed (Resend's own message) so an admin can fix the setup.
// Every send attempt is logged (recipient, subject, result only - never the body, which holds sign-in links). Kept 30 days.
async function logMail(to: string, subject: string, r: { ok: boolean; error?: string; id?: string }) {
  try {
    await rows('insert into email_log(to_email,subject,ok,error,resend_id) values($1,$2,$3,$4,$5)', [to.slice(0, 200), subject.slice(0, 200), r.ok, r.error ?? null, r.id ?? null]);
    if (Math.random() < 0.05) await rows("delete from email_log where at < now() - interval '30 days'");
  } catch { /* logging must never break sending */ }
}
export type MailExtra = { html?: string; images?: { cid: string; png: Buffer }[] };
export async function sendMailDetailed(to: string, subject: string, text: string, extra?: MailExtra) {
  const r = await send(to, subject, text, extra); await logMail(to, subject, r); return r;
}
async function send(to: string, subject: string, text: string, extra?: MailExtra): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!emailOn()) return { ok: false, error: 'RESEND_API_KEY is not set on this deployment.' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mailFrom(), to, subject, text, ...(extra?.html ? { html: extra.html } : {}),
        ...(extra?.images?.length ? { attachments: extra.images.map(i => ({ filename: `${i.cid}.png`, content: i.png.toString('base64'), content_id: i.cid, content_type: 'image/png' })) } : {}) }) });
    const j: any = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j.id } : { ok: false, error: `Resend ${r.status}: ${String(j.message ?? j.error ?? 'request failed').slice(0, 300)}` };
  } catch { return { ok: false, error: 'Could not reach Resend.' }; }
}
export async function sendMail(to: string, subject: string, text: string, extra?: MailExtra) { return (await sendMailDetailed(to, subject, text, extra)).ok; }
export async function baseUrl() {
  // Links in emails must not depend on the request's Host header (host-header poisoning).
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`; // the dev site's own links, never the live site's
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers(); return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}
