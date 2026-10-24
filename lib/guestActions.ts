'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'node:crypto';
import { one, rows } from './db';
import { requireMe, canManage } from './session';
import { allow, clientIp } from './security';
import { emailOn, sendMail, baseUrl } from './mail';
import { newToken, sha256 } from './password';
import { createGuestSession, destroyGuestSession, getGuest } from './guest';
import type { FormState } from './actions';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim().slice(0, 300);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const GENERIC = 'If that email matches the invitation, a 6-digit code is on its way. It is valid for 10 minutes.';

// ---- Tenant side: create / revoke shared wall links ----
export async function createWallLink(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const tenant = me.tenant_id ?? 0, job = Number(s(f, 'job')), wall = Number(s(f, 'wall'));
  const access = s(f, 'access') === 'view' ? 'view' : 'edit';
  if (!(await allow('wall-link', String(me.id), 60, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const ok = await one(`select 1 from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    join job_rooms jr on jr.job_id=j.id join room_walls rw on rw.room_id=jr.room_id where j.id=$1 and rw.id=$2 and b.tenant_id=$3`, [job, wall, tenant]);
  if (!ok) return { error: 'Choose a wall that belongs to this Job.' };
  // The guest must be one of this tenant's contacts, assigned to this Job's Production.
  const contact = await one(`select c.id, c.email from contacts c join production_contacts pc on pc.contact_id=c.id join jobs j on j.production_id=pc.production_id
    where c.id=$1 and c.tenant_id=$2 and j.id=$3`, [Number(s(f, 'contact')), tenant, job]);
  if (!contact) return { error: 'Choose a contact assigned to this Production.' };
  const email = contact.email as string;
  const token = newToken();
  await rows('insert into wall_links(job_id,room_wall_id,email,access,token_hash,created_by,contact_id) values($1,$2,$3,$4,$5,$6,$7)', [job, wall, email, access, sha256(token), me.id, contact.id]);
  const link = `${await baseUrl()}/w/${token}`;
  revalidatePath('/productions');
  const sent = await sendMail(email, 'A monitor wall has been shared with you', `${me.name} shared a monitor wall with you on Gallery Planner (${access === 'edit' ? 'you can edit it' : 'view only'}).\nOpen it here:\n${link}\n\nYou will be asked to confirm this email address with a one-time code. The link stops working when the Job ends.`);
  return { ok: sent ? `Link emailed to ${email}. They confirm with a code sent to that address.` : `Email sending is not set up. Send this link to ${email} (it only works for that email):`, link: sent ? undefined : link };
}
export async function revokeWallLink(f: FormData) {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  await rows(`update wall_links set revoked=true where id=$1 and job_id in (select j.id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$2)`, [Number(s(f, 'id')), me.tenant_id ?? 0]);
  await rows('delete from guest_sessions where link_id=$1', [Number(s(f, 'id'))]);
  revalidatePath('/productions');
}

// ---- Guest side: confirm the invited email with a one-time code ----
async function activeLink(token: string) {
  return one(`select wl.id, wl.email from wall_links wl join jobs j on j.id=wl.job_id
    where wl.token_hash=$1 and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date)`, [sha256(token)]);
}
export async function requestGuestCode(_: FormState, f: FormData): Promise<FormState> {
  const token = s(f, 'token'), email = s(f, 'email').toLowerCase();
  if (!(await allow('gcode-ip', await clientIp(), 15, 60)) || !(await allow('gcode-link', token.slice(0, 16), 6, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const link = await activeLink(token);
  if (!link) return { error: 'This link is no longer active. Ask for a new one.' };
  if (!emailOn() && process.env.DEV_SHOW_CODES !== '1') return { error: 'Email sending is not set up yet, so a code cannot be sent. Please contact the person who shared this wall.' };
  if (link.email === email) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await rows(`insert into link_codes(link_id,code_hash,expires_at,tries) values($1,$2,now() + interval '10 minutes',0)
      on conflict (link_id) do update set code_hash=$2, expires_at=now() + interval '10 minutes', tries=0`, [link.id, sha256(`${link.id}:${code}`)]);
    const sent = await sendMail(email, 'Your Gallery Planner code', `Your one-time code is ${code}. It is valid for 10 minutes. If you did not ask for it, ignore this email.`);
    if (!sent && process.env.DEV_SHOW_CODES === '1') return { step: 'code', ok: `Test mode (DEV_SHOW_CODES) - your code is ${code}` };
  }
  return { step: 'code', ok: GENERIC };
}
export async function verifyGuestCode(_: FormState, f: FormData): Promise<FormState> {
  const token = s(f, 'token'), code = s(f, 'code').replace(/\s/g, '');
  if (!(await allow('gverify-ip', await clientIp(), 30, 60))) return { step: 'code', error: 'Too many attempts. Please wait a while and try again.' };
  const link = await activeLink(token);
  if (!link) return { error: 'This link is no longer active. Ask for a new one.' };
  const row = await one('select code_hash, tries from link_codes where link_id=$1 and expires_at > now()', [link.id]);
  if (!row || row.tries >= 5) return { step: 'code', error: 'That code has expired. Request a new one.' };
  if (row.code_hash !== sha256(`${link.id}:${code}`)) { await rows('update link_codes set tries=tries+1 where link_id=$1', [link.id]); return { step: 'code', error: 'That code is not correct.' }; }
  await rows('delete from link_codes where link_id=$1', [link.id]);
  await createGuestSession(link.id);
  redirect(`/w/${token}`);
}
export async function guestSignOut() { await destroyGuestSession(); redirect('/signin'); }

// ---- Guest actions (scoped by the guest session, never by client-supplied ids) ----
export async function savePlanGuest(name: string, data: any) {
  const g = await getGuest(); if (!g || g.access !== 'edit') throw new Error('Not allowed');
  if (JSON.stringify(data ?? {}).length > 100_000) throw new Error('Too large');
  name = String(name).slice(0, 80) || 'Room Layout';
  const clean: any = {}; if (data?.[g.room_wall_id]) clean[g.room_wall_id] = data[g.room_wall_id]; // only this wall
  const ex = await one('select id from monitor_plans where link_id=$1 and name=$2', [g.link_id, name]);
  if (ex) await rows('update monitor_plans set data=$1, updated_at=now() where id=$2', [JSON.stringify(clean), ex.id]);
  else await rows('insert into monitor_plans(job_id,user_id,name,data,link_id) values($1,0,$2,$3,$4)', [g.job_id, name, JSON.stringify(clean), g.link_id]);
}
export async function addCommentGuest(f: FormData) {
  const g = await getGuest(); if (!g || g.access !== 'edit') throw new Error('Not allowed');
  const room = await one('select room_id from room_walls where id=$1', [g.room_wall_id]);
  const body = s(f, 'body').slice(0, 2000); if (!body) return;
  await rows('insert into comments(job_id,room_id,user_id,body,guest_email) values($1,$2,0,$3,$4)', [g.job_id, room.room_id, body, g.email]);
  revalidatePath('/w');
}
