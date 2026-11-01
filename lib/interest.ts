'use server';
import { rows } from './db';
import { allow, clientIp } from './security';
import { brandedMail, escMail as e } from './brandMail';
import { mailTemplates as T } from './mailTemplates';

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
