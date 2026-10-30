'use server';
import { audited } from '@/lib/audit';
import { redirect } from 'next/navigation';
import { loadJobPlans, saveJobPlans } from './plans';
import { cookies } from 'next/headers';
import { unseal, checkCode } from './totp';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, isAdmin, createSession, destroySession, resetLimits, type Me } from './session';
import { allow, clientIp } from './security';
import { emailOn, signupBlocked, SIGNUP_BLOCKED_MSG, sendMail, sendMailDetailed, mailFrom, baseUrl } from './mail';
import { verifyPassword, hashPassword, passwordProblem, newToken, sha256 } from './password';

const tid = (me: any) => me.tenant_id ?? 0;
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim().slice(0, k === 'sources' ? 20000 : 200);
const TOO_MANY: FormState = { error: 'Too many requests. Please wait a while and try again.' };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export type FormState = { error?: string; ok?: string; link?: string; step?: string } | undefined;

async function mgr() { const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only'); return me; }
async function adm() { const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only'); return me; }

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
  destSets: 'select 1 from destination_sets where id=$1 and tenant_id=$2',
};
async function own(kind: keyof typeof OWN, id: number, me: Me) {
  if (!id || !(await one(OWN[kind], [id, tid(me)]))) throw new Error('Not found');
}
// A finished Job (past its expiry) is in the Archive: view only.
async function jobOpen(jobId: number) { return !!(await one('select 1 from jobs where id=$1 and (expires_at is null or expires_at >= current_date)', [jobId])); }
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
  if ((await one('select totp_enabled from users where id=$1', [u.id]))?.totp_enabled) { await startTwoFactor(u.id); return { step: '2fa' }; } // password is right; now ask for the authenticator code
  await createSession(u.id);
  const next = s(f, 'next'); redirect(/^\/(?!\/)[\w\-\/]*$/.test(next) ? next : '/');
}
// ---- Two-step sign-in (authenticator app) ----
const TF_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-tp_2fa' : 'tp_2fa';
async function startTwoFactor(userId: number) {
  const token = newToken();
  await rows("insert into login_2fa(id,user_id,expires_at) values($1,$2,now() + interval '5 minutes')", [sha256(token), userId]);
  (await cookies()).set(TF_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 300 });
}
// Finishes a sign-in: a 6-digit code from the authenticator app, or one of the one-time recovery codes.
export async function verifySignIn2fa(_: FormState, f: FormData): Promise<FormState> {
  const jar = await cookies(), tok = jar.get(TF_COOKIE)?.value;
  if (!tok || !(await allow('2fa', await clientIp(), 60, 10))) return tok ? TOO_MANY : { error: 'That sign-in timed out. Enter your password again.', step: 'restart' };
  const p = await one('select l.user_id, l.tries, u.totp_secret, u.totp_last, u.totp_recovery from login_2fa l join users u on u.id=l.user_id where l.id=$1 and l.expires_at > now() and u.totp_enabled', [sha256(tok)]);
  if (!p) return { error: 'That sign-in timed out. Enter your password again.', step: 'restart' };
  if (p.tries >= 5) { await rows('delete from login_2fa where id=$1', [sha256(tok)]); return { error: 'Too many wrong codes. Enter your password again.', step: 'restart' }; }
  const code = s(f, 'code'); let ok = false;
  const secret = p.totp_secret ? unseal(p.totp_secret) : null, step = secret ? checkCode(secret, code, Number(p.totp_last)) : null;
  if (step) { ok = true; await rows('update users set totp_last=$1 where id=$2', [step, p.user_id]); }
  else { const h = sha256(code.toLowerCase().replace(/\s/g, '')), left = (p.totp_recovery as string[]).filter(x => x !== h);
    if (left.length !== (p.totp_recovery as string[]).length) { ok = true; await rows('update users set totp_recovery=$1 where id=$2', [JSON.stringify(left), p.user_id]); } }
  if (!ok) { await rows('update login_2fa set tries=tries+1 where id=$1', [sha256(tok)]); return { error: 'That code is not right. Try the current code from your app, or a recovery code.', step: '2fa' }; }
  await rows('delete from login_2fa where id=$1', [sha256(tok)]); jar.delete(TF_COOKIE);
  await createSession(p.user_id);
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
  if (await one('select 1 from users where email=$1', [email])) {
    // With email set up, answer exactly as for a new sign-up so nobody can use this form to find out who has an account; the real owner gets a note instead.
    if (!emailOn()) return { error: 'An account with this email already exists. Sign in instead.' };
    await sendMail(email, 'Someone tried to create a TelePlanner account with your email', `Someone tried to sign up for TelePlanner with this email address, but you already have an account.\nSign in here: ${await baseUrl()}/signin\nForgot your password? Use "Forgot password" on that page.\n\nIf this was not you, you can ignore this email.`);
    return { ok: `We sent a verification link to ${email}. Open it to finish creating your account.` };
  }
  const t = await one('insert into tenants(name,plan,max_walls_per_broadcaster) values($1,\'demo\',1) returning id', [org]);
  if (signupBlocked()) return { error: SIGNUP_BLOCKED_MSG };
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
  if ((await one('select totp_enabled from users where id=$1', [u.id]))?.totp_enabled) redirect('/signin'); // a reset link must not skip the second step
  await createSession(u.id);
  redirect('/');
}
async function changePassword_(_: FormState, f: FormData): Promise<FormState> {
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
  if (u && u.tenant_id && u.tenant_id !== tid(me)) { // already in another team: don't tell the inviter, tell the person (can only be hidden when email is set up)
    if (!emailOn()) return { error: 'That email already belongs to another team.' };
    await sendMail(email, 'A TelePlanner invitation could not be used', `${me.name} tried to invite you to TelePlanner, but this email address is already part of another team.\nIf you want to join them, ask them to invite a different email address.`);
    return { ok: `Invite emailed to ${email}.` };
  }
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
async function inviteUser_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const job = Number(s(f, 'job')); await own('jobs', job, me);
  return invite(me, s(f, 'email').toLowerCase(), 'user', job);
}
async function inviteTeam_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr();
  const want = s(f, 'role'), top = me.role === 'master_admin' || me.role === 'webappdev';
  const role = top && want === 'master_admin' ? 'master_admin' : isAdmin(me) && want === 'manager' ? 'manager' : 'user';
  return invite(me, s(f, 'email').toLowerCase(), role);
}
// New link (valid 7 days) for someone who was invited but has not set a password yet; the old link stops working.
async function resendInvite_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr();
  const u = await one('select email,role from users where id=$1 and tenant_id=$2 and password_hash is null', [Number(s(f, 'id')), tid(me)]);
  if (!u) return { error: 'That person has already joined, or is not in your team.' };
  return invite(me, u.email, u.role);
}
async function removeMember_(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const id = Number(s(f, 'id')); if (id === me.id) return;
  const tgt = await one('select role from users where id=$1 and tenant_id=$2', [id, tid(me)]); if (!tgt) return;
  if (tgt.role === 'master_admin' && (me.role === 'admin' || id === await founder(tid(me)))) return;
  if (!['user', 'manager', 'admin', 'master_admin'].includes(tgt.role)) return;
  await rows('delete from users where id=$1 and tenant_id=$2', [id, tid(me)]); revalidatePath('/team');
}

// The founding Master Admin (first one on the account) can't be changed by other Master Admins, so an account always keeps an owner.
const founder = async (tenant: number) => (await one("select min(id) id from users where tenant_id=$1 and role='master_admin'", [tenant]))?.id ?? 0;
async function setUserRole_(f: FormData) {
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
async function setUserSuspended_(f: FormData) {
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
async function setUserMaxJobs_(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const max = Math.min(Math.max(parseInt(s(f, 'max')), 0) || 0, 1000);
  await rows("update users set max_jobs=$1 where id=$2 and tenant_id=$3 and role='user'", [max, Number(s(f, 'id')), tid(me)]); revalidatePath('/team');
}
async function removeJobUser_(f: FormData) {
  const me = await mgr(); const job = Number(s(f, 'job')); await own('jobs', job, me);
  await rows('delete from job_users where job_id=$1 and user_id=$2', [job, Number(s(f, 'user'))]); revalidatePath('/productions'); revalidatePath('/team');
}

// ---- Site admin (WebAppDev): plans and limits per tenant ----
export async function setTenantPlan(f: FormData) {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const n = (k: string, d: number) => { const v = parseInt(s(f, k)); return Number.isFinite(v) ? Math.min(Math.max(v, 0), 100000) : d; };
  await rows('update tenants set plan=$1, max_walls_per_broadcaster=$2, max_broadcasters=$3, max_productions=$4, max_jobs_per_production=$5, max_wall_defaults=$7 where id=$6',
    [s(f, 'plan').slice(0, 40) || 'demo', n('max', 1), n('b', 2), n('p', 3), n('j', 4), Number(s(f, 'id')), n('wd', 5)]);
  revalidatePath('/webappdev');
}

async function saveSessionSettings_(f: FormData) {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const idle = Math.min(Math.max(Math.round(Number(s(f, 'idle'))), 0), 720), days = Math.min(Math.max(Math.round(Number(s(f, 'days'))), 1), 90);
  if (!Number.isFinite(idle) || !Number.isFinite(days)) return;
  for (const [k, v] of [['idle_hours', idle], ['max_days', days]]) await rows('insert into settings(key,value) values($1,$2) on conflict (key) do update set value=excluded.value', [k, String(v)]);
  resetLimits(); revalidatePath('/webappdev');
}
// ---- Default MV configurations of a Wall Template (Admin): up to the workspace's limit, one of them is the starting point of every new Monitor Plan ----
type WDef = { id: string; name: string; mons: Record<string, number>; active?: boolean };
async function wallDefs(me: Me, wall: number) {
  const w = await one('select id, defaults from wall_templates where id=$1 and tenant_id=$2', [wall, tid(me)]); if (!w) throw new Error('Not found');
  const lim = (await one('select max_wall_defaults m from tenants where id=$1', [tid(me)]))?.m ?? 5;
  return { list: (Array.isArray(w.defaults) ? w.defaults : []) as WDef[], lim: me.role === 'webappdev' && !me.tenant_id ? 100000 : lim as number };
}
const putDefs = async (wall: number, list: WDef[]) => { await rows('update wall_templates set defaults=$1::jsonb where id=$2', [JSON.stringify(list), wall]); revalidatePath('/walls'); revalidatePath('/plans'); };
export async function saveWallDefault(wall: number, id: string | null, name: string, mons: Record<string, number>): Promise<{ id?: string; error?: string }> {
  const me = await adm(); const { list, lim } = await wallDefs(me, Number(wall));
  const clean: Record<string, number> = {}; for (const [k, v] of Object.entries(mons ?? {})) if (Number.isInteger(v)) clean[String(k).slice(0, 80)] = v;
  const nm = String(name ?? '').trim().slice(0, 60) || `Default ${list.length + 1}`;
  const at = id ? list.findIndex(x => x.id === id) : -1;
  if (at >= 0) list[at] = { ...list[at], name: nm, mons: clean };
  else { if (list.length >= lim) return { error: `This workspace can keep ${lim} default configuration${lim === 1 ? '' : 's'} per Wall Template.` }; id = Math.random().toString(36).slice(2, 10); list.push({ id, name: nm, mons: clean, active: list.length === 0 }); }
  await putDefs(Number(wall), list); return { id: id! };
}
export async function deleteWallDefault(wall: number, id: string) {
  const me = await adm(); const { list } = await wallDefs(me, Number(wall)); const next = list.filter(x => x.id !== id);
  if (next.length && !next.some(x => x.active)) next[0].active = true; await putDefs(Number(wall), next);
}
export async function setActiveWallDefault(wall: number, id: string | null) {
  const me = await adm(); const { list } = await wallDefs(me, Number(wall)); await putDefs(Number(wall), list.map(x => ({ ...x, active: x.id === id })));
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
  await rows('delete from wall_images where tenant_id=$1', [id]);
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
async function addSite_(_: FormState, f: FormData): Promise<FormState> { const me = await mgr(); if (s(f,'name')) await rows('insert into sites(tenant_id,name) values($1,$2)', [tid(me), s(f,'name')]); revalidatePath('/tenant'); return { ok: 'Added.' }; }
async function addLocation_(_: FormState, f: FormData): Promise<FormState> { const me = await mgr(); const p = Number(s(f,'parent')); await own('sites', p, me); if (s(f,'name')) await rows('insert into locations(site_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/tenant'); return { ok: 'Added.' }; }
async function addRoom_(_: FormState, f: FormData): Promise<FormState> { const me = await mgr(); const p = Number(s(f,'parent')); await own('locations', p, me); if (s(f,'name')) await rows('insert into rooms(location_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/tenant'); return { ok: 'Added.' }; }
async function renameNode_(f: FormData) {
  const me = await mgr(); const t = s(f,'table'); if (!['sites','locations','rooms'].includes(t)) return;
  const id = Number(s(f,'id')); await own(t as any, id, me);
  await rows(`update ${t} set name=$1 where id=$2`, [s(f,'name'), id]); revalidatePath('/tenant');
}
async function addRoomWall_(_: FormState, f: FormData): Promise<FormState> {
  const me = await adm(); const room = Number(s(f,'room')), wall = Number(s(f,'wall')); await own('rooms', room, me); await own('walls', wall, me);
  const inRoom = await one('select r.name from room_walls rw join rooms r on r.id=rw.room_id where rw.wall_template_id=$1 limit 1', [wall]); // a Wall Template can be in only one Room
  if (inRoom) return { error: `That Wall Template is already in the Room “${inRoom.name}”. A Wall Template can be in only one Room.` };
  const wn = (await one('select name from wall_templates where id=$1', [wall]))!.name;
  await rows('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [room, wall, wn]); revalidatePath('/walls'); revalidatePath('/tenant'); return { ok: 'Added.' };
}
async function renameRoomWall_(f: FormData) {
  const me = await adm(); const id = Number(s(f,'id'));
  if (s(f,'name')) await rows(`update room_walls set name=$1 where id=$2 and room_id in (select r.id from rooms r join locations l on l.id=r.location_id join sites st on st.id=l.site_id where st.tenant_id=$3)`, [s(f,'name'), id, tid(me)]);
  revalidatePath('/tenant'); revalidatePath('/plans');
}
// Deleting removes everything underneath (Locations, Rooms, walls placed in them). Admin only.
async function deleteNode_(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const t = s(f,'table'); if (!['sites','locations','rooms'].includes(t)) return;
  const id = Number(s(f,'id')); await own(t as any, id, me);
  const roomsSql = t === 'rooms' ? 'select $1::int' : t === 'locations' ? 'select id from rooms where location_id=$1' : 'select r.id from rooms r join locations l on l.id=r.location_id where l.site_id=$1';
  await rows(`delete from job_rooms where room_id in (${roomsSql})`, [id]);
  await rows(`delete from comments where room_id in (${roomsSql})`, [id]).catch(() => {});
  if (t === 'sites') { await rows('delete from room_walls where wall_template_id in (select id from wall_templates where site_id=$1)', [id]); await rows('delete from wall_templates where site_id=$1', [id]); }
  await rows(`delete from ${t} where id=$1`, [id]); revalidatePath('/tenant'); revalidatePath('/walls'); revalidatePath('/productions'); revalidatePath('/plans');
}

async function removeRoomWall_(f: FormData) {
  const me = await adm(); const id = Number(s(f, 'id'));
  // only if the Room it sits in belongs to this tenant
  await rows(`delete from room_walls where id=$1 and room_id in (select r.id from rooms r join locations l on l.id=r.location_id join sites st on st.id=l.site_id where st.tenant_id=$2)`, [id, tid(me)]);
  revalidatePath('/tenant'); revalidatePath('/plans');
}

// ---- Wall Designer (Wall Templates live in a library and are applied to any Rooms; demo tenants get 1) ----
async function saveWall_(id: number | null, name: string, assets: any[], _unused?: number | null): Promise<{ id?: number; error?: string }> {
  const me = await adm();
  if (!Array.isArray(assets) || assets.length > 300) return { error: 'Too many assets.' };
  const c = (v: any, lo: number, hi: number, d = lo) => Math.round(Math.min(Math.max(Number.isFinite(+v) ? +v : d, lo), hi));
  const clean = assets.map(a => { const w = c(a.w, 10, 1600, 10), h = c(a.h, 10, 900, 10), rot = c(a.props?.rot, 0, 3, 0);
    return { id: String(a.id).slice(0, 20), type: String(a.type).slice(0, 20), name: String(a.name ?? '').slice(0, 60), x: c(a.x, 0, 1600 - w, 0), y: c(a.y, 0, 900 - h, 0), w, h, ...(rot ? { props: { rot } } : {}) }; });
  name = String(name).slice(0, 80);
  // Multiview templates assigned to monitors: keep only ones this workspace can see (Standard or its own).
  const ok = new Set((await rows('select id from mv_layouts where tenant_id is null or tenant_id=$1', [tid(me)])).map((r: any) => r.id));
  assets.forEach((a, i) => { const m = Array.isArray(a.props?.mvs) ? Array.from(new Set(a.props.mvs.map(Number))).filter((x: any) => ok.has(x)).slice(0, 200) : []; if (m.length) (clean[i] as any).props = { ...(clean[i] as any).props, mvs: m }; });
  const myImgs = new Set((await rows('select id from wall_images where tenant_id=$1', [tid(me)])).map((r: any) => r.id));
  assets.forEach((a, i) => { const n = Math.round(+a.props?.img); if (String(a.type) === 'img' && myImgs.has(n)) (clean[i] as any).props = { ...(clean[i] as any).props, img: n, ...(a.props?.hasAlpha ? { hasAlpha: true } : {}), ...(a.props?.hasAlpha && a.props?.useAlpha === false ? { useAlpha: false } : {}) }; });
  assets.forEach((a, i) => { const q = a.props; if (String(a.type) !== 'txt' || !q) return; const sz = Math.round(+q.size);
    (clean[i] as any).props = { ...(clean[i] as any).props, text: String(q.text ?? '').slice(0, 300), size: sz >= 6 && sz <= 400 ? sz : 28, bold: !!q.bold, italic: !!q.italic, underline: !!q.underline,
      align: ['left', 'center', 'right'].includes(q.align) ? q.align : 'left', font: ['Sans', 'Serif', 'Mono'].includes(q.font) ? q.font : 'Sans', color: /^#[0-9a-f]{6}$/i.test(String(q.color)) ? q.color : '#e6e9ef' }; });
  assets.forEach((a, i) => { const mp = Math.round(+a.props?.maxPip); if (mp >= 1 && mp <= 64) (clean[i] as any).props = { ...(clean[i] as any).props, maxPip: mp }; });
  const myDests = new Map<number, number>((await rows('select d.id, d.set_id from destinations d join destination_sets s on s.id=d.set_id where s.tenant_id=$1', [tid(me)])).map((r: any) => [r.id, r.set_id]));
  assets.forEach((a, i) => { const ds = Math.round(+a.props?.destSet); if (!ds || !Array.isArray(a.props?.dests)) return;
    const list = Array.from(new Set(a.props.dests.map(Number))).filter((x: any) => myDests.get(x) === ds).slice(0, 64); if (list.length) (clean[i] as any).props = { ...(clean[i] as any).props, destSet: ds, dests: list }; });
  if (id) { await own('myWalls', id, me); await rows('update wall_templates set name=$1,data=$2 where id=$3', [name, JSON.stringify({ assets: clean }), id]); revalidatePath('/walls'); return { id }; }
  const t = (await one('select max_walls_per_broadcaster m, (select count(*)::int from wall_templates where tenant_id=$1) c from tenants where id=$1', [tid(me)]))!;
  if (me.role !== 'webappdev' && t.c >= t.m) return { error: `Your plan allows ${t.m} Wall Template${t.m === 1 ? '' : 's'} per workspace (you have ${t.c}). Contact us to upgrade.` };
  const r = (await one('insert into wall_templates(tenant_id,name,data) values($1,$2,$3) returning id', [tid(me), name, JSON.stringify({ assets: clean })]))!;
  revalidatePath('/walls'); return { id: r.id };
}
// Apply a Wall Template to the chosen Rooms (any Room in the workspace). Unticked Rooms lose it (and Jobs using it there).
async function setWallRooms_(f: FormData) {
  const me = await adm(); const wall = Number(s(f,'wall')); await own('walls', wall, me);
  const want = Array.from(new Set(f.getAll('room').map(Number).filter(Boolean))).slice(0, 1); // a Wall Template can be in only one Room
  for (const r of want) await own('rooms', r, me);
  const w = (await one('select name from wall_templates where id=$1', [wall]))!;
  await rows('delete from room_walls where wall_template_id=$1 and not (room_id = any($2::int[]))', [wall, want]);
  for (const r of want) if (!(await one('select 1 from room_walls where wall_template_id=$1 and room_id=$2', [wall, r]))) await rows('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [r, wall, w.name]);
  revalidatePath('/walls'); revalidatePath('/tenant'); revalidatePath('/productions'); revalidatePath('/plans');
}
async function wallToRoom_(f: FormData) {
  const me = await adm(); const wall = Number(s(f,'wall')), room = Number(s(f,'room')); await own('walls', wall, me); await own('rooms', room, me);
  if (await one('select 1 from room_walls where wall_template_id=$1', [wall])) return; // already in a Room (only one allowed)
  const w = (await one('select name from wall_templates where id=$1', [wall]))!;
  await rows('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [room, wall, w.name]);
  revalidatePath('/walls'); revalidatePath('/tenant'); revalidatePath('/plans');
}
async function wallFromRoom_(f: FormData) {
  const me = await adm(); const wall = Number(s(f,'wall')), room = Number(s(f,'room')); await own('walls', wall, me); await own('rooms', room, me);
  await rows('delete from room_walls where room_id=$1 and wall_template_id=$2', [room, wall]);
  revalidatePath('/walls'); revalidatePath('/tenant'); revalidatePath('/productions'); revalidatePath('/plans');
}
async function deleteWall_(f: FormData) { const me = await adm(); await rows('delete from room_walls where wall_template_id in (select id from wall_templates where id=$1 and tenant_id=$2)', [Number(s(f,'id')), tid(me)]); revalidatePath('/tenant'); await rows('delete from wall_templates where id=$1 and tenant_id=$2', [Number(s(f,'id')), tid(me)]); revalidatePath('/walls'); }

// ---- MV Tiles (Tile Designer): the site admin makes Standard tiles for everyone; Admin/Manager make custom tiles for their own tenant ----
const TILE_TYPES = ['umd', 'audio', 'tally', 'clock'];
const TILE_PROPS: Record<string, string[]> = { umd: ['text'], audio: ['channels', 'orientation'], tally: ['state', 'style'], clock: ['format'] };
async function saveTile_(p: { id: number | null; name: string; assets: any[]; asNew: boolean; flags?: Record<string, boolean> }): Promise<{ id?: number; error?: string }> {
  const me = await adm();
  if (!Array.isArray(p.assets) || p.assets.length > 500) return { error: 'A tile can hold up to 500 assets.' };
  const assets: any[] = [];
  for (const a of p.assets) {
    if (!a || !TILE_TYPES.includes(a.type)) return { error: 'Unknown asset type.' };
    const n = (v: any, lo: number, hi: number) => Math.round(Math.min(Math.max(+v || 0, lo), hi));
    const w = n(a.w, 20, 1920), h = n(a.h, 20, 1080), props: Record<string, any> = {};
    for (const k of TILE_PROPS[a.type]) { const v = a.props?.[k]; props[k] = typeof v === 'number' ? n(v, 1, 16) : String(v ?? '').slice(0, 40); }
    props.rot = ((n(a.props?.rot, 0, 3) % 4) + 4) % 4;
    assets.push({ id: String(a.id).slice(0, 20), type: a.type, name: String(a.name ?? '').slice(0, 60), x: n(a.x, 0, 1920 - w), y: n(a.y, 0, 1080 - h), w, h, props });
  }
  const name = String(p.name ?? '').trim().slice(0, 80) || 'Untitled tile', top = me.role === 'webappdev', standard = top && !!p.flags?.standard;
  if (p.id && !p.asNew) {
    const r = await one(top ? 'select 1 from mv_tiles where id=$1 and (tenant_id=$2 or tenant_id is null)' : 'select 1 from mv_tiles where id=$1 and tenant_id=$2', [p.id, tid(me)]);
    if (!r) return { error: top ? 'Tile not found.' : 'Only the site admin can change a Standard tile. Copy it to make your own.' };
    await rows(top ? 'update mv_tiles set name=$1, assets=$2, tenant_id=$4 where id=$3' : 'update mv_tiles set name=$1, assets=$2 where id=$3', top ? [name, JSON.stringify(assets), p.id, standard ? null : tid(me)] : [name, JSON.stringify(assets), p.id]);
    revalidatePath('/tiles'); return { id: p.id };
  }
  if (!top && ((await one('select count(*)::int c from mv_tiles where tenant_id=$1', [tid(me)]))!.c >= 200)) return { error: 'You have reached the limit of 200 custom tiles.' };
  const r = (await one('insert into mv_tiles(tenant_id,name,assets) values($1,$2,$3) returning id', [standard ? null : tid(me), name, JSON.stringify(assets)]))!;
  revalidatePath('/tiles'); return { id: r.id };
}
async function copyTile_(f: FormData) {
  const me = await adm(); const src = await one('select name,assets,tenant_id from mv_tiles where id=$1 and (tenant_id=$2 or tenant_id is null)', [Number(s(f, 'id')), tid(me)]); if (!src) return;
  if (me.role !== 'webappdev' && ((await one('select count(*)::int c from mv_tiles where tenant_id=$1', [tid(me)]))!.c >= 200)) return;
  const r = await one('insert into mv_tiles(tenant_id,name,assets) values($1,$2,$3) returning id', [me.role === 'webappdev' && !src.tenant_id ? null : tid(me), (src.name + ' copy').slice(0, 80), JSON.stringify(src.assets)]);
  revalidatePath('/tiles'); redirect(`/tiles?id=${r!.id}`);
}
async function renameTile_(f: FormData) {
  const me = await adm(); const name = s(f, 'name').slice(0, 80); if (!name) return;
  await rows(me.role === 'webappdev' ? 'update mv_tiles set name=$1 where id=$2 and (tenant_id=$3 or tenant_id is null)' : 'update mv_tiles set name=$1 where id=$2 and tenant_id=$3', [name, Number(s(f, 'id')), tid(me)]); revalidatePath('/tiles');
}
// Site admin only: make a tile Standard (visible to every tenant) or back into a tile private to the site admin's own tenant.
async function setTileStandard_(f: FormData) {
  const me = await adm(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  await rows('update mv_tiles set tenant_id=$1 where id=$2 and (tenant_id=$3 or tenant_id is null)', [s(f, 'standard') === '1' ? null : tid(me), Number(s(f, 'id')), tid(me)]); revalidatePath('/tiles');
}
async function deleteTile_(f: FormData) {
  const me = await adm();
  await rows(me.role === 'webappdev' ? 'delete from mv_tiles where id=$1 and (tenant_id=$2 or tenant_id is null)' : 'delete from mv_tiles where id=$1 and tenant_id=$2', [Number(s(f, 'id')), tid(me)]); revalidatePath('/tiles');
}

// ---- MV Layouts: only Admin/Manager create custom ones ----
async function saveLayout_(_: FormState, f: FormData): Promise<FormState> {
  const me = await adm(); const n = Math.min(Math.max(Number(s(f,'count')) || 1, 1), 36);
  // Every monitor is 16:9: pick the grid (columns x rows) with the biggest 16:9 cells that holds n, and centre it in the frame.
  let cols = 1, rws = n, cw = 0;
  for (let c = 1; c <= n; c++) { const r = Math.ceil(n / c), w = Math.min(1920 / c, (1080 / r) * 16 / 9); if (w > cw + 1e-9 || (Math.abs(w - cw) < 1e-9 && c * r <= cols * rws)) { cw = w; cols = c; rws = r; } }
  const ch = cw * 9 / 16, ox = (1920 - cw * cols) / 2, oy = (1080 - ch * rws) / 2, tiles: any[] = [];
  for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); tiles.push({ n: i + 1, x: Math.round(ox + c * cw), y: Math.round(oy + r * ch), w: Math.round(cw), h: Math.round(ch) }); }
  // Only the site admin can make a Standard (global) layout, visible to every tenant.
  const standard = me.role === 'webappdev' && s(f, 'standard') === '1';
  await rows('insert into mv_layouts(tenant_id,name,tiles) values($1,$2,$3)', [standard ? null : tid(me), s(f,'name') || `Custom ${n}`, JSON.stringify(tiles)]);
  revalidatePath('/layouts'); return { ok: 'Added.' };
}
// Text boxes and pictures placed on an MV Layout, plus its background picture (one of the workspace's saved images).
async function cleanExtras(raw: any, tenant: number) {
  const mine = new Set((await rows('select id from wall_images where tenant_id=$1', [tenant])).map((r: any) => r.id));
  const c = (v: any, lo: number, hi: number, d = lo) => Math.round(Math.min(Math.max(Number.isFinite(+v) ? +v : d, lo), hi));
  const bg = Math.round(+raw?.bg); const items: any[] = [];
  for (const a of (Array.isArray(raw?.items) ? raw.items : []).slice(0, 100)) {
    const type = String(a?.type); if (!['txt', 'img', 'tc', 'tcl'].includes(type)) continue;
    const w = c(a.w, 10, 1920, 10), h = c(a.h, 10, 1080, 10), o: any = { id: String(a.id).slice(0, 20), type, name: String(a.name ?? '').slice(0, 60), x: c(a.x, 0, 1920 - w, 0), y: c(a.y, 0, 1080 - h, 0), w, h }, q = a.props ?? {}, rot = c(q.rot, 0, 3, 0);
    const pr: any = rot ? { rot } : {};
    if (type === 'img') { const n = Math.round(+q.img); if (!mine.has(n)) continue; pr.img = n; if (q.hasAlpha) { pr.hasAlpha = true; if (q.useAlpha === false) pr.useAlpha = false; } }
    else if (type === 'txt') { const sz = Math.round(+q.size); Object.assign(pr, { text: String(q.text ?? '').slice(0, 300), size: sz >= 6 && sz <= 600 ? sz : 60, bold: !!q.bold, italic: !!q.italic, underline: !!q.underline, align: ['left', 'center', 'right'].includes(q.align) ? q.align : 'left', font: ['Sans', 'Serif', 'Mono'].includes(q.font) ? q.font : 'Sans', color: /^#[0-9a-f]{6}$/i.test(String(q.color)) ? q.color : '#ffffff' }); }
    if (Object.keys(pr).length) o.props = pr; items.push(o);
  }
  return { ...(mine.has(bg) ? { bg, ...(raw?.bgHasAlpha ? { bgHasAlpha: true } : {}), ...(raw?.bgHasAlpha && raw?.bgUseAlpha === false ? { bgUseAlpha: false } : {}) } : {}), items };
}
async function saveLayoutTiles_(p: { id: number; name: string; tiles: any[]; asNew: boolean; flags?: Record<string, boolean>; extras?: any }): Promise<{ id?: number; error?: string }> {
  const me = await adm(); const top = me.role === 'webappdev';
  if (!Array.isArray(p.tiles) || p.tiles.length < 1 || p.tiles.length > 64) return { error: 'A layout needs 1 to 64 monitors.' };
  const src = await one('select tenant_id from mv_layouts where id=$1 and (tenant_id=$2 or tenant_id is null)', [Number(p.id), tid(me)]); if (!src) return { error: 'Layout not found.' };
  // A tenant can't change a Standard layout: saving one makes the tenant's own copy and leaves the Standard one as it was.
  const fork = !top && !p.asNew && !src.tenant_id; if (fork) p.asNew = true;
  if (!top && !p.asNew && src.tenant_id !== tid(me)) return { error: 'Layout not found.' };
  const seen = new Set<number>(), tiles: any[] = [];
  const vis = new Set<number>((await rows('select id from mv_tiles where tenant_id=$1 or tenant_id is null', [tid(me)])).map((x: any) => x.id));
  for (const a of p.tiles) {
    const n = Math.round(+a?.n), r = (v: any, lo: number, hi: number) => Math.round(Math.min(Math.max(+v || 0, lo), hi));
    if (!(n >= 1 && n <= 999) || seen.has(n)) return { error: 'Monitor numbers must be unique.' }; seen.add(n);
    const w = r(a.w, 20, 1920), h = r(a.h, 20, 1080), o: any = { n, x: r(a.x, 0, 1920 - w), y: r(a.y, 0, 1080 - h), w, h };
    if (a.tileId && vis.has(Number(a.tileId))) o.tileId = Number(a.tileId); tiles.push(o);
  }
  const extras = JSON.stringify(await cleanExtras(p.extras, tid(me)));
  tiles.sort((a, b) => a.n - b.n); let name = String(p.name ?? '').trim().slice(0, 80) || 'Untitled layout';
  if (fork) { const o = await one('select name from mv_layouts where id=$1', [Number(p.id)]); if (o && o.name === name) name = (name + ' (mine)').slice(0, 80); }
  // Only the site admin can make a layout Standard (shared with every tenant) or take that away again.
  const owner = top && p.flags && 'standard' in p.flags ? (p.flags.standard ? null : tid(me)) : src.tenant_id;
  if (!p.asNew) { await rows('update mv_layouts set name=$1, tiles=$2, tenant_id=$4, extras=$5 where id=$3', [name, JSON.stringify(tiles), Number(p.id), top ? owner : src.tenant_id, extras]); revalidatePath('/layouts'); revalidatePath('/plans'); return { id: Number(p.id) }; }
  const r = (await one('insert into mv_layouts(tenant_id,name,tiles,extras) values($1,$2,$3,$4) returning id', [top ? owner : tid(me), name, JSON.stringify(tiles), extras]))!; revalidatePath('/layouts'); return { id: r.id };
}
// One-off: adds the layouts converted from a Kaleido database (data/kaleido-layouts.json) as Standard layouts. Safe to repeat: names that already exist are skipped.
export async function importKaleidoLayouts() {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const data: { name: string; tiles: any[] }[] = (await import('../data/kaleido-layouts.json')).default as any;
  const have = new Set((await rows('select name from mv_layouts where tenant_id is null')).map((r: any) => r.name)); let added = 0;
  for (const l of data) { if (have.has(l.name)) continue; await rows('insert into mv_layouts(tenant_id,name,tiles) values(null,$1,$2)', [l.name, JSON.stringify(l.tiles)]); added++; }
  revalidatePath('/layouts'); redirect('/webappdev?imported=' + added + '&of=' + data.length);
}
// Site admin: swap the Standard layouts for the neat versions (every window exactly 16:9, equal-size small windows, edges lined up, centred in the frame).
// Tiles already placed on a window stay on the nearest window of the new layout. Layouts not in the file, and tenants' own layouts, are left alone.
export async function tidyStandardLayouts() {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const data: Record<string, any[]> = (await import('../data/tidy-layouts.json')).default as any; let n = 0;
  for (const l of await rows('select id,name,tiles from mv_layouts where tenant_id is null')) {
    const next = data[l.name]; if (!next) continue;
    const old: any[] = (l.tiles || []).filter((o: any) => o.tileId), free = [...old];
    const tiles = next.map((t: any) => { const cx = t.x + t.w / 2, cy = t.y + t.h / 2; let bi = -1, bd = 1e12;
      free.forEach((o, i) => { const d = (o.x + o.w / 2 - cx) ** 2 + (o.y + o.h / 2 - cy) ** 2; if (d < bd) { bd = d; bi = i; } });
      if (bi < 0) return { ...t }; const [o] = free.splice(bi, 1); return { ...t, tileId: o.tileId }; });
    if (JSON.stringify(tiles) !== JSON.stringify(l.tiles)) { await rows('update mv_layouts set tiles=$1 where id=$2', [JSON.stringify(tiles), l.id]); n++; }
  }
  revalidatePath('/layouts'); redirect('/webappdev?tidied=' + n);
}
async function copyLayout_(f: FormData) {
  const me = await adm(); const src = await one('select name,tiles,extras,tenant_id from mv_layouts where id=$1 and (tenant_id=$2 or tenant_id is null)', [Number(s(f, 'id')), tid(me)]); if (!src) return;
  const ex = JSON.stringify(src.tenant_id ? src.extras : await cleanExtras(src.extras, tid(me))); // a Standard layout's pictures belong to the site owner, so a copy keeps only ones this workspace has
  const r = (await one('insert into mv_layouts(tenant_id,name,tiles,extras) values($1,$2,$3,$4) returning id', [tid(me), (src.name + ' copy').slice(0, 80), JSON.stringify(src.tiles), ex]))!;
  revalidatePath('/layouts'); redirect('/layouts?id=' + r.id);
}
// Site admin: promote a layout to Standard (shared with every tenant) or move it back to the site admin's own tenant.
async function setLayoutStandard_(f: FormData) {
  const me = await adm(); if (me.role !== 'webappdev') return;
  const id = Number(s(f, 'id')), std = s(f, 'standard') === '1';
  await rows('update mv_layouts set tenant_id=$1 where id=$2', [std ? null : tid(me), id]);
  revalidatePath('/layouts');
}
async function deleteLayout_(f: FormData) { const me = await adm(); await rows(me.role === 'webappdev' ? 'delete from mv_layouts where id=$1 and (tenant_id=$2 or tenant_id is null)' : 'delete from mv_layouts where id=$1 and tenant_id=$2', [Number(s(f,'id')), tid(me)]); revalidatePath('/layouts'); }

// ---- Productions: Broadcaster > Production > Job ----
// Plan limits (demo default: 2 Broadcasters, 3 Productions each, 4 active Jobs each; the site admin can change them per tenant)
// The site admin (webappdev) is never limited.
const NO_LIMIT = { b: 1e9, p: 1e9, j: 1e9 };
async function limits(me: Me) { if (me.role === 'webappdev') return NO_LIMIT; return (await one('select max_broadcasters b, max_productions p, max_jobs_per_production j from tenants where id=$1', [tid(me)]))!; }
async function addBroadcaster_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const l = await limits(me);
  const c = (await one('select count(*)::int c from broadcasters where tenant_id=$1', [tid(me)]))!.c;
  if (c >= l.b) return { error: `Your plan allows ${l.b} Broadcaster${l.b === 1 ? '' : 's'}. Contact us to upgrade.` };
  if (s(f,'name')) await rows('insert into broadcasters(tenant_id,name) values($1,$2)', [tid(me), s(f,'name')]); revalidatePath('/productions'); return { ok: 'Added.' };
}
async function addProduction_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const p = Number(s(f,'parent')); await own('broadcasters', p, me); const l = await limits(me);
  const c = (await one('select count(*)::int c from productions where broadcaster_id=$1', [p]))!.c;
  if (c >= l.p) return { error: `Your plan allows ${l.p} Production${l.p === 1 ? '' : 's'} per Broadcaster.` };
  if (s(f,'name')) await rows('insert into productions(broadcaster_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/productions'); return { ok: 'Added.' };
}
async function addSourceSet_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const list = s(f,'sources').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 500);
  if (s(f,'name')) await rows('insert into source_sets(tenant_id,name,sources) values($1,$2,$3)', [tid(me), s(f,'name'), JSON.stringify(list)]); revalidatePath('/sources'); revalidatePath('/productions'); return { ok: 'Added.' };
}
async function updateSourceSet_(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('sourceSets', id, me);
  const list = s(f,'sources').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 500);
  if (s(f,'name')) await rows('update source_sets set name=$1,sources=$2 where id=$3', [s(f,'name'), JSON.stringify(list), id]); revalidatePath('/sources');
}
async function deleteSourceSet_(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('sourceSets', id, me);
  await rows('update jobs set source_set_id=null where source_set_id=$1', [id]); await rows('delete from source_sets where id=$1', [id]); revalidatePath('/sources'); revalidatePath('/productions');
}
// ---- Destination Sets: the named outputs (e.g. "UHD 5") of a Site. A monitor in a Wall Template is given some of them, in order, and the multiview windows take those names. ----
const destNames = (txt: string) => Array.from(new Set(txt.split('\n').map(x => x.trim().slice(0, 60)).filter(Boolean))).slice(0, 200);
// Keeps each destination's identity (so monitors keep pointing at it): same name keeps its row, a changed line takes over a leftover old row (a rename), extras are added or removed.
async function syncDests(setId: number, names: string[]) {
  const old = await rows('select id,name from destinations where set_id=$1 order by pos,id', [setId]) as { id: number; name: string }[];
  const used = new Set<number>(), pick = new Map<string, number>();
  for (const n of names) { const o = old.find(x => x.name === n && !used.has(x.id)); if (o) { used.add(o.id); pick.set(n, o.id); } }
  const spare = old.filter(x => !used.has(x.id));
  for (let i = 0; i < names.length; i++) {
    const n = names[i]; let id = pick.get(n);
    if (!id) { const o = spare.shift(); if (o) { id = o.id; await rows('update destinations set name=$1 where id=$2', [n, id]); } else id = (await one('insert into destinations(set_id,name) values($1,$2) returning id', [setId, n]))!.id; }
    await rows('update destinations set pos=$1 where id=$2', [i, id]); used.add(id!);
  }
  for (const o of old) if (!used.has(o.id)) await rows('delete from destinations where id=$1', [o.id]);
}
async function addDestSet_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const site = Number(s(f, 'site')); await own('sites', site, me); const name = s(f, 'name');
  if (!name) return { error: 'Give the Destination Set a name.' };
  if (((await one('select count(*)::int c from destination_sets where tenant_id=$1', [tid(me)]))!).c >= 200) return { error: 'Destination Set limit reached.' };
  const r = (await one('insert into destination_sets(tenant_id,site_id,name) values($1,$2,$3) returning id', [tid(me), site, name.slice(0, 80)]))!;
  await syncDests(r.id, destNames(String(f.get('dests') ?? ''))); revalidatePath('/tenant'); revalidatePath('/walls'); return { ok: 'Added.' };
}
async function updateDestSet_(f: FormData) {
  const me = await mgr(); const id = Number(s(f, 'id')); await own('destSets', id, me); const name = s(f, 'name').slice(0, 80);
  if (name) await rows('update destination_sets set name=$1 where id=$2', [name, id]);
  await syncDests(id, destNames(String(f.get('dests') ?? ''))); revalidatePath('/tenant'); revalidatePath('/walls');
}
async function deleteDestSet_(f: FormData) {
  const me = await mgr(); const id = Number(s(f, 'id')); await own('destSets', id, me);
  await rows('delete from destination_sets where id=$1', [id]); revalidatePath('/tenant'); revalidatePath('/walls');
}
// Archive: copy an old Job into a new one for the same Production, with its walls and Monitor Plans but no dates.
async function copyJobToNew_(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('jobs', id, me); const l = await limits(me);
  const src = await one('select * from jobs where id=$1', [id]); if (!src) throw new Error('Not found');
  const c = (await one('select count(*)::int c from jobs where production_id=$1 and (expires_at is null or expires_at >= current_date)', [src.production_id]))!.c;
  if (c >= l.j) throw new Error(`Your plan allows ${l.j} active Job${l.j === 1 ? '' : 's'} per Production.`);
  const nj = (await one('insert into jobs(production_id,name,source_set_id) values($1,$2,$3) returning id', [src.production_id, `${src.name} (copy)`.slice(0, 120), src.source_set_id]))!.id;
  await rows('insert into job_walls(job_id,room_wall_id) select $1, room_wall_id from job_walls where job_id=$2', [nj, id]);
  await rows('insert into job_wall_plans(job_id,room_wall_id,data,updated_by) select $1, room_wall_id, data, $3 from job_wall_plans where job_id=$2', [nj, id, me.id]);
  revalidatePath('/productions'); redirect(`/productions?j=${nj}`);
}
async function addJob_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const p = Number(s(f,'parent')); await own('productions', p, me); const l = await limits(me);
  const c = (await one('select count(*)::int c from jobs where production_id=$1 and (expires_at is null or expires_at >= current_date)', [p]))!.c;
  if (c >= l.j) return { error: `Your plan allows ${l.j} active Job${l.j === 1 ? '' : 's'} per Production.` };
  const ss = Number(s(f,'sourceSet')) || null; if (ss) await own('sourceSets', ss, me);
  const fin = s(f,'final') || s(f,'date') || null, exp = s(f,'expires') || null;
  await rows(`insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id)
    values($1,$2,$3,$4,coalesce($5::date,$4::date+5),$6)`, [p, s(f,'name'), s(f,'date') || null, fin, exp, ss]);
  revalidatePath('/productions'); return { ok: 'Added.' };
}
async function updateBroadcaster_(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('broadcasters', id, me);
  if (s(f,'name')) await rows('update broadcasters set name=$1 where id=$2', [s(f,'name'), id]); revalidatePath('/productions');
}
async function updateProduction_(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('productions', id, me);
  if (s(f,'name')) await rows('update productions set name=$1 where id=$2', [s(f,'name'), id]); revalidatePath('/productions');
}
async function updateJob_(f: FormData) {
  const me = await mgr(); const id = Number(s(f,'id')); await own('jobs', id, me);
  const ss = Number(s(f,'sourceSet')) || null; if (ss) await own('sourceSets', ss, me);
  const fin = s(f,'final') || s(f,'date') || null, exp = s(f,'expires') || null;
  if (s(f,'name')) await rows(`update jobs set name=$1,job_date=$2,final_date=$3,expires_at=coalesce($4::date,$3::date+5),source_set_id=$5 where id=$6`, [s(f,'name'), s(f,'date') || null, fin, exp, ss, id]);
  revalidatePath('/productions'); revalidatePath('/plans');
}
// Deleting removes everything underneath (Productions, Jobs, their Monitor Plans and guest links). Admin only.
async function deleteProduction_(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const id = Number(s(f,'id')); await own('productions', id, me);
  await rows('delete from productions where id=$1', [id]); revalidatePath('/productions'); revalidatePath('/plans');
}
async function deleteBroadcaster_(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const id = Number(s(f,'id')); await own('broadcasters', id, me);
  await rows('delete from broadcasters where id=$1', [id]); revalidatePath('/productions'); revalidatePath('/walls'); revalidatePath('/tenant');
}
// A Wall Template sits in a Room (Sites page); a Job is then given the specific walls it will plan.
const OWN_RW = 'select 1 from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where rw.id=$1 and s.tenant_id=$2';
async function assignWall_(f: FormData) {
  const me = await mgr(); const job = Number(s(f,'job')), wall = Number(s(f,'wall')); await own('jobs', job, me);
  if (!wall || !(await one(OWN_RW, [wall, tid(me)]))) throw new Error('Not found');
  await rows('insert into job_walls(job_id,room_wall_id) values($1,$2) on conflict do nothing', [job, wall]); revalidatePath('/productions'); revalidatePath('/plans');
}
// Add (or take away) many walls at once: everything in a Site, Location or Room.
const wallIds = (f: FormData) => Array.from(new Set(f.getAll('wall').map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, 500);
async function assignWalls_(f: FormData) {
  const me = await mgr(); const job = Number(s(f,'job')); await own('jobs', job, me);
  const ok = wallIds(f).length ? (await rows('select rw.id from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites st on st.id=l.site_id where rw.id = any($1::int[]) and st.tenant_id=$2', [wallIds(f), tid(me)])).map((x: any) => x.id) : [];
  if (ok.length) await rows('insert into job_walls(job_id,room_wall_id) select $1, unnest($2::int[]) on conflict do nothing', [job, ok]);
  revalidatePath('/productions'); revalidatePath('/plans');
}
async function unassignWalls_(f: FormData) {
  const me = await mgr(); const job = Number(s(f,'job')); await own('jobs', job, me);
  if (wallIds(f).length) await rows('delete from job_walls where job_id=$1 and room_wall_id = any($2::int[])', [job, wallIds(f)]);
  revalidatePath('/productions'); revalidatePath('/plans');
}
async function unassignWall_(f: FormData) {
  const me = await mgr(); const job = Number(s(f,'job')), wall = Number(s(f,'wall')); await own('jobs', job, me);
  await rows('delete from job_walls where job_id=$1 and room_wall_id=$2', [job, wall]); revalidatePath('/productions'); revalidatePath('/plans');
}
async function deleteJob_(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const id = Number(s(f, 'id')); await own('jobs', id, me);
  await rows('delete from jobs where id=$1', [id]); revalidatePath('/archive'); revalidatePath('/productions'); revalidatePath('/plans');
}

// ---- Monitor Plans ----
async function savePlan_(jobId: number, _name: string, data: any) {
  const me = await requireMe(); if (!(await canAccessJob(me, jobId)) || !(await jobOpen(jobId))) throw new Error('Not found');
  await saveJobPlans(jobId, data ?? {}, me.id); // the plan is shared: one per wall in the Job
  revalidatePath('/plans');
}
// Latest shared plans for a Job (used to pick up other people's changes).
export async function loadPlans(jobId: number): Promise<Record<string, any>> {
  const me = await requireMe(); if (!(await canAccessJob(me, jobId))) throw new Error('Not found');
  return loadJobPlans(jobId);
}
// Copy a saved Monitor Plan (from another Job, including one that has expired) into this Job. Each wall is matched by its place in a Room, or failing that by its Wall Template.
// Only the monitors' chosen MV layouts and sources that still exist on the wall are kept.
async function copyPlan_(f: FormData) {
  const me = await requireMe(); const job = Number(s(f, 'job')), planId = Number(s(f, 'plan'));
  if (!(await canAccessJob(me, job)) || !(await jobOpen(job))) throw new Error('Not found');
  // planId is the Job whose plans are being copied (any Job in the same workspace that this person can open).
  if (!(await canAccessJob(me, planId)) || planId === job) throw new Error('Not found');
  const src = { job_id: planId, data: await loadJobPlans(planId) as Record<string, any> };
  const walls = await rows('select rw.id, rw.wall_template_id wt, r.location_id loc, w.data from job_walls jw join room_walls rw on rw.id=jw.room_wall_id join rooms r on r.id=rw.room_id join wall_templates w on w.id=rw.wall_template_id where jw.job_id=$1', [job]);
  const old = await rows('select rw.id, rw.wall_template_id wt, r.location_id loc from room_walls rw join rooms r on r.id=rw.room_id where rw.id = any($1::int[])', [Object.keys(src.data ?? {}).map(Number).filter(Boolean)]);
  const wtOf = new Map<number, number>(old.map((o: any) => [o.id, o.wt])), locOf = new Map<number, number>(old.map((o: any) => [o.id, o.loc]));
  // A plan belongs to its Location: it can only be copied onto walls in that same Location.
  const out: Record<string, any> = {};
  for (const w of walls) {
    const key = (src.data ?? {})[w.id] ? String(w.id) : Object.keys(src.data ?? {}).find(k => wtOf.get(Number(k)) === w.wt && locOf.get(Number(k)) === w.loc && !walls.some((x: any) => String(x.id) === k));
    if (key && locOf.get(Number(key)) !== w.loc) continue;
    const d = key ? src.data[key] : null; if (!d) continue;
    const assets: any[] = Array.isArray(w.data?.assets) ? w.data.assets : [], mons: Record<string, number> = {};
    for (const [aid, lid] of Object.entries(d.mons ?? {})) { const a = assets.find(x => x.id === aid); if (a && Array.isArray(a.props?.mvs) && a.props.mvs.includes(Number(lid))) mons[aid] = Number(lid); }
    out[w.id] = { ...(d.layoutId ? { layoutId: d.layoutId } : {}), assign: d.assign ?? {}, ...(Object.keys(mons).length ? { mons } : {}) };
  }
  if (!Object.keys(out).length) { redirect(`/plans?job=${job}&copied=none`); } // nothing in a shared Location
  await saveJobPlans(job, out, me.id);
  revalidatePath('/plans'); redirect(`/plans?job=${job}`);
}
async function addComment_(f: FormData) {
  const me = await requireMe(); const job = Number(s(f,'job')), wall = Number(s(f,'wall'));
  const w = await one('select rw.id, rw.room_id from job_walls jw join room_walls rw on rw.id=jw.room_wall_id where jw.job_id=$1 and rw.id=$2', [job, wall]);
  if (!(await canAccessJob(me, job)) || !w || !(await jobOpen(job))) throw new Error('Not found');
  if (s(f,'body')) await rows('insert into comments(job_id,room_id,room_wall_id,user_id,body) values($1,$2,$3,$4,$5)', [job, w.room_id, wall, me.id, s(f,'body').slice(0, 2000)]);
  revalidatePath('/plans');
}

// One-click sample data for a tenant admin: a Broadcaster, Production, Room with a Wall, two Jobs and saved Monitor Plans.
async function loadDemoData_() {
  const me = await requireMe(); if (!isAdmin(me) || !me.tenant_id) throw new Error('Admin only');
  const t = tid(me);
  if (await one("select 1 from broadcasters where tenant_id=$1 and name='Demo Broadcaster'", [t])) redirect('/');
  const b = (await one('insert into broadcasters(tenant_id,name) values($1,$2) returning id', [t, 'Demo Broadcaster']))!;
  const p = (await one('insert into productions(broadcaster_id,name) values($1,$2) returning id', [b.id, 'Evening News']))!;
  const site = (await one('insert into sites(tenant_id,name) values($1,$2) returning id', [t, 'Main Studios']))!;
  const loc = (await one('insert into locations(site_id,name) values($1,$2) returning id', [site.id, 'Building A']))!;
  const room = (await one('insert into rooms(location_id,name) values($1,$2) returning id', [loc.id, 'Studio 1 Gallery']))!;
  const assets = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + (i + 1), type: 'monitor', name: 'MON ' + (i + 1), x: 20 + (i % 3) * 340, y: 20 + Math.floor(i / 3) * 200, w: 320, h: 180 }));
  const wt = (await one('insert into wall_templates(tenant_id,site_id,name,data) values($1,$2,$3,$4) returning id', [t, site.id, 'Main Wall', JSON.stringify({ assets })]))!;
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
    await saveJobPlans(job, { [rw.id]: { layoutId: lay?.id, assign } }, me.id);
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

// Audit trail: each of these is recorded (who, what, when) once it succeeds.
export async function inviteUser(...a: Parameters<typeof inviteUser_>) { return audited('inviteUser', inviteUser_, a) as ReturnType<typeof inviteUser_>; }
export async function inviteTeam(...a: Parameters<typeof inviteTeam_>) { return audited('inviteTeam', inviteTeam_, a) as ReturnType<typeof inviteTeam_>; }
export async function resendInvite(...a: Parameters<typeof resendInvite_>) { return audited('resendInvite', resendInvite_, a) as ReturnType<typeof resendInvite_>; }
export async function removeMember(...a: Parameters<typeof removeMember_>) { return audited('removeMember', removeMember_, a) as ReturnType<typeof removeMember_>; }
export async function setUserRole(...a: Parameters<typeof setUserRole_>) { return audited('setUserRole', setUserRole_, a) as ReturnType<typeof setUserRole_>; }
export async function setUserSuspended(...a: Parameters<typeof setUserSuspended_>) { return audited('setUserSuspended', setUserSuspended_, a) as ReturnType<typeof setUserSuspended_>; }
export async function setUserMaxJobs(...a: Parameters<typeof setUserMaxJobs_>) { return audited('setUserMaxJobs', setUserMaxJobs_, a) as ReturnType<typeof setUserMaxJobs_>; }
export async function removeJobUser(...a: Parameters<typeof removeJobUser_>) { return audited('removeJobUser', removeJobUser_, a) as ReturnType<typeof removeJobUser_>; }
export async function saveSessionSettings(...a: Parameters<typeof saveSessionSettings_>) { return audited('saveSessionSettings', saveSessionSettings_, a) as ReturnType<typeof saveSessionSettings_>; }
export async function changePassword(...a: Parameters<typeof changePassword_>) { return audited('changePassword', changePassword_, a) as ReturnType<typeof changePassword_>; }
export async function addSite(...a: Parameters<typeof addSite_>) { return audited('addSite', addSite_, a) as ReturnType<typeof addSite_>; }
export async function addLocation(...a: Parameters<typeof addLocation_>) { return audited('addLocation', addLocation_, a) as ReturnType<typeof addLocation_>; }
export async function addRoom(...a: Parameters<typeof addRoom_>) { return audited('addRoom', addRoom_, a) as ReturnType<typeof addRoom_>; }
export async function renameNode(...a: Parameters<typeof renameNode_>) { return audited('renameNode', renameNode_, a) as ReturnType<typeof renameNode_>; }
export async function deleteNode(...a: Parameters<typeof deleteNode_>) { return audited('deleteNode', deleteNode_, a) as ReturnType<typeof deleteNode_>; }
export async function addRoomWall(...a: Parameters<typeof addRoomWall_>) { return audited('addRoomWall', addRoomWall_, a) as ReturnType<typeof addRoomWall_>; }
export async function renameRoomWall(...a: Parameters<typeof renameRoomWall_>) { return audited('renameRoomWall', renameRoomWall_, a) as ReturnType<typeof renameRoomWall_>; }
export async function removeRoomWall(...a: Parameters<typeof removeRoomWall_>) { return audited('removeRoomWall', removeRoomWall_, a) as ReturnType<typeof removeRoomWall_>; }
export async function setWallRooms(...a: Parameters<typeof setWallRooms_>) { return audited('setWallRooms', setWallRooms_, a) as ReturnType<typeof setWallRooms_>; }
export async function wallToRoom(...a: Parameters<typeof wallToRoom_>) { return audited('wallToRoom', wallToRoom_, a) as ReturnType<typeof wallToRoom_>; }
export async function wallFromRoom(...a: Parameters<typeof wallFromRoom_>) { return audited('wallFromRoom', wallFromRoom_, a) as ReturnType<typeof wallFromRoom_>; }
export async function saveWall(...a: Parameters<typeof saveWall_>) { return audited('saveWall', saveWall_, a) as ReturnType<typeof saveWall_>; }
export async function deleteWall(...a: Parameters<typeof deleteWall_>) { return audited('deleteWall', deleteWall_, a) as ReturnType<typeof deleteWall_>; }
export async function saveTile(...a: Parameters<typeof saveTile_>) { return audited('saveTile', saveTile_, a) as ReturnType<typeof saveTile_>; }
export async function copyTile(...a: Parameters<typeof copyTile_>) { return audited('copyTile', copyTile_, a) as ReturnType<typeof copyTile_>; }
export async function renameTile(...a: Parameters<typeof renameTile_>) { return audited('renameTile', renameTile_, a) as ReturnType<typeof renameTile_>; }
export async function setTileStandard(...a: Parameters<typeof setTileStandard_>) { return audited('setTileStandard', setTileStandard_, a) as ReturnType<typeof setTileStandard_>; }
export async function deleteTile(...a: Parameters<typeof deleteTile_>) { return audited('deleteTile', deleteTile_, a) as ReturnType<typeof deleteTile_>; }
export async function saveLayout(...a: Parameters<typeof saveLayout_>) { return audited('saveLayout', saveLayout_, a) as ReturnType<typeof saveLayout_>; }
export async function saveLayoutTiles(...a: Parameters<typeof saveLayoutTiles_>) { return audited('saveLayoutTiles', saveLayoutTiles_, a) as ReturnType<typeof saveLayoutTiles_>; }
export async function copyLayout(...a: Parameters<typeof copyLayout_>) { return audited('copyLayout', copyLayout_, a) as ReturnType<typeof copyLayout_>; }
export async function setLayoutStandard(...a: Parameters<typeof setLayoutStandard_>) { return audited('setLayoutStandard', setLayoutStandard_, a) as ReturnType<typeof setLayoutStandard_>; }
export async function deleteLayout(...a: Parameters<typeof deleteLayout_>) { return audited('deleteLayout', deleteLayout_, a) as ReturnType<typeof deleteLayout_>; }
export async function addBroadcaster(...a: Parameters<typeof addBroadcaster_>) { return audited('addBroadcaster', addBroadcaster_, a) as ReturnType<typeof addBroadcaster_>; }
export async function addProduction(...a: Parameters<typeof addProduction_>) { return audited('addProduction', addProduction_, a) as ReturnType<typeof addProduction_>; }
export async function addDestSet(...a: Parameters<typeof addDestSet_>) { return audited('addDestSet', addDestSet_, a) as ReturnType<typeof addDestSet_>; }
export async function updateDestSet(...a: Parameters<typeof updateDestSet_>) { return audited('updateDestSet', updateDestSet_, a) as ReturnType<typeof updateDestSet_>; }
export async function deleteDestSet(...a: Parameters<typeof deleteDestSet_>) { return audited('deleteDestSet', deleteDestSet_, a) as ReturnType<typeof deleteDestSet_>; }
export async function addSourceSet(...a: Parameters<typeof addSourceSet_>) { return audited('addSourceSet', addSourceSet_, a) as ReturnType<typeof addSourceSet_>; }
export async function updateSourceSet(...a: Parameters<typeof updateSourceSet_>) { return audited('updateSourceSet', updateSourceSet_, a) as ReturnType<typeof updateSourceSet_>; }
export async function deleteSourceSet(...a: Parameters<typeof deleteSourceSet_>) { return audited('deleteSourceSet', deleteSourceSet_, a) as ReturnType<typeof deleteSourceSet_>; }
export async function addJob(...a: Parameters<typeof addJob_>) { return audited('addJob', addJob_, a) as ReturnType<typeof addJob_>; }
export async function updateBroadcaster(...a: Parameters<typeof updateBroadcaster_>) { return audited('updateBroadcaster', updateBroadcaster_, a) as ReturnType<typeof updateBroadcaster_>; }
export async function updateProduction(...a: Parameters<typeof updateProduction_>) { return audited('updateProduction', updateProduction_, a) as ReturnType<typeof updateProduction_>; }
export async function updateJob(...a: Parameters<typeof updateJob_>) { return audited('updateJob', updateJob_, a) as ReturnType<typeof updateJob_>; }
export async function deleteProduction(...a: Parameters<typeof deleteProduction_>) { return audited('deleteProduction', deleteProduction_, a) as ReturnType<typeof deleteProduction_>; }
export async function deleteBroadcaster(...a: Parameters<typeof deleteBroadcaster_>) { return audited('deleteBroadcaster', deleteBroadcaster_, a) as ReturnType<typeof deleteBroadcaster_>; }
export async function deleteJob(...a: Parameters<typeof deleteJob_>) { return audited('deleteJob', deleteJob_, a) as ReturnType<typeof deleteJob_>; }
export async function assignWall(...a: Parameters<typeof assignWall_>) { return audited('assignWall', assignWall_, a) as ReturnType<typeof assignWall_>; }
export async function assignWalls(...a: Parameters<typeof assignWalls_>) { return audited('assignWalls', assignWalls_, a) as ReturnType<typeof assignWalls_>; }
export async function unassignWalls(...a: Parameters<typeof unassignWalls_>) { return audited('unassignWalls', unassignWalls_, a) as ReturnType<typeof unassignWalls_>; }
export async function unassignWall(...a: Parameters<typeof unassignWall_>) { return audited('unassignWall', unassignWall_, a) as ReturnType<typeof unassignWall_>; }
export async function copyPlan(...a: Parameters<typeof copyPlan_>) { return audited('copyPlan', copyPlan_, a) as ReturnType<typeof copyPlan_>; }
export async function savePlan(...a: Parameters<typeof savePlan_>) { return audited('savePlan', savePlan_, a) as ReturnType<typeof savePlan_>; }
export async function copyJobToNew(...a: Parameters<typeof copyJobToNew_>) { return audited('copyJobToNew', copyJobToNew_, a) as ReturnType<typeof copyJobToNew_>; }
export async function addComment(...a: Parameters<typeof addComment_>) { return audited('addComment', addComment_, a) as ReturnType<typeof addComment_>; }
export async function loadDemoData(...a: Parameters<typeof loadDemoData_>) { return audited('loadDemoData', loadDemoData_, a) as ReturnType<typeof loadDemoData_>; }
