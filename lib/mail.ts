import { headers } from 'next/headers';

// Email goes through Resend. Without RESEND_API_KEY nothing is sent.
export const emailOn = () => !!process.env.RESEND_API_KEY;
export async function sendMail(to: string, subject: string, text: string) {
  if (!emailOn()) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'Gallery Planner <onboarding@resend.dev>', to, subject, text }) });
  return r.ok;
}
export async function baseUrl() {
  // Links in emails must not depend on the request's Host header (host-header poisoning).
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers(); return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}
