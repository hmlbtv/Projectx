'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, isAdmin, createSession, destroySession, type Me } from './session';
import { allow, clientIp } from './security';
import { emailOn, sendMail, sendMailDetailed, mailFrom, baseUrl } from './mail';
import { verifyPassword, hashPassword, passwordProblem, newToken, sha256 } from './password';

const tid = (me: any) => me.tenant_id ?? 0;
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim().slice(0, k === 'sources' ? 20000 : 200);
const TOO_MANY: FormState = { error: 'Too many requests. Please wait a while and try again.' };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export type FormState = { error?: string; ok?: string; link?: string; step?: string } | undefined;

async function mgr() { const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only'); return me; }

// ---- Tenant isolation: every id from the browser is checked against the signed-in user's tenant ----
const OWN: Record<string, string> = {
  sites: 'select 1 from sites where id=$1 and tenant_id=$2',
  locations: 'select 1 from locations l join sites s on s.id=l.site_id where l.id=$1 and s.tenant_id=$2',
  rooms: 'select 1 from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where r.id=$1 and s.tenant_id=$2',
  walls: 'select 1 from wall_templates where id=$1 and tenant_id=$2',
  myWalls: 'select 1 from wall_templates where id=$1 and tenant_id=$2',
  broadcasters: 'select 1 from broadcasters where id=$1 and tenant_id=$2',
  productions: 'select 1 from productions p join broadcasters b on b.id=p.broadcaster_id where p.id=$1 and b.tenant_id=$2',
  jobs: 'select 1 from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1 and b.tenant_id=$2',
  sourceSets: 'select 1 from source_sets where id=$1 and tenant_id=$2',
};
async function own(kind: keyof typeof OWN, id: number, me: Me) {
  if (!id || !(await one(OWN[kind], [id, tid(me)]))) throw new Error('Not found');
}
async function canAccessJob(me: Me, jobId: number) {
  if (await one('select 1 from job_users where job_id=$1 and user_id=$2', [jobId, me.id])) return true;
  return canManage(me) && !!(await one(OWN.jobs, [jobId, tid(me)]));
}

// ---- Authentication ----
const MAX_FAILS = 5, LOCK_MIN = 15;

export async function signIn(_: FormState, f: FormData): Promise<FormState> {
  const email = s(f, 'email').toLowerCase(), pw = String(f.get('password') ?? '').slice(0, 200);
  if (!(await allow('signin', await clientIp(), 40, 10))) return TOO_MANY;
  const u = await one('select id,password_hash,failed_attempts,locked_until,email_verified from users where email=$1', [email]);
  if (u?.locked_until && new Date(u.locked_until) > new Date()) { await verifyPassword(pw, null); return { error: 'Too many attempts. Try again in a few minutes.' }; }
  const ok = await verifyPassword(pw, u?.password_hash);
  if (!u || !ok) {
    if (u) await rows(`update users set failed_attempts=failed_attempts+1, locked_until=case when failed_attempts+1>=$2 then now() + ($3 || ' minutes')::interval else locked_until end where id=$1`, [u.id, MAX_FAILS, String(LOCK_MIN)]);
    return { error: 'Email or password is incorrect.' };
  }
  if (!u.email_verified) return { error: 'Please verify your email first - use the link we sent, or "Forgot password" to get a new one.' };
  await rows('update users set failed_attempts=0, locked_until=null where id=$1', [u.id]);
  await createSession(u.id);
  const next = s(f, 'next'); redirect(/^\/(?!\/)[\w\-\/]*$/.test(next) ? next : '/');
}
export async function signOut() { await destroySession(); redirect('/signin'); }

// New person: creates their own Tenant (demo plan, 1 wall template) and makes them its Master Admin.
export async function signUp(_: FormState, f: FormData): Promise<FormState> {
  if (s(f, 'website')) return { error: 'Could not create the account.' }; // honeypot for bots
  if (!(await allow('signup', await clientIp(), 5, 60))) return TOO_MANY;
  const name = s(f, 'name').slice(0, 100), org = s(f, 'tenant').slice(0, 100), email = s(f, 'email').toLowerCase(), pw = String(f.get('password') ?? '');
  if (!name || !org) return { error: 'Enter your name and your company or team name.' };
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  if (pw !== String(f.get('password2') ?? '')) return { error: 'Passwords do not match.' };
  const bad = passwordProblem(pw); if (bad) return { error: bad };
  if (await one('select 1 from users where email=$1', [email])) return { error: 'An account with this email already exists. Sign in instead.' };
  const t = await one('insert into tenants(name,plan,max_walls_per_broadcaster) values($1,\'demo\',1) returning id', [org]);
  const verify = emailOn(), token = newToken();
  const u = await one(`insert into users(tenant_id,email,name,role,password_hash,email_verified,verify_hash,verify_expires)
    values($1,$2,$3,'master_admin',$4,$5,$6,now() + interval '2 days') returning id`, [t.id, email, name, await hashPassword(pw), !verify, verify ? sha256(token) : null]);
  if (verify) {
    const sent = await sendMail(email, 'Verify your TelePlanner account', `Welcome to TelePlanner.\nConfirm your email to finish setting up your account:\n${await baseUrl()}/verify/${token}\n\nThis link expires in 2 days.`);
    if (sent) return { ok: `We sent a verification link to ${email}. Open it to finish creating your account.` };
    // The email could not be sent. Never let an unverified address in: undo the sign-up so they can try again.
    await rows('delete from users where id=$1', [u.id]); await rows('delete from tenants where id=$1', [t.id]);
    return { error: 'We could not send the verification email, so the account was not created. Please check the address and try again, or contact the site administrator.' };
  }
  await createSession(u.id);
  redirect('/');
}

export async function requestReset(_: FormState, f: FormData): Promise<FormState> {
  if (!emailOn()) return { error: 'Password reset email is not set up yet. Please contact your administrator.' };
  const email = s(f, 'email').toLowerCase();
  if (!(await allow('reset', await clientIp(), 5, 60)) || !(await allow('reset-email', email, 3, 60))) return TOO_MANY;
  const u = await one('select id from users where email=$1', [email]);
  if (u) {
    const token = newToken();
    await rows("update users set invite_hash=$1, invite_expires=now() + interval '1 hour' where id=$2", [sha256(token), u.id]);
    await sendMail(email, 'Reset your TelePlanner password', `Use this link to set a new password (valid for 1 hour):\n${await baseUrl()}/invite/${token}\n\nIf you did not ask for this, ignore this email.`);
  }
  return { ok: 'If an account exists for that email, a reset link is on its way.' };
}

// Used for invites and password resets (both set a password from a one-time token).
export async function acceptInvite(_: FormState, f: FormData): Promise<FormState> {
  if (!(await allow('token', await clientIp(), 20, 10))) return TOO_MANY;
  const pw = String(f.get('password') ?? ''), pw2 = String(f.get('password2') ?? '');
  if (pw !== pw2) return { error: 'Passwords do not match.' };
  const bad = passwordProblem(pw); if (bad) return { error: bad };
  const u = await one('select id from users where invite_hash=$1 and invite_expires > now()', [sha256(s(f, 'token'))]);
  if (!u) return { error: 'This link is invalid or has expired. Ask for a new one.' };
  await rows("update users set password_hash=$1, invite_hash=null, invite_expires=null, email_verified=true, failed_attempts=0, locked_until=null, name=coalesce(nullif($3,''),name) where id=$2", [await hashPassword(pw), u.id, s(f, 'name')]);
  await rows('delete from sessions where user_id=$1', [u.id]);
  await createSession(u.id);
  redirect('/');
}
export async function changePassword(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe();
  const cur = await one('select password_hash from users where id=$1', [me.id]);
  if (!(await verifyPassword(String(f.get('current') ?? ''), cur?.password_hash))) return { error: 'Current password is incorrect.' };
  const pw = String(f.get('password') ?? ''); if (pw !== String(f.get('password2') ?? '')) return { error: 'Passwords do not match.' };
  const bad = passwordProblem(pw); if (bad) return { error: bad };
  await rows('update users set password_hash=$1 where id=$2', [await hashPassword(pw), me.id]);
  await rows('delete from sessions where user_id=$1', [me.id]);
  await createSession(me.id);
  return { ok: 'Password changed. Other devices have been signed out.' };
}

// ---- Team + job invites ----
async function invite(me: Me, email: string, role: string, jobId?: number): Promise<FormState> {
  if (!(await allow('invite', String(me.id), 40, 60))) return TOO_MANY;
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  let u = await one('select id,tenant_id,password_hash from users where email=$1', [email]);
  if (u && u.tenant_id && u.tenant_id !== tid(me)) return { error: 'That email already belongs to another team.' };
  // Every account, including One-Time Users, belongs to exactly one tenant.
  if (!u) u = await one("insert into users(email,name,role,tenant_id,email_verified) values($1,$1,$2,$3,true) returning id,tenant_id,password_hash", [email, role, tid(me)]);
  if (jobId) {
    // Per-user cap on active Jobs they can access (default 5, set by the tenant Admin on the Team page).
    const already = await one('select 1 from job_users where job_id=$1 and user_id=$2', [jobId, u.id]);
    if (!already) {
      const lim = await one(`select max_jobs m, role, (select count(*)::int from job_users ju join jobs j on j.id=ju.job_id where ju.user_id=users.id and j.expires_at >= current_date) c from users where id=$1`, [u.id]);
      if (lim.role === 'user' && lim.c >= lim.m) return { error: `${email} is already on ${lim.c} active Jobs, the limit set for them (${lim.m}). An Admin can raise it on the Team page.` };
    }
    await rows('insert into job_users(job_id,user_id) values($1,$2) on conflict do nothing', [jobId, u.id]);
  }
  revalidatePath('/productions'); revalidatePath('/team');
  if (u.password_hash) return { ok: `${email} already has an account${jobId ? ' and now has access to this Job' : ' in your team'}.` };
  const token = newToken();
  await rows("update users set invite_hash=$1, invite_expires=now() + interval '7 days' where id=$2", [sha256(token), u.id]);
  const link = `${await baseUrl()}/invite/${token}`;
  if (await sendMail(email, 'You have been invited to TelePlanner', `${me.name} invited you to TelePlanner.\nSet your password to join:\n${link}\n\nThis link expires in 7 days.`)) return { ok: `Invite emailed to ${email}.` };
  return { ok: `Email sending is not set up. Send this link to ${email} (valid 7 days):`, link };
}
export async function inviteUser(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const job = Number(s(f, 'job')); await own('jobs', job, me);
  return invite(me, s(f, 'email').toLowerCase(), 'user', job);
}
export async function inviteTeam(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr();
  const want = s(f, 'role'), top = me.role === 'master_admin' || me.role === 'webappdev';
  const role = top && want === 'master_admin' ? 'master_admin' : isAdmin(me) && want === 'manager' ? 'manager' : 'user';
  return invite(me, s(f, 'email').toLowerCase(), role);
}
// New link (valid 7 days) for someone who was invited but has not set a password yet; the old link stops working.
export async function resendInvite(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr();
  const u = await one('select email,role from users where id=$1 and tenant_id=$2 and password_hash is null', [Number(s(f, 'id')), tid(me)]);
  if (!u) return { error: 'That person has already joined, or is not in your team.' };
  return invite(me, u.email, u.role);
}
export async function removeMember(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const id = Number(s(f, 'id')); if (id === me.id) return;
  const tgt = await one('select role from users where id=$1 and tenant_id=$2', [id, tid(me)]); if (!tgt) return;
  if (tgt.role === 'master_admin' && (me.role === 'admin' || id === await founder(tid(me)))) return;
  if (!['user', 'manager', 'admin', 'master_admin'].includes(tgt.role)) return;
  await rows('delete from users where id=$1 and tenant_id=$2', [id, tid(me)]); revalidatePath('/team');
}

// The founding Master Admin (first one on the account) can't be changed by other Master Admins, so an account always keeps an owner.
const founder = async (tenant: number) => (await one("select min(id) id from users where tenant_id=$1 and role='master_admin'", [tenant]))?.id ?? 0;
export async function setUserRole(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const id = Number(s(f, 'id')), role = s(f, 'role'), top = me.role === 'master_admin' || me.role === 'webappdev';
  const allowed = top ? ['user', 'manager', 'admin', 'master_admin'] : ['user', 'manager'];
  if (id === me.id || !allowed.includes(role)) return;
  const tgt = await one('select role,tenant_id from users where id=$1', [id]);
  if (!tgt || tgt.tenant_id !== tid(me) && me.role !== 'webappdev') return;
  if (tgt.role === 'webappdev' || (tgt.role === 'admin' && !top) || (tgt.role === 'master_admin' && (!top || (me.role !== 'webappdev' && id === await founder(tgt.tenant_id))))) return;
  await rows('update users set role=$1 where id=$2', [role, id]);
  await rows('delete from sessions where user_id=$1', [id]); // signs them out so the new role applies cleanly
  revalidatePath('/team');
}
// Pause or restore one person. They are signed out and see the suspended page until restored.
export async function setUserSuspended(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const id = Number(s(f, 'id')), on = s(f, 'suspend') === '1', top = me.role === 'master_admin' || me.role === 'webappdev';
  if (id === me.id) return;
  const tgt = await one('select role,tenant_id from users where id=$1', [id]);
  if (!tgt || tgt.role === 'webappdev' || (tgt.tenant_id !== tid(me) && me.role !== 'webappdev')) return;
  if ((tgt.role === 'admin' || tgt.role === 'master_admin') && !top) return;
  if (tgt.role === 'master_admin' && me.role !== 'webappdev' && id === await founder(tgt.tenant_id)) return;
  await rows('update users set suspended=$1 where id=$2', [on, id]);
  if (on) await rows('delete from sessions where user_id=$1', [id]);
  revalidatePath('/team'); revalidatePath('/webappdev');
}
export async function setUserMaxJobs(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const max = Math.min(Math.max(parseInt(s(f, 'max')), 0) || 0, 1000);
  await rows("update users set max_jobs=$1 where id=$2 and tenant_id=$3 and role='user'", [max, Number(s(f, 'id')), tid(me)]); revalidatePath('/team');
}
export async function removeJobUser(f: FormData) {
  const me = await mgr(); const job = Number(s(f, 'job')); await own('jobs', job, me);
  await rows('delete from job_users where job_id=$1 and user_id=$2', [job, Number(s(f, 'user'))]); revalidatePath('/productions'); revalidatePath('/team');
}

// ---- Site admin (WebAppDev): plans and limits per tenant ----
export async function setTenantPlan(f: FormData) {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const n = (k: string, d: number) => { const v = parseInt(s(f, k)); return Number.isFinite(v) ? Math.min(Math.max(v, 0), 100000) : d; };
  await rows('update tenants set plan=$1, max_walls_per_broadcaster=$2, max_broadcasters=$3, max_productions=$4, max_jobs_per_production=$5 where id=$6',
    [s(f, 'plan').slice(0, 40) || 'demo', n('max', 1), n('b', 2), n('p', 3), n('j', 4), Number(s(f, 'id'))]);
  revalidatePath('/webappdev');
}

export async function setTenantStatus(f: FormData) {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const id = Number(s(f, 'id')), status = s(f, 'status');
  if (!['active', 'suspended', 'archived'].includes(status) || id === me.tenant_id) return;
  await rows('update tenants set status=$1 where id=$2', [status, id]);
  if (status !== 'active') await rows('delete from sessions where user_id in (select id from users where tenant_id=$1)', [id]);
  revalidatePath('/webappdev');
}
// Permanently removes a tenant and everything in it. The tenant name must be typed to confirm.
export async function deleteTenant(f: FormData) {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const id = Number(s(f, 'id')); if (id === me.tenant_id) return;
  const t = await one('select name from tenants where id=$1', [id]); if (!t || s(f, 'confirm') !== t.name) return;
  const U = '(select id from users where tenant_id=$1)';
  await rows(`delete from job_users where user_id in ${U}`, [id]);
  await rows('delete from broadcasters where tenant_id=$1', [id]);
  await rows('delete from sites where tenant_id=$1', [id]);
  await rows('delete from wall_templates where tenant_id=$1', [id]);
  await rows('delete from mv_layouts where tenant_id=$1', [id]);
  await rows('delete from source_sets where tenant_id=$1', [id]);
  await rows('delete from login_events where tenant_id=$1', [id]);
  await rows('delete from contacts where tenant_id=$1', [id]);
  await rows(`delete from comments where user_id in ${U}`, [id]);
  await rows('delete from users where tenant_id=$1', [id]);
  await rows('delete from tenants where id=$1', [id]);
  revalidatePath('/webappdev');
}

// ---- Tenant Tree (Admin + Manager) ----
export async function addSite(_: FormState, f: FormData): Promise<FormState> { const me = await mgr(); if (s(f,'name')) await rows('insert into sites(tenant_id,name) values($1,$2)', [tid(me), s(f,'name')]); revalidatePath('/tenant'); return { ok: 'Added.' }; }
export async function addLocation(_: FormState, f: FormData): Promise<FormState> { const me = await mgr(); const p = Number(s(f,'parent')); await own('sites', p, me); if (s(f,'name')) await rows('insert into locations(site_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/tenant'); return { ok: 'Added.' }; }
export async function addRoom(_: FormState, f: FormData): Promise<FormState> { const me = await mgr(); const p = Number(s(f,'parent')); await own('locations', p, me); if (s(f,'name')) await rows('insert into rooms(location_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/tenant'); return { ok: 'Added.' }; }
export async function renameNode(f: FormData) {
  const me = await mgr(); const t = s(f,'table'); if (!['sites','locations','rooms'].includes(t)) return;
  const id = Number(s(f,'id')); await own(t as any, id, me);
  await rows(`update ${t} set name=$1 where id=$2`, [s(f,'name'), id]); revalidatePath('/tenant');
}
export async function addRoomWall(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const room = Number(s(f,'room')), wall = Number(s(f,'wall')); await own('rooms', room, me); await own('walls', wall, me);
  await rows('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [room, wall, s(f,'name') || 'Wall']); revalidatePath('/tenant'); return { ok: 'Added.' };
}
export async function renameRoomWall(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id'));
  if (s(f,'name')) await rows(`update room_walls set name=$1 where id=$2 and room_id in (select r.id from rooms r join locations l on l.id=r.location_id join sites st on st.id=l.site_id where st.tenant_id=$3)`, [s(f,'name'), id, tid(me)]);
  revalidatePath('/tenant'); revalidatePath('/plans');
}
// Deleting removes everything underneath (Locations, Rooms, walls placed in them). Admin only.
export async function deleteNode(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const t = s(f,'table'); if (!['sites','locations','rooms'].includes(t)) return;
  const id = Number(s(f,'id')); await own(t as any, id, me);
  const roomsSql = t === 'rooms' ? 'select $1::int' : t === 'locations' ? 'select id from rooms where location_id=$1' : 'select r.id from rooms r join locations l on l.id=r.location_id where l.site_id=$1';
  await rows(`delete from job_rooms where room_id in (${roomsSql})`, [id]);
  await rows(`delete from comments where room_id in (${roomsSql})`, [id]).catch(() => {});
  await rows(`delete from ${t} where id=$1`, [id]); revalidatePath('/tenant'); revalidatePath('/productions'); revalidatePath('/plans');
}

export async function removeRoomWall(f: FormData) {
  const me = await mgr(); const id = Number(s(f, 'id'));
  // only if the Room it sits in belongs to this tenant
  await rows(`delete from room_walls where id=$1 and room_id in (select r.id from rooms r join locations l on l.id=r.location_id join sites st on st.id=l.site_id where st.tenant_id=$2)`, [id, tid(me)]);
  revalidatePath('/tenant'); revalidatePath('/plans');
}

// ---- Wall Designer (each Wall Template belongs to a Broadcaster; demo tenants get 1 per Broadcaster) ----
export async function saveWall(id: number | null, name: string, assets: any[], broadcasterId?: number | null): Promise<{ id?: number; error?: string }> {
  const me = await mgr();
  if (!Array.isArray(assets) || assets.length > 300) return { error: 'Too many assets.' };
  const clean = assets.map(a => ({ id: String(a.id).slice(0, 20), type: String(a.type).slice(0, 20), name: String(a.name).slice(0, 60), x: +a.x || 0, y: +a.y || 0, w: +a.w || 10, h: +a.h || 10 }));
  name = String(name).slice(0, 80);
  if (id) { await own('myWalls', id, me); await rows('update wall_templates set name=$1,data=$2 where id=$3', [name, JSON.stringify({ assets: clean }), id]); revalidatePath('/walls'); return { id }; }
  if (!broadcasterId) return { error: 'Choose a Broadcaster for this Wall Template.' };
  await own('broadcasters', broadcasterId, me);
  const t = (await one('select max_walls_per_broadcaster m, (select count(*)::int from wall_templates where broadcaster_id=$2) c from tenants where id=$1', [tid(me), broadcasterId]))!;
  if (me.role !== 'webappdev' && t.c >= t.m) return { error: `Your plan allows ${t.m} Wall Template${t.m === 1 ? '' : 's'} per Broadcaster (this one has ${t.c}). Contact us to upgrade.` };
  const r = (await one('insert into wall_templates(tenant_id,broadcaster_id,name,data) values($1,$2,$3,$4) returning id', [tid(me), broadcasterId, name, JSON.stringify({ assets: clean })]))!;
  revalidatePath('/walls'); return { id: r.id };
}
export async function deleteWall(f: FormData) { const me = await mgr(); await rows('delete from room_walls where wall_template_id in (select id from wall_templates where id=$1 and tenant_id=$2)', [Number(s(f,'id')), tid(me)]); revalidatePath('/tenant'); await rows('delete from wall_templates where id=$1 and tenant_id=$2', [Number(s(f,'id')), tid(me)]); revalidatePath('/walls'); }

// ---- MV Layouts: only Admin/Manager create custom ones ----
export async function saveLayout(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const n = Math.min(Math.max(Number(s(f,'count')) || 1, 1), 36);
  const cols = Math.ceil(Math.sqrt(n)), rws = Math.ceil(n / cols), tiles: any[] = [];
  for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); tiles.push({ n: i + 1, x: c * 1600 / cols, y: r * 900 / rws, w: 1600 / cols, h: 900 / rws }); }
  // Only the site admin can make a Standard (global) layout, visible to every tenant.
  const standard = me.role === 'webappdev' && s(f, 'standard') === '1';
  await rows('insert into mv_layouts(tenant_id,name,tiles) values($1,$2,$3)', [standard ? null : tid(me), s(f,'name') || `Custom ${n}`, JSON.stringify(tiles)]);
  revalidatePath('/layouts'); return { ok: 'Added.' };
}
export async function deleteLayout(f: FormData) { const me = await mgr(); await rows(me.role === 'webappdev' ? 'delete from mv_layouts where id=$1 and (tenant_id=$2 or tenant_id is null)' : 'delete from mv_layouts where id=$1 and tenant_id=$2', [Number(s(f,'id')), tid(me)]); revalidatePath('/layouts'); }

// ---- Productions: Broadcaster > Production > Job ----
// Plan limits (demo default: 2 Broadcasters, 3 Productions each, 4 active Jobs each; the site admin can change them per tenant)
// The site admin (webappdev) is never limited.
const NO_LIMIT = { b: 1e9, p: 1e9, j: 1e9 };
async function limits(me: Me) { if (me.role === 'webappdev') return NO_LIMIT; return (await one('select max_broadcasters b, max_productions p, max_jobs_per_production j from tenants where id=$1', [tid(me)]))!; }
export async function addBroadcaster(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const l = await limits(me);
  const c = (await one('select count(*)::int c from broadcasters where tenant_id=$1', [tid(me)]))!.c;
  if (c >= l.b) return { error: `Your plan allows ${l.b} Broadcaster${l.b === 1 ? '' : 's'}. Contact us to upgrade.` };
  if (s(f,'name')) await rows('insert into broadcasters(tenant_id,name) values($1,$2)', [tid(me), s(f,'name')]); revalidatePath('/productions'); return { ok: 'Added.' };
}
export async function addProduction(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const p = Number(s(f,'parent')); await own('broadcasters', p, me); const l = await limits(me);
  const c = (await one('select count(*)::int c from productions where broadcaster_id=$1', [p]))!.c;
  if (c >= l.p) return { error: `Your plan allows ${l.p} Production${l.p === 1 ? '' : 's'} per Broadcaster.` };
  if (s(f,'name')) await rows('insert into productions(broadcaster_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/productions'); return { ok: 'Added.' };
}
export async function addSourceSet(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const list = s(f,'sources').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 500);
  if (s(f,'name')) await rows('insert into source_sets(tenant_id,name,sources) values($1,$2,$3)', [tid(me), s(f,'name'), JSON.stringify(list)]); revalidatePath('/sources'); revalidatePath('/productions'); return { ok: 'Added.' };
}
export async function updateSourceSet(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('sourceSets', id, me);
  const list = s(f,'sources').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 500);
  if (s(f,'name')) await rows('update source_sets set name=$1,sources=$2 where id=$3', [s(f,'name'), JSON.stringify(list), id]); revalidatePath('/sources');
}
export async function deleteSourceSet(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('sourceSets', id, me);
  await rows('update jobs set source_set_id=null where source_set_id=$1', [id]); await rows('delete from source_sets where id=$1', [id]); revalidatePath('/sources'); revalidatePath('/productions');
}
export async function addJob(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const p = Number(s(f,'parent')); await own('productions', p, me); const l = await limits(me);
  const c = (await one('select count(*)::int c from jobs where production_id=$1 and (expires_at is null or expires_at >= current_date)', [p]))!.c;
  if (c >= l.j) return { error: `Your plan allows ${l.j} active Job${l.j === 1 ? '' : 's'} per Production.` };
  const ss = Number(s(f,'sourceSet')) || null; if (ss) await own('sourceSets', ss, me);
  const fin = s(f,'final') || s(f,'date') || null, exp = s(f,'expires') || null;
  await rows(`insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id)
    values($1,$2,$3,$4,coalesce($5::date,$4::date+5),$6)`, [p, s(f,'name'), s(f,'date') || null, fin, exp, ss]);
  revalidatePath('/productions'); return { ok: 'Added.' };
}
export async function updateBroadcaster(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('broadcasters', id, me);
  if (s(f,'name')) await rows('update broadcasters set name=$1 where id=$2', [s(f,'name'), id]); revalidatePath('/productions');
}
export async function updateProduction(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('productions', id, me);
  if (s(f,'name')) await rows('update productions set name=$1 where id=$2', [s(f,'name'), id]); revalidatePath('/productions');
}
export async function updateJob(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('jobs', id, me);
  const ss = Number(s(f,'sourceSet')) || null; if (ss) await own('sourceSets', ss, me);
  const fin = s(f,'final') || s(f,'date') || null, exp = s(f,'expires') || null;
  if (s(f,'name')) await rows(`update jobs set name=$1,job_date=$2,final_date=$3,expires_at=coalesce($4::date,$3::date+5),source_set_id=$5 where id=$6`, [s(f,'name'), s(f,'date') || null, fin, exp, ss, id]);
  revalidatePath('/productions'); revalidatePath('/plans');
}
// Deleting removes everything underneath (Productions, Jobs, their Monitor Plans and guest links). Admin only.
export async function deleteProduction(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const id = Number(s(f,'id')); await own('productions', id, me);
  await rows('delete from productions where id=$1', [id]); revalidatePath('/productions'); revalidatePath('/plans');
}
export async function deleteBroadcaster(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const id = Number(s(f,'id')); await own('broadcasters', id, me);
  await rows('delete from room_walls where wall_template_id in (select id from wall_templates where broadcaster_id=$1 and tenant_id=$2)', [id, tid(me)]);
  await rows('delete from wall_templates where broadcaster_id=$1 and tenant_id=$2', [id, tid(me)]);
  await rows('delete from broadcasters where id=$1', [id]); revalidatePath('/productions'); revalidatePath('/walls'); revalidatePath('/tenant');
}
// A Wall Template sits in a Room (Sites page); a Job is then given the specific walls it will plan.
const OWN_RW = 'select 1 from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where rw.id=$1 and s.tenant_id=$2';
export async function assignWall(f: FormData) {
  const me = await mgr(); const job = Number(s(f,'job')), wall = Number(s(f,'wall')); await own('jobs', job, me);
  if (!wall || !(await one(OWN_RW, [wall, tid(me)]))) throw new Error('Not found');
  await rows('insert into job_walls(job_id,room_wall_id) values($1,$2) on conflict do nothing', [job, wall]); revalidatePath('/productions'); revalidatePath('/plans');
}
export async function unassignWall(f: FormData) {
  const me = await mgr(); const job = Number(s(f,'job')), wall = Number(s(f,'wall')); await own('jobs', job, me);
  await rows('delete from job_walls where job_id=$1 and room_wall_id=$2', [job, wall]); revalidatePath('/productions'); revalidatePath('/plans');
}
export async function deleteJob(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const id = Number(s(f, 'id')); await own('jobs', id, me);
  await rows('delete from jobs where id=$1', [id]); revalidatePath('/archive'); revalidatePath('/productions'); revalidatePath('/plans');
}

// ---- Monitor Plans ----
export async function savePlan(jobId: number, name: string, data: any) {
  const me = await requireMe(); if (!(await canAccessJob(me, jobId))) throw new Error('Not found');
  if (JSON.stringify(data ?? {}).length > 100_000) throw new Error('Too large');
  name = String(name).slice(0, 80) || 'Room Layout';
  const ex = await one('select id from monitor_plans where job_id=$1 and user_id=$2 and name=$3', [jobId, me.id, name]);
  if (ex) await rows('update monitor_plans set data=$1,updated_at=now() where id=$2', [JSON.stringify(data), ex.id]);
  else await rows('insert into monitor_plans(job_id,user_id,name,data) values($1,$2,$3,$4)', [jobId, me.id, name, JSON.stringify(data)]);
  revalidatePath('/plans');
}
export async function addComment(f: FormData) {
  const me = await requireMe(); const job = Number(s(f,'job')), room = Number(s(f,'room'));
  if (!(await canAccessJob(me, job)) || !(await one('select 1 from job_walls jw join room_walls rw on rw.id=jw.room_wall_id where jw.job_id=$1 and rw.room_id=$2', [job, room]))) throw new Error('Not found');
  if (s(f,'body')) await rows('insert into comments(job_id,room_id,user_id,body) values($1,$2,$3,$4)', [job, room, me.id, s(f,'body').slice(0, 2000)]);
  revalidatePath('/plans');
}

// ---- Extra email addresses on one account (so invitations sent to any of them show up together) ----
export async function addAltEmail(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); const email = s(f, 'email').toLowerCase();
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  if (!(await allow('alt-email', String(me.id), 5, 60))) return TOO_MANY;
  if (!emailOn() && process.env.DEV_SHOW_CODES !== '1') return { error: 'Email sending is not set up yet, so the address cannot be confirmed.' };
  if (email === me.email.toLowerCase() || (await one('select 1 from users where lower(email)=$1', [email])) || (await one('select 1 from user_emails where email=$1 and (verified or user_id<>$2)', [email, me.id])))
    return { error: 'That email address is already in use.' };
  const token = newToken();
  await rows(`insert into user_emails(email,user_id,verified,token_hash,expires_at) values($1,$2,false,$3,now() + interval '2 days')
    on conflict (email) do update set token_hash=$3, expires_at=now() + interval '2 days' where user_emails.user_id=$2 and not user_emails.verified`, [email, me.id, sha256(token)]);
  const link = `${await baseUrl()}/verify-email/${token}`;
  if (await sendMail(email, 'Confirm this email for TelePlanner', `Confirm that ${email} should be added to the TelePlanner account of ${me.name}:\n${link}\n\nThis link expires in 2 days. If you did not ask for this, ignore this email.`))
    return { ok: `We sent a confirmation link to ${email}. Open it to finish adding the address.` };
  return process.env.DEV_SHOW_CODES === '1' ? { ok: 'Test mode - confirm with this link:', link } : { error: 'The confirmation email could not be sent. Try again later.' };
}
export async function removeAltEmail(f: FormData) {
  const me = await requireMe(); await rows('delete from user_emails where email=$1 and user_id=$2', [s(f, 'email').toLowerCase(), me.id]); revalidatePath('/account');
}

// One-click sample data for a tenant admin: a Broadcaster, Production, Room with a Wall, two Jobs and saved Monitor Plans.
export async function loadDemoData() {
  const me = await requireMe(); if (!isAdmin(me) || !me.tenant_id) throw new Error('Admin only');
  const t = tid(me);
  if (await one("select 1 from broadcasters where tenant_id=$1 and name='Demo Broadcaster'", [t])) redirect('/');
  const b = (await one('insert into broadcasters(tenant_id,name) values($1,$2) returning id', [t, 'Demo Broadcaster']))!;
  const p = (await one('insert into productions(broadcaster_id,name) values($1,$2) returning id', [b.id, 'Evening News']))!;
  const site = (await one('insert into sites(tenant_id,name) values($1,$2) returning id', [t, 'Main Studios']))!;
  const loc = (await one('insert into locations(site_id,name) values($1,$2) returning id', [site.id, 'Building A']))!;
  const room = (await one('insert into rooms(location_id,name) values($1,$2) returning id', [loc.id, 'Studio 1 Gallery']))!;
  const assets = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + (i + 1), type: 'monitor', name: 'MON ' + (i + 1), x: 20 + (i % 3) * 340, y: 20 + Math.floor(i / 3) * 200, w: 320, h: 180 }));
  const wt = (await one('insert into wall_templates(tenant_id,broadcaster_id,name,data) values($1,$2,$3,$4) returning id', [t, b.id, 'Main Wall', JSON.stringify({ assets })]))!;
  const rw = (await one('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3) returning id', [room.id, wt.id, 'Main Wall']))!;
  const ss = (await one('insert into source_sets(tenant_id,name,sources) values($1,$2,$3) returning id', [t, 'Studio sources', JSON.stringify(['Camera 1', 'Camera 2', 'Camera 3', 'Graphics', 'Programme', 'Preview', 'Satellite 1', 'Remote guest'])]))!;
  const lays = await rows('select id,tiles from mv_layouts where tenant_id is null order by id limit 2');
  const mk = async (name: string, day: number) => {
    const j = (await one(`insert into jobs(production_id,name,job_date,expires_at,source_set_id) values($1,$2,current_date + $3::int,current_date + $3::int + 30,$4) returning id`, [p.id, name, day, ss.id]))!;
    await rows('insert into job_rooms(job_id,room_id) values($1,$2)', [j.id, room.id]);
    await rows('insert into job_walls(job_id,room_wall_id) values($1,$2)', [j.id, rw.id]);
    await rows('insert into job_users(job_id,user_id) values($1,$2) on conflict do nothing', [j.id, me.id]);
    return j.id as number;
  };
  const plan = async (job: number, name: string, lay: any, srcs: string[]) => {
    const assign: Record<number, string> = {}; (lay?.tiles ?? []).forEach((tl: any, i: number) => { assign[tl.n] = srcs[i % srcs.length]; });
    await rows('insert into monitor_plans(job_id,user_id,name,data) values($1,$2,$3,$4)', [job, me.id, name, JSON.stringify({ [rw.id]: { layoutId: lay?.id, assign } })]);
  };
  const j1 = await mk('Election Night Special', 2), j2 = await mk('Weekly Sports Show', 9);
  await plan(j1, 'Main plan', lays[0], ['Camera 1', 'Camera 2', 'Programme', 'Graphics', 'Preview']);
  await plan(j1, 'Backup plan', lays[1] ?? lays[0], ['Camera 3', 'Remote guest', 'Programme', 'Satellite 1']);
  await plan(j2, 'Main plan', lays[1] ?? lays[0], ['Camera 1', 'Graphics', 'Satellite 1', 'Programme']);
  revalidatePath('/'); redirect('/');
}

// Settings page: send a test email so an admin can check the Resend setup.
export async function sendTestEmail(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  if (!(await allow('test-mail', String(me.id), 10, 60))) return { error: 'Too many test emails. Please wait a while and try again.' };
  const to = (s(f, 'to') || me.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: 'Enter a valid email address.' };
  const r = await sendMailDetailed(to, 'TelePlanner test email', `This is a test email from TelePlanner.\n\nSent: ${new Date().toISOString()}\nFrom: ${mailFrom()}\nSite: ${await baseUrl()}\n\nIf you can read this, email sending works.`);
  return r.ok ? { ok: `Test email sent to ${to}. It should arrive within a minute (check spam too). Resend id: ${r.id ?? 'n/a'}` } : { error: r.error };
}
