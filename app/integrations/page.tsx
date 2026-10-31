import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireMe, canManage } from '@/lib/session';
import { loadConfig, TARGETS } from '@/lib/integration';
import Integration from './Integration';
export const dynamic = 'force-dynamic';

export default async function Integrations() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const c = await loadConfig(me.tenant_id ?? 0);
  return (<><div className="crumbs"><Link href="/productions" className="btn sec">← Productions</Link></div>
    <h1 style={{ margin: '8px 0' }}>Scheduling integration</h1>
    <p className="mut">Connect TelePlanner to a scheduling system that can return your bookings as JSON over HTTPS. You choose which of its fields fill each TelePlanner field, check a preview, then import. Jobs that already exist are skipped, so you can import again whenever the schedule changes.</p>
    <Integration targets={TARGETS} initial={c ? { name: c.name, url: c.url, auth_header: c.auth_header, hasKey: !!c.auth_value, records_path: c.records_path, mapping: c.mapping ?? {} } : null} /></>);
}
