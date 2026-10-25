import { headers } from 'next/headers';

// Email goes through Resend. Without RESEND_API_KEY nothing is sent.
export const emailOn = () => !!process.env.RESEND_API_KEY;
export const mailFrom = () => process.env.MAIL_FROM || 'TelePlanner <onboarding@resend.dev>';
// Like sendMail, but says why it failed (Resend's own message) so an admin can fix the setup.
export async function sendMailDetailed(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!emailOn()) return { ok: false, error: 'RESEND_API_KEY is not set on this deployment.' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mailFrom(), to, subject, text }) });
    const j: any = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j.id } : { ok: false, error: `Resend ${r.status}: ${String(j.message ?? j.error ?? 'request failed').slice(0, 300)}` };
  } catch { return { ok: false, error: 'Could not reach Resend.' }; }
}
export async function sendMail(to: string, subject: string, text: string) { return (await sendMailDetailed(to, subject, text)).ok; }
export async function baseUrl() {
  // Links in emails must not depend on the request's Host header (host-header poisoning).
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers(); return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}
