'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { setActiveOrg, myOrgs, getMe } from './session';
export async function switchOrg(f: FormData) {
  const key = String(f.get('org') ?? ''); await setActiveOrg(key);
  const me = await getMe();
  if (me) { const o = (await myOrgs(me.id)).find(x => x.key === (me.membership_id ? String(me.membership_id) : 'home')); if (o) (await cookies()).set('tp-switched', o.name, { maxAge: 15, path: '/', sameSite: 'lax' }); }
  redirect('/');
}
