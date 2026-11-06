'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, setActiveOrg } from './session';
import { signupBlocked, SIGNUP_BLOCKED_MSG } from './mail';
import { giveDemoOnLogin } from './demoSite';
const n = (f: FormData, k: string) => Number(f.get(k)) || 0;
// Accept or decline an invitation to another organization. Only the invited account can do this.
export async function acceptInvite(f: FormData) {
  const me = await requireMe(); const id = n(f, 'id');
  await rows('update memberships set accepted=true where id=$1 and user_id=$2', [id, me.id]); revalidatePath('/', 'layout'); redirect('/organizations');
}
export async function declineInvite(f: FormData) {
  const me = await requireMe(); const id = n(f, 'id');
  const m = await one<{ tenant_id: number }>('select tenant_id from memberships where id=$1 and user_id=$2 and not accepted', [id, me.id]); if (!m) return;
  await rows('delete from job_users where user_id=$1 and job_id in (select j.id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$2)', [me.id, m.tenant_id]);
  await rows('delete from memberships where id=$1', [id]); revalidatePath('/', 'layout'); redirect('/organizations');
}
// Leave an organization yourself. The founding Master Admin can't leave; leaving your home organization needs another one to move to.
export async function leaveOrg(f: FormData) {
  const me = await requireMe(); const key = String(f.get('org') ?? '');
  if (me.role === 'webappdev') return;
  if (key === 'home') {
    const h = await one<{ tenant_id: number; role: string }>('select tenant_id, role from users where id=$1', [me.id]); if (!h || h.role === 'master_admin') return;
    const alt = await one<{ id: number; tenant_id: number; role: string }>('select id,tenant_id,role from memberships where user_id=$1 and accepted order by id limit 1', [me.id]); if (!alt) return;
    await rows('delete from job_users where user_id=$1 and job_id in (select j.id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$2)', [me.id, h.tenant_id]);
    await rows('update users set tenant_id=$2, role=$3 where id=$1', [me.id, alt.tenant_id, alt.role]);
    await rows('delete from memberships where id=$1', [alt.id]);
  } else {
    const m = await one<{ id: number; tenant_id: number; role: string }>('select id,tenant_id,role from memberships where id=$1 and user_id=$2', [Number(key) || 0, me.id]); if (!m || m.role === 'master_admin') return;
    await rows('delete from job_users where user_id=$1 and job_id in (select j.id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$2)', [me.id, m.tenant_id]);
    await rows('delete from memberships where id=$1', [m.id]);
  }
  await rows('update sessions set membership_id=null where user_id=$1', [me.id]); // everyone goes back to their (possibly new) home
  revalidatePath('/', 'layout'); redirect('/organizations');
}

// Someone who joined another organization by invitation can still start their own workspace (on the Demo plan) with the same login, instead of signing up again.
// One workspace of their own per person. They switch between it and the organizations they belong to from the Organizations page.
export async function ownsWorkspace(userId: number): Promise<boolean> {
  return !!(await one("select 1 from users where id=$1 and role='master_admin' union all select 1 from memberships where user_id=$1 and role='master_admin' and accepted limit 1", [userId]));
}
export async function createOwnWorkspace(f: FormData) {
  const me = await requireMe(); if (me.role === 'webappdev') return;
  const name = String(f.get('name') ?? '').trim().slice(0, 100);
  const bad = (m: string): never => redirect('/organizations?err=' + encodeURIComponent(m));
  if (!name) bad('Enter a name for your workspace.');
  if (await ownsWorkspace(me.id)) bad('You already have a workspace of your own.');
  if (signupBlocked()) bad(SIGNUP_BLOCKED_MSG);
  const t = await one<{ id: number }>("insert into tenants(name,plan,max_walls_per_broadcaster) values($1,'demo',1) returning id", [name]);
  const m = await one<{ id: number }>("insert into memberships(user_id,tenant_id,role,accepted) values($1,$2,'master_admin',true) returning id", [me.id, t!.id]);
  await giveDemoOnLogin(t!.id);
  await setActiveOrg(String(m!.id));
  revalidatePath('/', 'layout'); redirect('/');
}
