import { redirect } from 'next/navigation';
import { requireMe, canManage } from '@/lib/session';
export const dynamic = 'force-dynamic';
// The Archive now lives at the bottom of Productions (Monitor Plans has its own Archive section for viewing).
export default async function Archive() { const me = await requireMe(); redirect(me.role === 'onetime' ? '/shared' : canManage(me) ? '/productions' : '/plans'); }
