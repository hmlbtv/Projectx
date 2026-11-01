'use server';
import { rows } from './db';
import { allow, clientIp } from './security';
import { brandedMail, escMail as e } from './brandMail';
import { mailTemplates as T } from './mailTemplates';
import { requireMe } from './session';
import { devSite } from './devmode';
import { loadInterest } from './interestList';

const clean = (v: FormDataEntryValue | null, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
// Holding-page "register your interest" form: saved, then emailed to info@teleplanner.tv.
export async function registerInterest(_: any, f: FormData): Promise<{ ok?: boolean; error?: string } | undefined> {
  if (clean(f.get('website'), 50)) return { ok: true }; // hidden field only bots fill in
  const name = clean(f.get('name'), 120), company = clean(f.get('company'), 160), email = clean(f.get('email'), 200), comment = String(f.get('comment') ?? '').trim().slice(0, 2000);
  if (!name) return { error: 'Please enter your name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Please enter a valid email address.' };
  if (!(await allow('interest', await clientIp(), 5, 60))) return { error: 'Too many requests. Please try again later.' };
  await rows('insert into interest(name,company,email,comment) values($1,$2,$3,$4)', [name, company, email.toLowerCase(), comment]);
  const text = `New TelePlanner interest\nName: ${name}\nCompany: ${company || '-'}\nEmail: ${email}\nComment: ${comment || '-'}`;
  await brandedMail('info@teleplanner.tv', `Interest in TelePlanner: ${name}`, text, { heading: 'New interest in TelePlanner',
    lines: [`<b>Name:</b> ${e(name)}`, `<b>Company:</b> ${e(company || '-')}`, `<b>Email:</b> ${e(email)}`, `<b>Comment:</b> ${e(comment || '-').replace(/\n/g, '<br>')}`], small: 'Sent from the teleplanner.tv holding page.' });
  const t = T.interestThanks(name); await brandedMail(email, t.subject, t.text, t.b); // thank-you reply to the person
  return { ok: true };
}

// Dev site only: email everyone who registered (read from the live list). mode=test sends one copy to the signed-in user.
export async function sendInterestMail(_: any, f: FormData): Promise<{ msg?: string; error?: string } | undefined> {
  const me = await requireMe(); if (me.role !== 'webappdev' || !devSite()) return { error: 'Not allowed.' };
  const subject = clean(f.get('subject'), 150), body = String(f.get('body') ?? '').trim().slice(0, 5000);
  if (!subject || !body) return { error: 'Please enter a subject and a message.' };
  const t = T.interestBroadcast(subject, body);
  if (f.get('mode') === 'test') { const ok = await brandedMail(me.email, `[Test] ${t.subject}`, t.text, t.b); return ok ? { msg: `Test sent to ${me.email}.` } : { error: 'Could not send the test email.' }; }
  if (f.get('confirm') !== 'yes') return { error: 'Tick the box to confirm you want to email everyone.' };
  const { list } = await loadInterest(); const seen = new Set<string>(); let sent = 0, failed = 0;
  for (const i of list) { const em = String(i.email).toLowerCase(); if (seen.has(em)) continue; seen.add(em);
    (await brandedMail(em, t.subject, t.text, t.b)) ? sent++ : failed++; }
  return { msg: `Sent to ${sent} ${sent === 1 ? 'person' : 'people'}${failed ? `, ${failed} failed` : ''}.` };
}
