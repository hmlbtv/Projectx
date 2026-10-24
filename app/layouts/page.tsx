import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { LayoutPreview } from './Preview';
import { saveLayout, deleteLayout } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Layouts() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const ls = await rows('select * from mv_layouts where tenant_id=$1 or tenant_id is null order by tenant_id nulls first, id', [t]);
  return (<><h1>MV Designer</h1><p className="mut">Standard 16:9 frame. Preset layouts come from WebAppDev; custom layouts are private to your Tenant and only Admin/Manager can make them.</p>
    <form action={saveLayout} className="card row"><b>New MV Layout</b><input name="name" placeholder="Name" /><input name="count" type="number" min="1" max="36" defaultValue="4" style={{ width: 80 }} /><span className="mut">tiles</span><button>Create</button></form>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
      {ls.map((l: any) => (<div key={l.id} className="card"><LayoutPreview tiles={l.tiles} /><div>{l.name}</div>
        {l.tenant_id ? <form action={deleteLayout}><input type="hidden" name="id" value={l.id} /><button className="del">Delete</button></form> : <span className="tag">preset</span>}</div>))}</div></>);
}
