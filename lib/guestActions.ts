'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, createSession, type Me } from './session';
import { myEmails } from './emails';
import { allow, clientIp } from './security';
import { emailOn, sendMail, baseUrl } from './mail';
import { newToken, sha256, hashPassword, passwordProblem } from './password';
import type { FormState } from './actions';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim().slice(0, 300);

// ---- Tenant side: share a wall with a contact (an invitation tied to the contact's email) ----
export async function createWallLink(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const tenant = me.tenant_id ?? 0, job = Number(s(f, 'job')), wall = Number(s(f, 'wall'));
  const access = s(f, 'access') === 'view' ? 'view' : 'edit';
  if (!(await allow('wall-link', String(me.id), 60, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const ok = await one(`select 1 from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    join job_walls jw on jw.job_id=j.id join room_walls rw on rw.id=jw.room_wall_id where j.id=$1 and rw.id=$2 and b.tenant_id=$3`, [job, wall, tenant]);
  if (!ok) return { error: 'Choose a wall that belongs to this Job.' };
  const contact = await one(`select c.id, c.email from contacts c join production_contacts pc on pc.contact_id=c.id join jobs j on j.production_id=pc.production_id
    where c.id=$1 and c.tenant_id=$2 and j.id=$3`, [Number(s(f, 'contact')), tenant, job]);
  if (!contact) return { error: 'Choose a contact assigned to this Production.' };
  const email = contact.email as string, token = newToken();
  await rows('insert into wall_links(job_id,room_wall_id,email,access,token_hash,created_by,contact_id) values($1,$2,$3,$4,$5,$6,$7)', [job, wall, email, access, sha256(token), me.id, contact.id]);
  const link = `${await baseUrl()}/w/${token}`;
  revalidatePath('/productions');
  const sent = await sendMail(email, 'A monitor wall has been shared with you', `${me.name} shared a monitor wall with you on TelePlanner (${access === 'edit' ? 'you can edit it' : 'view only'}).\nOpen this link to sign in or create your account:\n${link}\n\nThe account is tied to this email address. All walls shared with you appear in one place after you sign in. Access ends when the Job ends.`);
  return { ok: sent ? `Invitation emailed to ${email}.` : `Email sending is not set up. Send this link to ${email}:`, link: sent ? undefined : link };
}
export async function revokeWallLink(f: FormData) {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  await rows(`update wall_links set revoked=true where id=$1 and job_id in (select j.id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$2)`, [Number(s(f, 'id')), me.tenant_id ?? 0]);
  revalidatePath('/productions');
}

// ---- Guest account: created the first time someone opens an invitation link ----
export async function signUpGuest(_: FormState, f: FormData): Promise<FormState> {
  if (s(f, 'website')) return { error: 'Could not create the account.' };
  if (!(await allow('signup', await clientIp(), 5, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const link = await one(`select wl.email from wall_links wl join jobs j on j.id=wl.job_id where wl.token_hash=$1 and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date) and (select tn.status from tenants tn join broadcasters bb on bb.tenant_id=tn.id join productions pp on pp.broadcaster_id=bb.id where pp.id=j.production_id)='active'`, [sha256(s(f, 'token'))]);
  if (!link) return { error: 'This invitation is no longer active. Ask for a new one.' };
  const name = s(f, 'name').slice(0, 100), pw = String(f.get('password') ?? '');
  if (!name) return { error: 'Enter your name.' };
  if (pw !== String(f.get('password2') ?? '')) return { error: 'Passwords do not match.' };
  const bad = passwordProblem(pw); if (bad) return { error: bad };
  if ((await one('select 1 from users where email=$1', [link.email])) || (await one('select 1 from user_emails where email=$1 and verified', [link.email.toLowerCase()]))) return { error: 'An account with this email already exists. Sign in instead.' };
  const verify = emailOn(), vt = newToken();
  const u = (await one(`insert into users(tenant_id,email,name,role,password_hash,email_verified,verify_hash,verify_expires)
    values(null,$1,$2,'onetime',$3,$4,$5,now() + interval '2 days') returning id`, [link.email, name, await hashPassword(pw), !verify, verify ? sha256(vt) : null]))!;
  if (verify) {
    if (await sendMail(link.email, 'Verify your TelePlanner account', `Welcome to TelePlanner.\nConfirm your email to open the wall shared with you:\n${await baseUrl()}/verify/${vt}\n\nThis link expires in 2 days.`))
      return { ok: `We sent a verification link to ${link.email}. Open it to finish creating your account.` };
    await rows('delete from users where id=$1', [u.id]); // never let an unverified address in
    return { error: 'We could not send the verification email, so the account was not created. Please try again, or ask the person who invited you for help.' };
  }
  await createSession(u.id);
  redirect('/shared');
}

// ---- Guest actions: access comes from the signed-in account's verified email, never from client-supplied ids ----
async function linkAccess(me: Me, linkId: number) {
  return one(`select wl.id, wl.job_id, wl.room_wall_id, wl.access, rw.room_id from wall_links wl join jobs j on j.id=wl.job_id join room_walls rw on rw.id=wl.room_wall_id
    where wl.id=$1 and lower(wl.email) in ${myEmails(2)} and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date) and (select tn.status from tenants tn join broadcasters bb on bb.tenant_id=tn.id join productions pp on pp.broadcaster_id=bb.id where pp.id=j.production_id)='active'`, [linkId, me.id]);
}
export async function savePlanLink(linkId: number, name: string, data: any) {
  const me = await requireMe(); const l = await linkAccess(me, linkId); if (!l || l.access !== 'edit') throw new Error('Not allowed');
  if (JSON.stringify(data ?? {}).length > 100_000) throw new Error('Too large');
  name = String(name).slice(0, 80) || 'Room Layout';
  const clean: any = {}; if (data?.[l.room_wall_id]) clean[l.room_wall_id] = data[l.room_wall_id]; // only this wall
  const ex = await one('select id from monitor_plans where link_id=$1 and user_id=$2 and name=$3', [l.id, me.id, name]);
  if (ex) await rows('update monitor_plans set data=$1, updated_at=now() where id=$2', [JSON.stringify(clean), ex.id]);
  else await rows('insert into monitor_plans(job_id,user_id,name,data,link_id) values($1,$2,$3,$4,$5)', [l.job_id, me.id, name, JSON.stringify(clean), l.id]);
}
export async function addCommentLink(f: FormData) {
  const me = await requireMe(); const l = await linkAccess(me, Number(s(f, 'link'))); if (!l || l.access !== 'edit') throw new Error('Not allowed');
  const body = s(f, 'body').slice(0, 2000); if (!body) return;
  await rows('insert into comments(job_id,room_id,user_id,body) values($1,$2,$3,$4)', [l.job_id, l.room_id, me.id, body]);
  revalidatePath('/shared');
}

// Send an invitation to a different contact (or resend to the same one). The old link stops working.
export async function reassignWallLink(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const tenant = me.tenant_id ?? 0;
  if (!(await allow('wall-link', String(me.id), 60, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const wl = await one(`select wl.id, wl.job_id, wl.access from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    where wl.id=$1 and b.tenant_id=$2 and not wl.revoked`, [Number(s(f, 'id')), tenant]);
  if (!wl) return { error: 'Link not found.' };
  const contact = await one(`select c.id, c.email from contacts c join production_contacts pc on pc.contact_id=c.id join jobs j on j.production_id=pc.production_id
    where c.id=$1 and c.tenant_id=$2 and j.id=$3`, [Number(s(f, 'contact')), tenant, wl.job_id]);
  if (!contact) return { error: 'Choose a contact assigned to this Production.' };
  const token = newToken();
  await rows('update wall_links set email=$1, contact_id=$2, token_hash=$3 where id=$4', [contact.email, contact.id, sha256(token), wl.id]);
  const link = `${await baseUrl()}/w/${token}`; revalidatePath('/productions');
  const sent = await sendMail(contact.email, 'A monitor wall has been shared with you', `${me.name} shared a monitor wall with you on TelePlanner (${wl.access === 'edit' ? 'you can edit it' : 'view only'}).\nOpen this link to sign in or create your account:\n${link}\n\nAccess ends when the Job ends.`);
  return { ok: sent ? `New link emailed to ${contact.email}. The previous link no longer works.` : `Email sending is not set up. Send this new link to ${contact.email} (the previous link no longer works):`, link: sent ? undefined : link };
}
