'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, isAdmin, createSession, destroySession, type Me } from './session';
import { verifyPassword, hashPassword, passwordProblem, newToken, sha256 } from './password';

const tid = (me: any) => me.tenant_id ?? 1;
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export type FormState = { error?: string; ok?: string; link?: string } | undefined;

async function mgr() { const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only'); return me; }

// ---- Tenant isolation: every id from the browser is checked against the signed-in user's tenant ----
const OWN: Record<string, string> = {
  sites: 'select 1 from sites where id=$1 and tenant_id=$2',
  locations: 'select 1 from locations l join sites s on s.id=l.site_id where l.id=$1 and s.tenant_id=$2',
  rooms: 'select 1 from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where r.id=$1 and s.tenant_id=$2',
  walls: 'select 1 from wall_templates where id=$1 and (tenant_id=$2 or tenant_id is null)',
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

// ---- Email (Resend). Without RESEND_API_KEY nothing is sent. ----
const emailOn = () => !!process.env.RESEND_API_KEY;
async function sendMail(to: string, subject: string, text: string) {
  if (!emailOn()) return false;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'Wall Maker <onboarding@resend.dev>', to, subject, text }) });
  return r.ok;
}
async function baseUrl() { const h = await headers(); return process.env.APP_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`; }

// ---- Authentication ----
const MAX_FAILS = 5, LOCK_MIN = 15;

export async function signIn(_: FormState, f: FormData): Promise<FormState> {
  const email = s(f, 'email').toLowerCase(), pw = String(f.get('password') ?? '');
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
  redirect('/');
}
export async function signOut() { await destroySession(); redirect('/signin'); }

// New person: creates their own Tenant (demo plan, 1 wall template) and makes them its Master Admin.
export async function signUp(_: FormState, f: FormData): Promise<FormState> {
  if (s(f, 'website')) return { error: 'Could not create the account.' }; // honeypot for bots
  const name = s(f, 'name').slice(0, 100), org = s(f, 'tenant').slice(0, 100), email = s(f, 'email').toLowerCase(), pw = String(f.get('password') ?? '');
  if (!name || !org) return { error: 'Enter your name and your company or team name.' };
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  if (pw !== String(f.get('password2') ?? '')) return { error: 'Passwords do not match.' };
  const bad = passwordProblem(pw); if (bad) return { error: bad };
  if (await one('select 1 from users where email=$1', [email])) return { error: 'An account with this email already exists. Sign in instead.' };
  const t = await one('insert into tenants(name,plan,max_wall_templates) values($1,\'demo\',1) returning id', [org]);
  const verify = emailOn(), token = newToken();
  const u = await one(`insert into users(tenant_id,email,name,role,password_hash,email_verified,verify_hash,verify_expires)
    values($1,$2,$3,'master_admin',$4,$5,$6,now() + interval '2 days') returning id`, [t.id, email, name, await hashPassword(pw), !verify, verify ? sha256(token) : null]);
  if (verify) {
    const sent = await sendMail(email, 'Verify your Wall Maker account', `Welcome to Wall Maker.\nConfirm your email to finish setting up your account:\n${await baseUrl()}/verify/${token}\n\nThis link expires in 2 days.`);
    if (sent) return { ok: `We sent a verification link to ${email}. Open it to finish creating your account.` };
    await rows('update users set email_verified=true where id=$1', [u.id]); // mail failed: don't lock the person out
  }
  await createSession(u.id);
  redirect('/');
}

export async function requestReset(_: FormState, f: FormData): Promise<FormState> {
  if (!emailOn()) return { error: 'Password reset email is not set up yet. Please contact your administrator.' };
  const email = s(f, 'email').toLowerCase();
  const u = await one('select id from users where email=$1', [email]);
  if (u) {
    const token = newToken();
    await rows("update users set invite_hash=$1, invite_expires=now() + interval '1 hour' where id=$2", [sha256(token), u.id]);
    await sendMail(email, 'Reset your Wall Maker password', `Use this link to set a new password (valid for 1 hour):\n${await baseUrl()}/invite/${token}\n\nIf you did not ask for this, ignore this email.`);
  }
  return { ok: 'If an account exists for that email, a reset link is on its way.' };
}

// Used for invites and password resets (both set a password from a one-time token).
export async function acceptInvite(_: FormState, f: FormData): Promise<FormState> {
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
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  let u = await one('select id,tenant_id,password_hash from users where email=$1', [email]);
  if (u && u.tenant_id && u.tenant_id !== tid(me)) return { error: 'That email already belongs to another team.' };
  if (!u) u = await one("insert into users(email,name,role,tenant_id,email_verified) values($1,$1,$2,$3,true) returning id,tenant_id,password_hash", [email, role, role === 'onetime' ? null : tid(me)]);
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
  if (await sendMail(email, 'You have been invited to Wall Maker', `${me.name} invited you to Wall Maker.\nSet your password to join:\n${link}\n\nThis link expires in 7 days.`)) return { ok: `Invite emailed to ${email}.` };
  return { ok: `Email sending is not set up. Send this link to ${email} (valid 7 days):`, link };
}
export async function inviteUser(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const job = Number(s(f, 'job')); await own('jobs', job, me);
  return invite(me, s(f, 'email').toLowerCase(), ['user', 'onetime'].includes(s(f, 'role')) ? s(f, 'role') : 'user', job);
}
export async function inviteTeam(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr();
  const role = isAdmin(me) && s(f, 'role') === 'manager' ? 'manager' : 'user';
  return invite(me, s(f, 'email').toLowerCase(), role);
}
export async function removeMember(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const id = Number(s(f, 'id')); if (id === me.id) return;
  await rows("delete from users where id=$1 and tenant_id=$2 and role in ('user','manager','admin')", [id, tid(me)]); revalidatePath('/team');
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
  const max = Math.min(Math.max(parseInt(s(f, 'max')) || 1, 0), 100000);
  await rows('update tenants set plan=$1, max_wall_templates=$2 where id=$3', [s(f, 'plan').slice(0, 40) || 'demo', max, Number(s(f, 'id'))]);
  revalidatePath('/webappdev');
}

// ---- Tenant Tree (Admin + Manager) ----
export async function addSite(f: FormData) { const me = await mgr(); if (s(f,'name')) await rows('insert into sites(tenant_id,name) values($1,$2)', [tid(me), s(f,'name')]); revalidatePath('/tenant'); }
export async function addLocation(f: FormData) { const me = await mgr(); const p = Number(s(f,'parent')); await own('sites', p, me); if (s(f,'name')) await rows('insert into locations(site_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/tenant'); }
export async function addRoom(f: FormData) { const me = await mgr(); const p = Number(s(f,'parent')); await own('locations', p, me); if (s(f,'name')) await rows('insert into rooms(location_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/tenant'); }
export async function renameNode(f: FormData) {
  const me = await mgr(); const t = s(f,'table'); if (!['sites','locations','rooms'].includes(t)) return;
  const id = Number(s(f,'id')); await own(t as any, id, me);
  await rows(`update ${t} set name=$1 where id=$2`, [s(f,'name'), id]); revalidatePath('/tenant');
}
export async function addRoomWall(f: FormData) {
  const me = await mgr(); const room = Number(s(f,'room')), wall = Number(s(f,'wall')); await own('rooms', room, me); await own('walls', wall, me);
  await rows('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [room, wall, s(f,'name') || 'Wall']); revalidatePath('/tenant');
}

// ---- Wall Designer (demo tenants are limited by max_wall_templates) ----
export async function saveWall(id: number | null, name: string, assets: any[]): Promise<{ id?: number; error?: string }> {
  const me = await mgr();
  if (!Array.isArray(assets) || assets.length > 300) return { error: 'Too many assets.' };
  const clean = assets.map(a => ({ id: String(a.id).slice(0, 20), type: String(a.type).slice(0, 20), name: String(a.name).slice(0, 60), x: +a.x || 0, y: +a.y || 0, w: +a.w || 10, h: +a.h || 10 }));
  name = String(name).slice(0, 80);
  if (id) { await own('myWalls', id, me); await rows('update wall_templates set name=$1,data=$2 where id=$3', [name, JSON.stringify({ assets: clean }), id]); revalidatePath('/walls'); return { id }; }
  const t = await one('select max_wall_templates m, (select count(*)::int from wall_templates where tenant_id=$1) c from tenants where id=$1', [tid(me)]);
  if (t.c >= t.m) return { error: `Your plan allows ${t.m} Wall Template${t.m === 1 ? '' : 's'} (you have ${t.c}). Contact us to upgrade.` };
  const r = await one('insert into wall_templates(tenant_id,name,data) values($1,$2,$3) returning id', [tid(me), name, JSON.stringify({ assets: clean })]);
  revalidatePath('/walls'); return { id: r.id };
}
export async function deleteWall(f: FormData) { const me = await mgr(); await rows('delete from wall_templates where id=$1 and tenant_id=$2', [Number(s(f,'id')), tid(me)]); revalidatePath('/walls'); }

// ---- MV Layouts: only Admin/Manager create custom ones ----
export async function saveLayout(f: FormData) {
  const me = await mgr(); const n = Math.min(Math.max(Number(s(f,'count')) || 1, 1), 36);
  const cols = Math.ceil(Math.sqrt(n)), rws = Math.ceil(n / cols), tiles: any[] = [];
  for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); tiles.push({ n: i + 1, x: c * 1600 / cols, y: r * 900 / rws, w: 1600 / cols, h: 900 / rws }); }
  await rows('insert into mv_layouts(tenant_id,name,tiles) values($1,$2,$3)', [tid(me), s(f,'name') || `Custom ${n}`, JSON.stringify(tiles)]);
  revalidatePath('/layouts');
}
export async function deleteLayout(f: FormData) { const me = await mgr(); await rows('delete from mv_layouts where id=$1 and tenant_id=$2', [Number(s(f,'id')), tid(me)]); revalidatePath('/layouts'); }

// ---- Productions: Broadcaster > Production > Job ----
export async function addBroadcaster(f: FormData) { const me = await mgr(); if (s(f,'name')) await rows('insert into broadcasters(tenant_id,name) values($1,$2)', [tid(me), s(f,'name')]); revalidatePath('/productions'); }
export async function addProduction(f: FormData) { const me = await mgr(); const p = Number(s(f,'parent')); await own('broadcasters', p, me); if (s(f,'name')) await rows('insert into productions(broadcaster_id,name) values($1,$2)', [p, s(f,'name')]); revalidatePath('/productions'); }
export async function addSourceSet(f: FormData) {
  const me = await mgr(); const list = s(f,'sources').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 500);
  if (s(f,'name')) await rows('insert into source_sets(tenant_id,name,sources) values($1,$2,$3)', [tid(me), s(f,'name'), JSON.stringify(list)]); revalidatePath('/productions');
}
export async function addJob(f: FormData) {
  const me = await mgr(); const p = Number(s(f,'parent')); await own('productions', p, me);
  const ss = Number(s(f,'sourceSet')) || null; if (ss) await own('sourceSets', ss, me);
  const fin = s(f,'final') || s(f,'date') || null, exp = s(f,'expires') || null;
  await rows(`insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id)
    values($1,$2,$3,$4,coalesce($5::date,$4::date+5),$6)`, [p, s(f,'name'), s(f,'date') || null, fin, exp, ss]);
  revalidatePath('/productions');
}
export async function assignRoom(f: FormData) {
  const me = await mgr(); const job = Number(s(f,'job')), room = Number(s(f,'room')); await own('jobs', job, me); await own('rooms', room, me);
  await rows('insert into job_rooms(job_id,room_id) values($1,$2) on conflict do nothing', [job, room]); revalidatePath('/productions');
}
export async function deleteJob(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete');
  const id = Number(s(f, 'id')); await own('jobs', id, me);
  await rows('delete from jobs where id=$1', [id]); revalidatePath('/archive'); revalidatePath('/productions');
}

// ---- Monitor Plans ----
export async function savePlan(jobId: number, name: string, data: any) {
  const me = await requireMe(); if (!(await canAccessJob(me, jobId))) throw new Error('Not found');
  name = String(name).slice(0, 80) || 'Room Layout';
  const ex = await one('select id from monitor_plans where job_id=$1 and user_id=$2 and name=$3', [jobId, me.id, name]);
  if (ex) await rows('update monitor_plans set data=$1,updated_at=now() where id=$2', [JSON.stringify(data), ex.id]);
  else await rows('insert into monitor_plans(job_id,user_id,name,data) values($1,$2,$3,$4)', [jobId, me.id, name, JSON.stringify(data)]);
  revalidatePath('/plans');
}
export async function addComment(f: FormData) {
  const me = await requireMe(); const job = Number(s(f,'job')), room = Number(s(f,'room'));
  if (!(await canAccessJob(me, job)) || !(await one('select 1 from job_rooms where job_id=$1 and room_id=$2', [job, room]))) throw new Error('Not found');
  if (s(f,'body')) await rows('insert into comments(job_id,room_id,user_id,body) values($1,$2,$3,$4)', [job, room, me.id, s(f,'body').slice(0, 2000)]);
  revalidatePath('/plans');
}
