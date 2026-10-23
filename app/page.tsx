import { redirect } from 'next/navigation';
import { requireMe, canManage } from '@/lib/session';
export const dynamic = 'force-dynamic';
export default async function Home() { const me = await requireMe(); redirect(canManage(me) ? '/productions' : '/plans'); }
