import { rows, one } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { deleteWall } from '@/lib/actions';
import Designer from './Designer';
export const dynamic = 'force-dynamic';

export default async function Walls({ searchParams }: { searchParams: Promise<{ id?: string; q?: string; b?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const { id, q, b } = await searchParams; const t = me.tenant_id ?? 0;
  const list = await rows('select w.*, b.name bname from wall_templates w left join broadcasters b on b.id=w.broadcaster_id where w.tenant_id=$1 and w.name ilike $2 order by w.name', [t, `%${q ?? ''}%`]);
  const lim = (await one('select max_walls_per_broadcaster m, plan from tenants where id=$1', [t]))!;
  const bcs = await rows('select b.id,b.name,(select count(*)::int from wall_templates w where w.broadcaster_id=b.id) c from broadcasters b where b.tenant_id=$1 order by b.id', [t]);
  const pick = bcs.find((x: any) => String(x.id) === b);
  const cur = id === 'new' ? { id: null, name: 'New Wall Template', data: { assets: [] } } : list.find((w: any) => String(w.id) === id);
  return (<><h1>Wall Designer</h1>
    <p className="mut">Plan allows {lim.m >= 100000 ? 'unlimited' : lim.m} Wall Template{lim.m === 1 ? '' : 's'} per Broadcaster <span className="tag">{lim.plan}</span>{bcs.map((x: any) => <span key={x.id} className="tag">{x.name}: {x.c}{lim.m >= 100000 ? '' : ` of ${lim.m}`}</span>)}</p>
    <form className="row"><input name="q" placeholder="Search Wall Templates" defaultValue={q} /><button className="sec">Search</button><a href="/walls?id=new"><button type="button">New Wall Template</button></a></form>
    <div className="split" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
      <div>{list.map((w: any) => (<div key={w.id} className="card"><a href={`/walls?id=${w.id}`}>{w.name}</a> <span className="mut">{w.bname ? w.bname + ' · ' : ''}{w.data.assets.length} assets</span>
        {w.tenant_id && <form action={deleteWall}><input type="hidden" name="id" value={w.id} /><button className="del">Delete</button></form>}</div>))}</div>
      <div>{id === 'new' && !pick ? (bcs.length === 0 ? <p className="mut">Create a Broadcaster in Productions first - each Wall Template belongs to a Broadcaster.</p> :
        <div className="card"><b>Which Broadcaster is this Wall Template for?</b>{bcs.map((x: any) => <div key={x.id}><a href={`/walls?id=new&b=${x.id}`}>{x.name}</a> <span className="mut">{x.c} of {lim.m} used</span></div>)}</div>)
      : cur ? <Designer key={String(cur.id) + (pick?.id ?? '')} id={cur.id} initialName={cur.name} initial={cur.data.assets} broadcasterId={pick?.id ?? null} /> : <p className="mut">Select a Wall Template or create a new one.</p>}</div></div></>);
}
