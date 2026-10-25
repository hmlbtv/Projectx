import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { LayoutPreview } from './Preview';
import { saveLayout, deleteLayout, copyLayout } from '@/lib/actions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
import Link from 'next/link';
import LayoutEditor from './LayoutEditor';
export const dynamic = 'force-dynamic';

export default async function Layouts({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const ls = await rows('select * from mv_layouts where tenant_id=$1 or tenant_id is null order by tenant_id nulls first, id', [t]);
  const { id } = await searchParams, top = me.role === 'webappdev';
  const tl = await rows('select id,name,assets,tenant_id from mv_tiles where tenant_id=$1 or tenant_id is null order by tenant_id nulls first, name', [t]);
  const tileMap: Record<number, any[]> = Object.fromEntries(tl.map((x: any) => [x.id, x.assets]));
  if (id) { const cur = ls.find((x: any) => String(x.id) === id); if (!cur) redirect('/layouts');
    const std = !top && !cur.tenant_id;
    return (<><h1 style={{ margin: '0 0 12px' }}>MV Designer</h1>
      <LayoutEditor key={cur.id} id={cur.id} name={cur.name} tiles={cur.tiles} tileList={tl.map((x: any) => ({ id: x.id, name: x.name, assets: x.assets, mine: !!x.tenant_id }))}
        notice={std ? (<div className="card dz-note"><span>This is a Standard layout from the TelePlanner team. Change it as you like: Save makes your own copy and the Standard one stays as it is for everyone.</span></div>) : undefined} /></>); }
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>MV Designer</h1>
      <AddDialog inline action={saveLayout} label="Add MV Layout" title="New MV Layout" placeholder="Layout name"><label className="mut">Number of tiles<input name="count" type="number" min="1" max="36" defaultValue="4" /></label>
        {me.role === 'webappdev' && <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" name="standard" value="1" style={{ minHeight: 0, width: 'auto' }} /> Standard (all tenants)</label>}</AddDialog></div>
    <p className="mut">Standard 16:9 frame. Standard layouts are set by the site admin and shared with every tenant. Custom layouts are private to your Tenant and only Admin/Manager can make them. Click a layout to edit it and put Tiles on its monitors.</p>
    <div className="tiles">
      {ls.map((l: any) => (<div key={l.id} className="card tile"><Link href={`/layouts?id=${l.id}`} className="tilelink"><LayoutPreview tiles={l.tiles} tileMap={tileMap} /><b>{l.name}</b>{!l.tenant_id && <span><span className="tag">standard</span></span>}</Link>
        {(l.tenant_id || me.role === 'webappdev') && <Menu><form action={deleteLayout} className="del-row"><input type="hidden" name="id" value={l.id} /><span className="mut">Delete this layout? Monitor Plans using it lose their tile layout.</span><button className="del">Yes, delete</button></form></Menu>}</div>))}</div></>);
}
