'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, isAdmin, createSession, destroySession } from './session';
import { verifyPassword, hashPassword, passwordProblem, newToken, sha256 } from './password';

const tid = (me: any) => me.tenant_id ?? 1;
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
async function mgr() { const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only'); return me; }

// ---- Authentication ----
const MAX_FAILS = 5, LOCK_MIN = 15;
export type FormState = { error?: string; ok?: string; link?: string } | undefined;

export async function signIn(_: FormState, f: FormData): Promise<FormState> {
  const email = s(f, 'email').toLowerCase(), pw = String(f.get('password') ?? '');
  const u = await one('select id,password_hash,failed_attempts,locked_until from users where email=$1', [email]);
  if (u?.locked_until && new Date(u.locked_until) > new Date()) { await verifyPassword(pw, null); return { error: 'Too many attempts. Try again in a few minutes.' }; }
  const ok = await verifyPassword(pw, u?.password_hash);
  if (!u || !ok) {
    if (u) await rows(`update users set failed_attempts=failed_attempts+1, locked_until=case when failed_attempts+1>=$2 then now() + ($3 || ' minutes')::interval else locked_until end where id=$1`, [u.id, MAX_FAILS, String(LOCK_MIN)]);
    return { error: 'Email or password is incorrect.' };
  }
  await rows('update users set failed_attempts=0, locked_until=null where id=$1', [u.id]);
  await createSession(u.id);
  redirect('/');
}
export async function signOut() { await destroySession(); redirect('/signin'); }

export async function acceptInvite(_: FormState, f: FormData): Promise<FormState> {
  const pw = String(f.get('password') ?? ''), pw2 = String(f.get('password2') ?? '');
  if (pw !== pw2) return { error: 'Passwords do not match.' };
  const bad = passwordProblem(pw); if (bad) return { error: bad };
  const u = await one('select id from users where invite_hash=$1 and invite_expires > now()', [sha256(s(f, 'token'))]);
  if (!u) return { error: 'This invite link is invalid or has expired. Ask your Manager for a new one.' };
  await rows('update users set password_hash=$1, invite_hash=null, invite_expires=null, name=coalesce(nullif($3,\'\'),name) where id=$2', [await hashPassword(pw), u.id, s(f, 'name')]);
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
  await rows('delete from sessions where user_id=$1', [me.id]); // sign out everywhere, then back in here
  await createSession(me.id);
  return { ok: 'Password changed. Other devices have been signed out.' };
}

// ---- Tenant Tree (Admin + Manager) ----
export async function addSite(f: FormData) { const me = await mgr(); if (s(f,'name')) await rows('insert into sites(tenant_id,name) values($1,$2)', [tid(me), s(f,'name')]); revalidatePath('/tenant'); }
export async function addLocation(f: FormData) { await mgr(); if (s(f,'name')) await rows('insert into locations(site_id,name) values($1,$2)', [Number(s(f,'parent')), s(f,'name')]); revalidatePath('/tenant'); }
export async function addRoom(f: FormData) { await mgr(); if (s(f,'name')) await rows('insert into rooms(location_id,name) values($1,$2)', [Number(s(f,'parent')), s(f,'name')]); revalidatePath('/tenant'); }
export async function renameNode(f: FormData) {
  await mgr(); const t = s(f,'table'); if (!['sites','locations','rooms'].includes(t)) return;
  await rows(`update ${t} set name=$1 where id=$2`, [s(f,'name'), Number(s(f,'id'))]); revalidatePath('/tenant');
}
export async function addRoomWall(f: FormData) {
  await mgr(); await rows('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [Number(s(f,'room')), Number(s(f,'wall')), s(f,'name') || 'Wall']); revalidatePath('/tenant');
}

// ---- Wall Designer ----
export async function saveWall(id: number | null, name: string, assets: any[]) {
  const me = await mgr();
  if (id) await rows('update wall_templates set name=$1,data=$2 where id=$3 and tenant_id=$4', [name, JSON.stringify({ assets }), id, tid(me)]);
  else id = (await one('insert into wall_templates(tenant_id,name,data) values($1,$2,$3) returning id', [tid(me), name, JSON.stringify({ assets })])).id;
  revalidatePath('/walls'); return id;
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
export async function addProduction(f: FormData) { await mgr(); if (s(f,'name')) await rows('insert into productions(broadcaster_id,name) values($1,$2)', [Number(s(f,'parent')), s(f,'name')]); revalidatePath('/productions'); }
export async function addSourceSet(f: FormData) {
  const me = await mgr(); const list = s(f,'sources').split('\n').map(x => x.trim()).filter(Boolean);
  if (s(f,'name')) await rows('insert into source_sets(tenant_id,name,sources) values($1,$2,$3)', [tid(me), s(f,'name'), JSON.stringify(list)]); revalidatePath('/productions');
}
export async function addJob(f: FormData) {
  await mgr(); const fin = s(f,'final') || s(f,'date') || null, exp = s(f,'expires') || null;
  await rows(`insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id)
    values($1,$2,$3,$4,coalesce($5::date,$4::date+5),$6)`, [Number(s(f,'parent')), s(f,'name'), s(f,'date') || null, fin, exp, Number(s(f,'sourceSet')) || null]);
  revalidatePath('/productions');
}
export async function assignRoom(f: FormData) { await mgr(); await rows('insert into job_rooms(job_id,room_id) values($1,$2) on conflict do nothing', [Number(s(f,'job')), Number(s(f,'room'))]); revalidatePath('/productions'); }
export async function inviteUser(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const email = s(f,'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email address.' };
  const role = ['user', 'onetime'].includes(s(f, 'role')) ? s(f, 'role') : 'user';
  const u = (await one('select id,password_hash from users where email=$1', [email])) ?? (await one("insert into users(email,name,role,tenant_id) values($1,$1,$2,$3) returning id,password_hash", [email, role, role === 'onetime' ? null : tid(me)]));
  await rows('insert into job_users(job_id,user_id) values($1,$2) on conflict do nothing', [Number(s(f,'job')), u.id]);
  revalidatePath('/productions');
  if (u.password_hash) return { ok: `${email} already has an account and now has access to this Job.` };
  const token = newToken();
  await rows("update users set invite_hash=$1, invite_expires=now() + interval '7 days' where id=$2", [sha256(token), u.id]);
  const h = await headers(); const base = process.env.APP_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const link = `${base}/invite/${token}`;
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM || 'Wall Maker <onboarding@resend.dev>', to: email, subject: 'You have been invited to Wall Maker', text: `Set your password and join the Job:\n${link}\n\nThis link expires in 7 days.` }) });
    if (r.ok) return { ok: `Invite emailed to ${email}.` };
  }
  return { ok: `Email sending is not set up. Send this link to ${email} (valid 7 days):`, link };
}
export async function deleteJob(f: FormData) { const me = await requireMe(); if (!isAdmin(me)) throw new Error('Only Admin can delete'); await rows('delete from jobs where id=$1', [Number(s(f,'id'))]); revalidatePath('/archive'); revalidatePath('/productions'); }

// ---- Monitor Plans ----
export async function savePlan(jobId: number, name: string, data: any) {
  const me = await requireMe();
  const ex = await one('select id from monitor_plans where job_id=$1 and user_id=$2 and name=$3', [jobId, me.id, name]);
  if (ex) await rows('update monitor_plans set data=$1,updated_at=now() where id=$2', [JSON.stringify(data), ex.id]);
  else await rows('insert into monitor_plans(job_id,user_id,name,data) values($1,$2,$3,$4)', [jobId, me.id, name, JSON.stringify(data)]);
  revalidatePath('/plans');
}
export async function addComment(f: FormData) {
  const me = await requireMe();
  if (s(f,'body')) await rows('insert into comments(job_id,room_id,user_id,body) values($1,$2,$3,$4)', [Number(s(f,'job')), Number(s(f,'room')), me.id, s(f,'body')]);
  revalidatePath('/plans');
}
