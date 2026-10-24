import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { LayoutPreview } from './Preview';
import { saveLayout, deleteLayout } from '@/lib/actions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
export const dynamic = 'force-dynamic';

export default async function Layouts() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const ls = await rows('select * from mv_layouts where tenant_id=$1 or tenant_id is null order by tenant_id nulls first, id', [t]);
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>MV Designer</h1>
      <AddDialog inline action={saveLayout} label="Add MV Layout" title="New MV Layout" placeholder="Layout name"><label className="mut">Number of tiles<input name="count" type="number" min="1" max="36" defaultValue="4" /></label>
        {me.role === 'webappdev' && <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" name="standard" value="1" style={{ minHeight: 0, width: 'auto' }} /> Standard (all tenants)</label>}</AddDialog></div>
    <p className="mut">Standard 16:9 frame. Standard layouts are set by the site admin and shared with every tenant. Custom layouts are private to your Tenant and only Admin/Manager can make them.</p>
    <div className="tiles">
      {ls.map((l: any) => (<div key={l.id} className="card tile"><div className="tilelink"><LayoutPreview tiles={l.tiles} /><b>{l.name}</b>{!l.tenant_id && <span><span className="tag">standard</span></span>}</div>
        {(l.tenant_id || me.role === 'webappdev') && <Menu><form action={deleteLayout} className="del-row"><input type="hidden" name="id" value={l.id} /><span className="mut">Delete this layout? Monitor Plans using it lose their tile layout.</span><button className="del">Yes, delete</button></form></Menu>}</div>))}</div></>);
}
