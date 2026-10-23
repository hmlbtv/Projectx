import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { deleteWall } from '@/lib/actions';
import Designer from './Designer';
export const dynamic = 'force-dynamic';

export default async function Walls({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const { id, q } = await searchParams; const t = me.tenant_id ?? 1;
  const list = await rows('select * from wall_templates where (tenant_id=$1 or tenant_id is null) and name ilike $2 order by name', [t, `%${q ?? ''}%`]);
  const cur = id === 'new' ? { id: null, name: 'New Wall Template', data: { assets: [] } } : list.find((w: any) => String(w.id) === id);
  return (<><h1>Wall Designer</h1>
    <form className="row"><input name="q" placeholder="Search Wall Templates" defaultValue={q} /><button className="sec">Search</button><a href="/walls?id=new"><button type="button">New Wall Template</button></a></form>
    <div className="split" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
      <div>{list.map((w: any) => (<div key={w.id} className="card"><a href={`/walls?id=${w.id}`}>{w.name}</a> <span className="mut">{w.data.assets.length} assets</span>
        {w.tenant_id && <form action={deleteWall}><input type="hidden" name="id" value={w.id} /><button className="del">Delete</button></form>}</div>))}</div>
      <div>{cur ? <Designer key={String(cur.id)} id={cur.id} initialName={cur.name} initial={cur.data.assets} /> : <p className="mut">Select a Wall Template or create a new one.</p>}</div></div></>);
}
