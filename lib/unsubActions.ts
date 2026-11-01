'use server';
import { redirect } from 'next/navigation';
import { rows } from './db';
import { unsubValid } from './unsub';
import { CATEGORIES } from './mailConst';
// Public: signed link only, no sign-in. Re-checks the signature on every change.
export async function setOptOut(f: FormData) {
  const e = String(f.get('e') ?? '').toLowerCase(), c = String(f.get('c') ?? ''), t = String(f.get('t') ?? ''), out = f.get('out') === '1';
  if (!CATEGORIES[c] || !unsubValid(e, c, t)) redirect('/');
  if (out) await rows('insert into mail_optout(email,category) values($1,$2) on conflict(email,category) do nothing', [e, c]);
  else await rows('delete from mail_optout where email=$1 and category=$2', [e, c]);
  redirect(`/unsubscribe?e=${encodeURIComponent(e)}&c=${c}&t=${t}`);
}
