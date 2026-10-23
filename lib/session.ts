import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one } from './db';

export type Me = { id: number; name: string; email: string; role: string; tenant_id: number | null };
export const canManage = (me: Me) => ['webappdev', 'master_admin', 'admin', 'manager'].includes(me.role);
export const isAdmin = (me: Me) => ['webappdev', 'master_admin', 'admin'].includes(me.role);

// Demo auth: cookie holds a user id. Replace with real auth (email invite + verification) before launch.
export async function getMe(): Promise<Me | null> {
  const id = (await cookies()).get('uid')?.value;
  if (!id) return null;
  return (await one<Me>('select id,name,email,role,tenant_id from users where id=$1', [Number(id)])) ?? null;
}
export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/signin');
  return me;
}
