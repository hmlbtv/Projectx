'use server';
import { audited } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, createSession, type Me } from './session';
import { myEmails } from './emails';
import { allow, clientIp } from './security';
import { wallPng, markPng } from './wallPng';
import { emailOn, signupBlocked, SIGNUP_BLOCKED_MSG, sendMail, baseUrl } from './mail';
import { newToken, sha256, hashPassword, passwordProblem } from './password';
import type { FormState } from './actions';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim().slice(0, 300);

// ---- Tenant side: share a wall with a contact (an invitation tied to the contact's email) ----
async function createWallLink_(_: FormState, f: FormData): Promise<FormState> {
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
async function revokeWallLink_(f: FormData) {
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
  if ((await one('select 1 from users where email=$1', [link.email]))) return { error: 'An account with this email already exists. Sign in instead.' };
  if (signupBlocked()) return { error: SIGNUP_BLOCKED_MSG };
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
async function reassignWallLink_(_: FormState, f: FormData): Promise<FormState> {
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

// ---- Invitations from Monitor Plans: one person, any number of the Job's walls, a contact or any email address ----
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function jobFor(me: Me, job: number) {
  return one(`select j.id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1 and b.tenant_id=$2`, [job, me.tenant_id ?? 0]);
}
const wallsOf = async (job: number, ids: number[]) => ids.length ? (await rows('select jw.room_wall_id id from job_walls jw where jw.job_id=$1 and jw.room_wall_id = any($2::int[])', [job, ids])).map((r: any) => r.id as number) : [];
const ids = (f: FormData) => Array.from(new Set(f.getAll('wall').map(x => Number(x)).filter(n => Number.isInteger(n) && n > 0)));
async function inviteToWalls_(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const tenant = me.tenant_id ?? 0, job = Number(s(f, 'job')); if (!(await jobFor(me, job))) return { error: 'Job not found.' };
  if (!(await allow('wall-link', String(me.id), 60, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const access = s(f, 'access') === 'view' ? 'view' : 'edit';
  const walls = await wallsOf(job, ids(f)); if (walls.length === 0) return { error: 'Tick at least one wall.' };
  let email = s(f, 'email').toLowerCase(), contactId: number | null = null;
  if (!email) { const c = await one('select id, email from contacts where id=$1 and tenant_id=$2', [Number(s(f, 'contact')), tenant]); if (c) { email = String(c.email).toLowerCase(); contactId = c.id; } }
  if (!EMAIL.test(email) || email.length > 200) return { error: 'Choose a contact or type a valid email address.' };
  let first = '';
  for (const w of walls) {
    const ex = await one('select id from wall_links where job_id=$1 and room_wall_id=$2 and lower(email)=$3 and not revoked', [job, w, email]);
    if (ex) { await rows('update wall_links set access=$1 where id=$2', [access, ex.id]); continue; }
    const token = newToken(); if (!first) first = token;
    await rows('insert into wall_links(job_id,room_wall_id,email,access,token_hash,created_by,contact_id) values($1,$2,$3,$4,$5,$6,$7)', [job, w, email, access, sha256(token), me.id, contactId]);
  }
  revalidatePath('/plans');
  if (!first) return { ok: `${email} already had these walls. Their access is now ${access === 'edit' ? 'can edit' : 'view only'}.` };
  const link = `${await baseUrl()}/w/${first}`;
  const who = access === 'edit' ? 'you can edit' : 'view only', many = walls.length === 1 ? '' : 's';
  const text = `${me.name} shared ${walls.length} monitor wall${many} with you on teleplanner.tv (${who}).\nOpen this link to sign in or create your account:\n${link}\n\nThe account is tied to this email address. Everything shared with you appears in one place after you sign in. Access ends when the Job ends.`;
  // Pictures of the walls they were invited to, shown under the button.
  const shown = await rows('select rw.id, rw.name, wt.data from room_walls rw join wall_templates wt on wt.id=rw.wall_template_id where rw.id = any($1::int[]) order by rw.id limit 6', [walls]);
  const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const images: { cid: string; png: Buffer }[] = [];
  const mark = await markPng(); if (mark) images.push({ cid: 'tpmark', png: mark });
  for (const w of shown) { const png = await wallPng(Array.isArray(w.data?.assets) ? w.data.assets : [], 480, me.tenant_id); if (png) images.push({ cid: `wall${w.id}`, png }); }
  const font = "font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
  const html = `<div style="background:#f3f5f8;padding:24px 12px;${font};color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse">
<tr><td style="background:#0f1217;border-bottom:3px solid #e5352b;padding:16px 22px;border-radius:12px 12px 0 0">
 <table role="presentation" cellpadding="0" cellspacing="0"><tr>${mark ? '<td style="padding-right:12px"><img src="cid:tpmark" width="40" height="33" alt="" style="display:block"></td>' : ''}
 <td style="color:#fff;font-size:24px;letter-spacing:-0.02em;line-height:1"><b>Tele</b>Planner</td></tr></table>
 <div style="color:#9aa4b2;font-size:11px;letter-spacing:.22em;text-transform:uppercase;margin-top:6px">teleplanner.tv · Monitor plans for live production</div></td></tr>
<tr><td style="background:#fff;padding:26px 22px;border-radius:0 0 12px 12px">
 <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111">${esc(me.name)} shared ${walls.length === 1 ? 'a monitor wall' : `${walls.length} monitor walls`} with you on <b>teleplanner.tv</b></p>
 <div style="height:14px;line-height:14px">&nbsp;</div>
 <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr><td style="background:#e5352b;border-radius:8px"><a href="${link}" style="display:inline-block;padding:13px 26px;color:#fff;font-size:16px;font-weight:700;text-decoration:none;${font}">Open my Monitor Plans</a></td></tr></table>
 <p style="margin:0 0 18px;color:#777;font-size:12px">Button not working? Copy this link into your browser:<br><a href="${link}" style="color:#777;word-break:break-all">${link}</a></p>
 ${shown.map((w: any) => `<p style="margin:16px 0 6px;font-size:15px"><b>${esc(String(w.name))}</b></p>${images.some(i => i.cid === `wall${w.id}`) ? `<img src="cid:wall${w.id}" alt="${esc(String(w.name))}" width="556" style="max-width:100%;height:auto;border-radius:8px;display:block">` : ''}`).join('')}
 <p style="margin:22px 0 0;color:#777;font-size:12px;border-top:1px solid #e5e7eb;padding-top:14px">You will sign in or create your account with this email address. Everything shared with you appears in one place after you sign in. Access ends when the Job ends.</p></td></tr></table></div>`;
  const sent = await sendMail(email, 'Monitor plans have been shared with you on teleplanner.tv', text, { html, images });
  return { ok: sent ? `Invitation emailed to ${email}.` : `Email sending is not set up. Send this link to ${email}:`, link: sent ? undefined : link };
}
// Change what an invited person can open: tick or untick walls, switch edit / view only. Unticked walls are switched off, ticked new ones are added.
async function updateInvite_(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const job = Number(s(f, 'job')); if (!(await jobFor(me, job))) return { error: 'Job not found.' };
  const email = s(f, 'email').toLowerCase(), access = s(f, 'access') === 'view' ? 'view' : 'edit', want = await wallsOf(job, ids(f));
  const cur = await rows('select id, room_wall_id from wall_links where job_id=$1 and lower(email)=$2 and not revoked', [job, email]);
  if (cur.length === 0) return { error: 'Invitation not found.' };
  const have = new Set(cur.map((c: any) => c.room_wall_id as number)), contact = (await one('select contact_id from wall_links where job_id=$1 and lower(email)=$2 and contact_id is not null limit 1', [job, email]))?.contact_id ?? null;
  for (const c of cur) if (!want.includes(c.room_wall_id)) await rows('update wall_links set revoked=true where id=$1', [c.id]);
  await rows('update wall_links set access=$1 where job_id=$2 and lower(email)=$3 and not revoked', [access, job, email]);
  for (const w of want) if (!have.has(w)) await rows('insert into wall_links(job_id,room_wall_id,email,access,token_hash,created_by,contact_id) values($1,$2,$3,$4,$5,$6,$7)', [job, w, email, access, sha256(newToken()), me.id, contact]);
  revalidatePath('/plans'); revalidatePath('/shared');
  return { ok: want.length ? 'Saved.' : 'All walls removed, so this invitation is switched off.' };
}
async function removeInvite_(f: FormData) {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const job = Number(s(f, 'job')); if (!(await jobFor(me, job))) return;
  await rows('update wall_links set revoked=true where job_id=$1 and lower(email)=$2', [job, s(f, 'email').toLowerCase()]); revalidatePath('/plans'); revalidatePath('/shared');
}
export async function inviteToWalls(...a: Parameters<typeof inviteToWalls_>) { return audited('inviteToWalls', inviteToWalls_, a) as ReturnType<typeof inviteToWalls_>; }
export async function updateInvite(...a: Parameters<typeof updateInvite_>) { return audited('updateInvite', updateInvite_, a) as ReturnType<typeof updateInvite_>; }
export async function removeInvite(...a: Parameters<typeof removeInvite_>) { return audited('removeInvite', removeInvite_, a) as ReturnType<typeof removeInvite_>; }

// Audit trail: each of these is recorded (who, what, when) once it succeeds.
export async function createWallLink(...a: Parameters<typeof createWallLink_>) { return audited('createWallLink', createWallLink_, a) as ReturnType<typeof createWallLink_>; }
export async function revokeWallLink(...a: Parameters<typeof revokeWallLink_>) { return audited('revokeWallLink', revokeWallLink_, a) as ReturnType<typeof revokeWallLink_>; }
export async function reassignWallLink(...a: Parameters<typeof reassignWallLink_>) { return audited('reassignWallLink', reassignWallLink_, a) as ReturnType<typeof reassignWallLink_>; }
