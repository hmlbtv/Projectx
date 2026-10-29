import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { one, rows } from '@/lib/db';
import { requireMe, isAdmin } from '@/lib/session';
import { planWalls } from '@/lib/planWalls';
import Defaults from './Defaults';
export const dynamic = 'force-dynamic';

export default async function WallDefaults({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const me = await requireMe(); if (!isAdmin(me)) redirect('/');
  const { id } = await searchParams; const t = me.tenant_id ?? 0;
  const w = await one('select id, name, data, defaults from wall_templates where id=$1 and tenant_id=$2', [Number(id) || 0, t]); if (!w) notFound();
  const [pw] = await planWalls([{ id: w.id, name: w.name, data: w.data }], t);
  const layouts = await rows('select id, name, tiles from mv_layouts where tenant_id is null or tenant_id=$1 order by tenant_id nulls first, id', [t]);
  const lim = (await one('select max_wall_defaults m from tenants where id=$1', [t]))?.m ?? 5;
  return (<><div className="crumbs"><Link href={`/walls?id=${w.id}`} className="btn sec">← Back to {w.name}</Link></div>
    <h1 style={{ marginBottom: 4 }}>Default configuration: {w.name}</h1>
    <p className="mut">Choose the MV layout each monitor starts with. The default marked “Used for new plans” is what people get when this Wall Template is sent to them as a Monitor Plan. You can keep up to {lim}.</p>
    <Defaults wall={{ id: w.id, name: w.name, assets: pw.assets, dests: pw.dests }} layouts={layouts as any} initial={Array.isArray(w.defaults) ? w.defaults : []} limit={lim} /></>);
}
