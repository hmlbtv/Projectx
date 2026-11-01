'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { rows, one } from './db';
import { requireMe } from './session';
import { brandedMail } from './brandMail';
import { mailTemplates as T } from './mailTemplates';
import { loadInterest, loadOptouts } from './interestList';
import { unsubUrl } from './unsub';

import { ROLES, TEST_ADDRESS } from './mailConst';
const ROLE_LABEL: Record<string, string> = { user: 'All User accounts', manager: 'All Manager accounts', admin: 'All Admin accounts', master_admin: 'All Master admin accounts', webappdev: 'All Site developer accounts', onetime: 'All guest (invited) accounts' };
const ok = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const mails = (t: string) => t.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(ok);
async function dev() { const me = await requireMe(); if (me.role !== 'webappdev') redirect('/'); return me; }

// One audience token: role:<role>, interest, group:<id>. Returns the email addresses it covers.
async function resolve(tok: string): Promise<string[]> {
  if (tok.startsWith('role:')) { const r = tok.slice(5); if (!ROLES.includes(r)) return []; return (await rows('select email from users where role=$1 and not coalesce(suspended,false)', [r])).map((x: any) => String(x.email).toLowerCase()); }
  if (tok === 'interest') { try { return (await loadInterest()).list.map((x: any) => String(x.email).toLowerCase()); } catch { return []; } }
  if (tok.startsWith('group:')) { const g = await one('select emails from mail_groups where id=$1', [Number(tok.slice(6)) || 0]); return g ? mails(g.emails) : []; }
  return [];
}
export async function audienceOptions() {
  await dev();
  const out: { tok: string; label: string; n: number; emails: string[] }[] = [];
  const add = (tok: string, label: string, l: string[]) => { const emails = [...new Set(l)].sort(); out.push({ tok, label, n: emails.length, emails }); };
  for (const r of ROLES) add('role:' + r, ROLE_LABEL[r], await resolve('role:' + r));
  add('interest', 'Registered interest (holding page)', await resolve('interest'));
  for (const g of await rows('select id,name,emails from mail_groups order by name')) add('group:' + g.id, 'Group: ' + g.name, mails(g.emails));
  return out;
}
// The people ticked in the picker (each address individually) plus any typed-in addresses.
function recipients(to: string[], extra: string) { return [...new Set([...to.map(x => x.trim().toLowerCase()).filter(ok), ...mails(extra)])]; }

export async function newMail() { const me = await dev(); const r = await one("insert into mail_messages(created_by) values($1) returning id", [me.id]); redirect('/mail/' + r.id); }

// One form, several buttons (act): save | test | signoff | send
export async function mailAction(_: any, f: FormData): Promise<{ msg?: string; error?: string } | undefined> {
  const me = await dev(); const id = Number(f.get('id'));
  const m = await one('select * from mail_messages where id=$1', [id]); if (!m) return { error: 'Email not found.' };
  if (m.status === 'sent') return { error: 'This email has already been sent. Duplicate it to send again.' };
  const act = String(f.get('act'));
  const subject = String(f.get('subject') ?? '').trim().slice(0, 150), body = String(f.get('body') ?? '').trim().slice(0, 8000);
  const cat = f.get('category') === 'important' ? 'important' : 'marketing';
  const bl = String(f.get('btn_label') ?? '').trim().slice(0, 60), bu = String(f.get('btn_url') ?? '').trim().slice(0, 500);
  if (bu && !/^https?:\/\//i.test(bu)) return { error: 'The button link must start with https://' };
  const changed = subject !== m.subject || body !== m.body || bl !== m.btn_label || bu !== m.btn_url || cat !== m.category;
  if (changed) await rows("update mail_messages set subject=$2,body=$3,btn_label=$4,btn_url=$5,category=$6,updated_at=now(),status='draft',tested_at=null,signed_off_at=null,signed_off_by=null where id=$1", [id, subject, body, bl, bu, cat]);
  const cur = changed ? 'draft' : m.status;
  if (act === 'save') { return { msg: changed ? 'Saved. Any earlier test or sign-off was cleared because the email changed.' : 'Saved.' }; }
  if (!subject || !body) return { error: 'Please enter a subject and a message first.' };
  const btn = bl && bu ? { label: bl, url: bu } : undefined; const mk = (to: string) => T.announcement(subject, body, btn, cat, unsubUrl(to, cat));
  const t = mk(TEST_ADDRESS);
  if (act === 'test') {
    const sent = await brandedMail(TEST_ADDRESS, `[Test] ${t.subject}`, t.text, t.b);
    if (!sent) return { error: 'Could not send the test email.' };
    await rows("update mail_messages set status='tested',tested_at=now(),signed_off_at=null,signed_off_by=null where id=$1", [id]); revalidatePath('/mail/' + id);
    return { msg: `Test sent to ${TEST_ADDRESS}. Check it, then sign it off.` };
  }
  if (act === 'signoff') {
    if (cur !== 'tested') return { error: 'Send a test and check it before signing off.' };
    await rows("update mail_messages set status='signed_off',signed_off_at=now(),signed_off_by=$2 where id=$1", [id, me.id]); revalidatePath('/mail/' + id); return { msg: 'Signed off. You can now choose who to send it to.' };
  }
  if (act === 'send') {
    if (cur !== 'signed_off') return { error: 'Sign the email off before sending.' };
    if (f.get('confirm') !== 'yes') return { error: 'Tick the box to confirm.' };
    const to = f.getAll('to').map(String), extra = String(f.get('extra') ?? '');
    const all = recipients(to, extra); const outs = new Set((await loadOptouts().catch(() => [])).filter(o => o.category === cat).map(o => String(o.email).toLowerCase()));
    const list = all.filter(e => !outs.has(e)), skipped = all.length - list.length;
    if (!list.length) return { error: skipped ? 'Everyone chosen has unsubscribed from this kind of email.' : 'Choose at least one person or address.' };
    // claim the email first so a double click cannot send it twice
    const claim = await one("update mail_messages set status='sending' where id=$1 and status='signed_off' returning id", [id]); if (!claim) return { error: 'Already sending.' };
    const chosen = new Set(list); const labels = (await audienceOptions()).map(o => ({ o, k: o.emails.filter(e => chosen.has(e)).length })).filter(x => x.k).map(x => `${x.o.label} (${x.k === x.o.n ? 'all ' + x.k : x.k + ' of ' + x.o.n})`); if (mails(extra).length) labels.push(`${mails(extra).length} individual address${mails(extra).length === 1 ? '' : 'es'}`);
    let n = 0;
    for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(async e => { const tt = mk(e); const s = await brandedMail(e, tt.subject, tt.text, tt.b); if (s) n++; await rows('insert into mail_sends(message_id,email,ok) values($1,$2,$3)', [id, e, s]); }));
    await rows("update mail_messages set status='sent',sent_at=now(),sent_by=$2,audience=$3,sent_count=$4,skipped=$5 where id=$1", [id, me.id, labels.join(', '), n, skipped]);
    revalidatePath('/mail'); redirect('/mail/' + id);
  }
  return undefined;
}
export async function duplicateMail(f: FormData) { const me = await dev(); const m = await one('select subject,body,btn_label,btn_url from mail_messages where id=$1', [Number(f.get('id'))]); if (!m) redirect('/mail');
  const r = await one('insert into mail_messages(subject,body,btn_label,btn_url,created_by) values($1,$2,$3,$4,$5) returning id', [m.subject, m.body, m.btn_label, m.btn_url, me.id]); redirect('/mail/' + r.id); }
export async function deleteDraft(f: FormData) { await dev(); await rows("delete from mail_messages where id=$1 and status<>'sent'", [Number(f.get('id'))]); redirect('/mail'); }
export async function saveGroup(f: FormData) { await dev(); const name = String(f.get('name') ?? '').trim().slice(0, 80); if (!name) return;
  await rows('insert into mail_groups(name,emails) values($1,$2) on conflict(name) do update set emails=excluded.emails', [name, mails(String(f.get('emails') ?? '')).join('\n')]); revalidatePath('/mail'); }
export async function deleteGroup(f: FormData) { await dev(); await rows('delete from mail_groups where id=$1', [Number(f.get('id'))]); revalidatePath('/mail'); }
