'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, isAdmin } from './session';

const tid = (me: any) => me.tenant_id ?? 1;
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
async function mgr() { const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only'); return me; }

export async function signIn(f: FormData) {
  const u = await one('select id from users where id=$1', [Number(s(f, 'id'))]);
  if (u) (await cookies()).set('uid', String(u.id), { httpOnly: true, path: '/' });
  redirect('/');
}
export async function signOut() { (await cookies()).delete('uid'); redirect('/signin'); }

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
export async function inviteUser(f: FormData) {
  await mgr(); const email = s(f,'email').toLowerCase(); if (!email) return;
  const u = (await one('select id from users where email=$1', [email])) ?? (await one("insert into users(email,name,role,tenant_id) values($1,$1,'user',1) returning id", [email]));
  await rows('insert into job_users(job_id,user_id) values($1,$2) on conflict do nothing', [Number(s(f,'job')), u.id]);
  // TODO: send the email invite (Resend/Postmark) with a verification link.
  revalidatePath('/productions');
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
