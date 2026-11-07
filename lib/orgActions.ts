'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { setActiveOrg, myOrgs, getMe, requireMe } from './session';
import { rows } from './db';
import { audited } from './audit';
export async function switchOrg(f: FormData) {
  const key = String(f.get('org') ?? ''); await setActiveOrg(key);
  const me = await getMe();
  if (me) { const o = (await myOrgs(me.id)).find(x => x.key === (me.membership_id ? String(me.membership_id) : 'home')); if (o) (await cookies()).set('tp-switched', o.name, { maxAge: 15, path: '/', sameSite: 'lax' }); }
  redirect('/');
}

// The Master Admin (owner) of a workspace can change its name. Nobody else can, and it only ever changes the workspace they are working in.
async function renameWorkspace_(f: FormData) {
  const me = await requireMe(); if (me.role !== 'master_admin' || !me.tenant_id) throw new Error('Only the owner can rename the workspace');
  const name = String(f.get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!name) redirect('/account?err=' + encodeURIComponent('Enter a name for the workspace.'));
  await rows('update tenants set name=$1 where id=$2', [name, me.tenant_id]);
  revalidatePath('/', 'layout'); redirect('/account?saved=1');
}
export async function renameWorkspace(...a: Parameters<typeof renameWorkspace_>) { return audited('renameWorkspace', renameWorkspace_, a); }
