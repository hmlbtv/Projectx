'use server';
import { audited } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, createSession, type Me } from './session';
import { myEmails } from './emails';
import { allow, clientIp } from './security';
import { loadJobPlans, saveJobPlans, planMeta } from './plans';
import { checkCopy } from './planCopy';
import { wallPng } from './wallPng';
import { brandedMail, escMail } from './brandMail';
import { mailTemplates as T } from './mailTemplates';
import { emailOn, signupBlocked, SIGNUP_BLOCKED_MSG, baseUrl } from './mail';
import { newToken, sha256, hashPassword, passwordProblem } from './password';
import type { FormState } from './actions';
import { limitCheck, lockMessage } from './subscriptions';

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
  if (await lockMessage('jobs', job)) return { error: 'This Job is view only on your current plan, so no new guest links can be made.' };
  { const m = await guestRoom(me, job, null); if (m) return { error: m }; }
  const contact = await one(`select c.id, c.email from contacts c join production_contacts pc on pc.contact_id=c.id join jobs j on j.production_id=pc.production_id
    where c.id=$1 and c.tenant_id=$2 and j.id=$3`, [Number(s(f, 'contact')), tenant, job]);
  if (!contact) return { error: 'Choose a contact assigned to this Production.' };
  const email = contact.email as string, token = newToken();
  await rows('insert into wall_links(job_id,room_wall_id,email,access,token_hash,created_by,contact_id) values($1,$2,$3,$4,$5,$6,$7)', [job, wall, email, access, sha256(token), me.id, contact.id]);
  const link = `${await baseUrl()}/w/${token}`;
  revalidatePath('/productions');
  const wt = T.wallShared(me.name, access, link), sent = await brandedMail(email, wt.subject, wt.text, wt.b);
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
    const vm = T.verify(`${await baseUrl()}/verify/${vt}`, true); if (await brandedMail(link.email, vm.subject, vm.text, vm.b))
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
export async function savePlanLink(linkId: number, _name: string, data: any) {
  const me = await requireMe(); const l = await linkAccess(me, linkId); if (!l || l.access !== 'edit') throw new Error('Not allowed');
  { const m = await lockMessage('jobs', l.job_id); if (m) throw new Error(m); }
  await saveJobPlans(l.job_id, data ?? {}, me.id, l.room_wall_id); // only this wall, into the plan everyone on the Job shares
}
// The latest shared plan for the invited wall (picks up other people's changes).
// Details for the printed sheet (version, who changed what, last saved) for an invited person. Works for archived Jobs too, which are view only.
export async function loadPlanMetaLink(linkId: number, _wallId?: number) {
  const me = await requireMe();
  const l = await one(`select wl.job_id, wl.room_wall_id from wall_links wl where wl.id=$1 and lower(wl.email) in ${myEmails(2)} and not wl.revoked and (select tn.status from tenants tn join broadcasters bb on bb.tenant_id=tn.id join productions pp on pp.broadcaster_id=bb.id join jobs jj on jj.production_id=pp.id where jj.id=wl.job_id)='active'`, [linkId, me.id]);
  if (!l) throw new Error('Not allowed');
  return { ...(await planMeta(l.job_id, l.room_wall_id)), printedBy: me.name || me.email, now: new Date().toISOString() };
}
export async function loadPlansLink(linkId: number): Promise<Record<string, any>> {
  const me = await requireMe(); const l = await linkAccess(me, linkId); if (!l) throw new Error('Not allowed');
  return loadJobPlans(l.job_id, [l.room_wall_id]);
}
export async function addCommentLink(f: FormData) {
  const me = await requireMe(); const l = await linkAccess(me, Number(s(f, 'link'))); if (!l || l.access !== 'edit') throw new Error('Not allowed');
  const body = s(f, 'body').slice(0, 2000); if (!body) return;
  await rows('insert into comments(job_id,room_id,room_wall_id,user_id,body) values($1,$2,$3,$4,$5)', [l.job_id, l.room_id, l.room_wall_id, me.id, body]);
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
  const wt = T.wallShared(me.name, wl.access, link), sent = await brandedMail(contact.email, wt.subject, wt.text, wt.b);
  return { ok: sent ? `New link emailed to ${contact.email}. The previous link no longer works.` : `Email sending is not set up. Send this new link to ${contact.email} (the previous link no longer works):`, link: sent ? undefined : link };
}

// Guest invitations are limited per Job by the plan: each invited person (or unnamed guest link) counts once. Ones that already exist are never blocked.
async function guestRoom(me: Me, job: number, email: string | null): Promise<string | null> {
  if (me.role === 'webappdev') return null;
  if (email && await one('select 1 from wall_links where job_id=$1 and lower(email)=$2 and not revoked', [job, email])) return null;
  const c = (await one("select count(distinct coalesce(lower(email), 'link' || id::text))::int c from wall_links where job_id=$1 and not revoked", [job]))!.c;
  return limitCheck(me.tenant_id ?? 0, 'guest_invites', c);
}
// ---- Invitations from Monitor Plans: one person, any number of the Job's walls, a contact or any email address ----
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
async function jobFor(me: Me, job: number) {
  return one(`select j.id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1 and b.tenant_id=$2`, [job, me.tenant_id ?? 0]);
}
const wallsOf = async (job: number, ids: number[]) => ids.length ? (await rows('select jw.room_wall_id id from job_walls jw where jw.job_id=$1 and jw.room_wall_id = any($2::int[])', [job, ids])).map((r: any) => r.id as number) : [];
const ids = (f: FormData) => Array.from(new Set(f.getAll('wall').map(x => Number(x)).filter(n => Number.isInteger(n) && n > 0)));
// The invitation / update email: branded HTML with wall pictures, plus a plain-text version. Returns whether it was sent.
async function sendInviteMail(me: Me, email: string, link: string, walls: number[], access: string, note: string, updated: boolean): Promise<boolean> {
  const t = T.planInvite(me.name, access, walls.length, link, note, updated);
  // Pictures of the walls they were invited to, shown under the button.
  const shown = await rows('select rw.id, rw.name, wt.data from room_walls rw join wall_templates wt on wt.id=rw.wall_template_id where rw.id = any($1::int[]) order by rw.id limit 6', [walls]);
  const images: { cid: string; png: Buffer }[] = [];
  for (const w of shown) { const png = await wallPng(Array.isArray(w.data?.assets) ? w.data.assets : [], 480, me.tenant_id); if (png) images.push({ cid: `wall${w.id}`, png }); }
  const after = shown.map((w: any) => `<p style="margin:16px 0 6px;font-size:15px"><b>${escMail(String(w.name))}</b></p>${images.some(i => i.cid === `wall${w.id}`) ? `<img src="cid:wall${w.id}" alt="${escMail(String(w.name))}" width="556" style="max-width:100%;height:auto;border-radius:8px;display:block">` : ''}`).join('');
  return await brandedMail(email, t.subject, t.text, { ...t.b, after, images });
}
async function inviteToWalls_(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const tenant = me.tenant_id ?? 0, job = Number(s(f, 'job')); if (!(await jobFor(me, job))) return { error: 'Job not found.' };
  if (!(await allow('wall-link', String(me.id), 60, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const access = s(f, 'access') === 'view' ? 'view' : 'edit';
  const walls = await wallsOf(job, ids(f)); if (walls.length === 0) return { error: 'Tick at least one wall.' };
  if (await lockMessage('jobs', job)) return { error: 'This Job is view only on your current plan, so no one new can be invited.' };
  let email = s(f, 'email').toLowerCase(), contactId: number | null = null;
  if (!email) { const c = await one('select id, email from contacts where id=$1 and tenant_id=$2', [Number(s(f, 'contact')), tenant]); if (c) { email = String(c.email).toLowerCase(); contactId = c.id; } }
  if (!EMAIL.test(email) || email.length > 200) return { error: 'Choose a contact or type a valid email address.' };
  { const m = await guestRoom(me, job, email); if (m) return { error: m }; }
  if (!contactId) { const c = await one('select id from contacts where tenant_id=$1 and lower(email)=$2 limit 1', [tenant, email]); if (c) contactId = c.id; }
  let first = '', accessChanged = false;
  for (const w of walls) {
    const ex = await one('select id, access from wall_links where job_id=$1 and room_wall_id=$2 and lower(email)=$3 and not revoked', [job, w, email]);
    if (ex) { if (ex.access !== access) accessChanged = true; await rows('update wall_links set access=$1 where id=$2', [access, ex.id]); continue; }
    const token = newToken(); if (!first) first = token;
    await rows('insert into wall_links(job_id,room_wall_id,email,access,token_hash,created_by,contact_id) values($1,$2,$3,$4,$5,$6,$7)', [job, w, email, access, sha256(token), me.id, contactId]);
  }
  revalidatePath('/plans');
  if (!first) { if (!accessChanged) return { ok: `${email} already had these walls. Nothing was changed.` }; const sent = await sendInviteMail(me, email, `${await baseUrl()}/shared`, walls, access, '', true); return { ok: `${email} already had these walls. Their access is now ${access === 'edit' ? 'can edit' : 'view only'}${sent ? ' and an update was emailed to them.' : '.'}` }; }
  const link = `${await baseUrl()}/w/${first}`;
  const note = String(f.get('comment') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 1000);
  const sent = await sendInviteMail(me, email, link, walls, access, note, false);
  return { ok: sent ? `Invitation emailed to ${email}.` : `Email sending is not set up. Send this link to ${email}:`, link: sent ? undefined : link };
}
// Change what an invited person can open: tick or untick walls, switch edit / view only. Unticked walls are switched off, ticked new ones are added.
async function updateInvite_(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const job = Number(s(f, 'job')); if (!(await jobFor(me, job))) return { error: 'Job not found.' };
  if (!(await allow('wall-link', String(me.id), 60, 60))) return { error: 'Too many requests. Please wait a while and try again.' };
  const email = s(f, 'email').toLowerCase(), access = s(f, 'access') === 'view' ? 'view' : 'edit', want = await wallsOf(job, ids(f));
  const cur = await rows('select id, room_wall_id, access from wall_links where job_id=$1 and lower(email)=$2 and not revoked', [job, email]);
  if (cur.length === 0) return { error: 'Invitation not found.' };
  const have = new Set(cur.map((c: any) => c.room_wall_id as number)), contact = (await one('select contact_id from wall_links where job_id=$1 and lower(email)=$2 and contact_id is not null limit 1', [job, email]))?.contact_id ?? null;
  const removed = cur.filter((c: any) => !want.includes(c.room_wall_id)), added = want.filter(w => !have.has(w)), accessChanged = cur.some((c: any) => c.access !== access);
  for (const c of removed) await rows('update wall_links set revoked=true where id=$1', [c.id]);
  await rows('update wall_links set access=$1 where job_id=$2 and lower(email)=$3 and not revoked', [access, job, email]);
  let first = '';
  for (const w of added) { const token = newToken(); if (!first) first = token; await rows('insert into wall_links(job_id,room_wall_id,email,access,token_hash,created_by,contact_id) values($1,$2,$3,$4,$5,$6,$7)', [job, w, email, access, sha256(token), me.id, contact]); }
  revalidatePath('/plans'); revalidatePath('/shared');
  if (!want.length) return { ok: 'All walls removed, so this invitation is switched off.' };
  if (!removed.length && !added.length && !accessChanged) return { ok: 'Nothing changed.' };
  // Something changed: tell the person. New walls come with a fresh sign-in link; otherwise the email opens their Shared with me page.
  const link = first ? `${await baseUrl()}/w/${first}` : `${await baseUrl()}/shared`;
  const note = String(f.get('comment') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 1000);
  const sent = await sendInviteMail(me, email, link, want, access, note, true);
  return { ok: sent ? `Saved, and an update was emailed to ${email}.` : 'Saved. Email sending is not set up, so no update was sent.' };
}
async function removeInvite_(f: FormData) {
  const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only');
  const job = Number(s(f, 'job')); if (!(await jobFor(me, job))) return;
  await rows('update wall_links set revoked=true where job_id=$1 and lower(email)=$2', [job, s(f, 'email').toLowerCase()]); revalidatePath('/plans'); revalidatePath('/shared'); revalidatePath('/productions');
}
export async function inviteToWalls(...a: Parameters<typeof inviteToWalls_>) { return audited('inviteToWalls', inviteToWalls_, a) as ReturnType<typeof inviteToWalls_>; }
export async function updateInvite(...a: Parameters<typeof updateInvite_>) { return audited('updateInvite', updateInvite_, a) as ReturnType<typeof updateInvite_>; }
export async function removeInvite(...a: Parameters<typeof removeInvite_>) { return audited('removeInvite', removeInvite_, a) as ReturnType<typeof removeInvite_>; }

// Audit trail: each of these is recorded (who, what, when) once it succeeds.
export async function createWallLink(...a: Parameters<typeof createWallLink_>) { return audited('createWallLink', createWallLink_, a) as ReturnType<typeof createWallLink_>; }
export async function revokeWallLink(...a: Parameters<typeof revokeWallLink_>) { return audited('revokeWallLink', revokeWallLink_, a) as ReturnType<typeof revokeWallLink_>; }
export async function reassignWallLink(...a: Parameters<typeof reassignWallLink_>) { return audited('reassignWallLink', reassignWallLink_, a) as ReturnType<typeof reassignWallLink_>; }

// ---- Guests: copy a saved plan from another Job in the SAME organization, with checks ----
async function copySource(me: Me, linkId: number, srcLinkId: number) {
  const tgt = await linkAccess(me, linkId); if (!tgt || tgt.access !== 'edit') throw new Error('Not allowed');
  // The source must be one of this person's own shares (any access, archived Jobs included) in the same organization.
  const src = await one(`select wl.job_id, wl.room_wall_id, b.tenant_id, rw.wall_template_id, wt.data wdata from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    join room_walls rw on rw.id=wl.room_wall_id join wall_templates wt on wt.id=rw.wall_template_id
    where wl.id=$1 and lower(wl.email) in ${myEmails(2)} and not wl.revoked and wl.job_id<>$3 and (select status from tenants where id=b.tenant_id)='active'
      and b.tenant_id=(select b2.tenant_id from jobs j2 join productions p2 on p2.id=j2.production_id join broadcasters b2 on b2.id=p2.broadcaster_id where j2.id=$3)`, [srcLinkId, me.id, tgt.job_id]);
  if (!src) throw new Error('Not allowed');
  const t = await one('select wt.data, j.source_set_id, b.tenant_id from room_walls rw join wall_templates wt on wt.id=rw.wall_template_id, jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where rw.id=$1 and j.id=$2', [tgt.room_wall_id, tgt.job_id]);
  const sp = (await loadJobPlans(src.job_id, [src.room_wall_id]))[String(src.room_wall_id)];
  const srcSet = await one('select ss.sources from jobs j join source_sets ss on ss.id=j.source_set_id where j.id=$1', [src.job_id]);
  const tgtSet = await one('select ss.sources from jobs j join source_sets ss on ss.id=j.source_set_id where j.id=$1', [tgt.job_id]);
  const layouts = await rows('select id,name,tiles from mv_layouts where tenant_id is null or tenant_id=$1', [src.tenant_id]);
  const arr = (x: any) => (Array.isArray(x?.assets) ? x.assets : []);
  const nm = (v: any) => (Array.isArray(v) ? v.map((s: any) => String(typeof s === 'string' ? s : s?.name ?? '')) : null);
  return { tgt, src, sp, res: sp ? checkCopy({ src: sp, srcAssets: arr(src.wdata), tgtAssets: arr(t?.data), layouts: layouts as any, srcSources: nm(srcSet?.sources), tgtSources: nm(tgtSet?.sources) }) : null };
}
// Plans this person may copy onto the wall they are editing: their own other shares, same organization, with a saved plan.
export async function guestCopyCandidates(linkId: number) {
  const me = await requireMe(); const tgt = await linkAccess(me, linkId); if (!tgt || tgt.access !== 'edit') return [];
  return rows(`select wl.id, j.name job, p.name prod, rw.name wall, (j.expires_at < current_date) expired, q.updated_at from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    join room_walls rw on rw.id=wl.room_wall_id join job_wall_plans q on q.job_id=wl.job_id and q.room_wall_id=wl.room_wall_id
    where lower(wl.email) in ${myEmails(1)} and not wl.revoked and wl.job_id<>$2 and (select status from tenants where id=b.tenant_id)='active'
      and b.tenant_id=(select b2.tenant_id from jobs j2 join productions p2 on p2.id=j2.production_id join broadcasters b2 on b2.id=p2.broadcaster_id where j2.id=$2)
    order by q.updated_at desc limit 100`, [me.id, tgt.job_id]);
}
export async function guestCopyPreview(linkId: number, srcLinkId: number): Promise<{ error?: string; findings?: { level: string; text: string }[]; copied?: number }> {
  const me = await requireMe();
  try { const c = await copySource(me, linkId, srcLinkId); if (!c.res) return { error: 'That wall has no saved plan.' }; if (!c.res.copied && !c.res.data.layoutId) return { error: 'Nothing in that plan fits this wall.', findings: c.res.findings }; return { findings: c.res.findings, copied: c.res.copied }; }
  catch { return { error: 'You cannot copy that plan.' }; }
}
export async function guestCopyApply(linkId: number, srcLinkId: number, confirmed: boolean): Promise<{ error?: string; ok?: boolean }> {
  const me = await requireMe();
  try {
    const c = await copySource(me, linkId, srcLinkId); if (!c.res || (!c.res.copied && !c.res.data.layoutId)) return { error: 'Nothing in that plan fits this wall.' };
    if (c.res.findings.some(x => x.level === 'warn') && !confirmed) return { error: 'Please review the differences and confirm.' };
    await saveJobPlans(c.tgt.job_id, { [c.tgt.room_wall_id]: c.res.data }, me.id, c.tgt.room_wall_id); revalidatePath('/shared'); return { ok: true };
  } catch { return { error: 'You cannot copy that plan.' }; }
}
