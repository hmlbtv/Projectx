import { rows, one } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { deleteWall } from '@/lib/actions';
import WallEditor from './WallEditor';
import Menu from '../Menu';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

export default async function Walls({ searchParams }: { searchParams: Promise<{ id?: string; q?: string; b?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const { id, q, b } = await searchParams; const t = me.tenant_id ?? 0;
  const list = await rows('select w.*, b.name bname from wall_templates w left join sites b on b.id=w.site_id where w.tenant_id=$1 and w.name ilike $2 order by w.name', [t, `%${q ?? ''}%`]);
  const lim = (await one('select max_walls_per_broadcaster m, plan from tenants where id=$1', [t]))!;
  const bcs = await rows('select b.id,b.name,(select count(*)::int from wall_templates w where w.site_id=b.id) c from sites b where b.tenant_id=$1 order by b.name', [t]);
  const pick = bcs.find((x: any) => String(x.id) === b);
  const cur = id === 'new' ? { id: null, name: 'New Wall Template', data: { assets: [] } } : list.find((w: any) => String(w.id) === id);
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Wall Designer</h1><Link href="/walls?id=new" className="btn small">+ New Wall Template</Link></div>
    <p className="mut">Plan allows {lim.m >= 100000 ? 'unlimited' : lim.m} Wall Template{lim.m === 1 ? '' : 's'} per Site <span className="tag">{lim.plan}</span>{bcs.map((x: any) => <span key={x.id} className="tag">{x.name}: {x.c}{lim.m >= 100000 ? '' : ` of ${lim.m}`}</span>)}</p>
    <form className="row"><input name="q" placeholder="Search Wall Templates" defaultValue={q} /><button className="sec">Search</button></form>
    <div className="split" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
      <div>{list.map((w: any) => (<div key={w.id} className="card tile"><Link href={`/walls?id=${w.id}`} className="tilelink"><b>{w.name}</b><span className="mut">{w.bname ? w.bname + ' · ' : ''}{w.data.assets.length} assets</span></Link>
        {w.tenant_id && <Menu><form action={deleteWall} className="del-row"><input type="hidden" name="id" value={w.id} /><span className="mut">Delete this Wall Template? It is removed from any Room and Job using it.</span><button className="del">Yes, delete</button></form></Menu>}</div>))}</div>
      <div>{id === 'new' && !pick ? (bcs.length === 0 ? <p className="mut">Add a Site first (Sites page) - each Wall Template belongs to a Site, then is added to that Site's Rooms.</p> :
        <div className="card"><b>Which Site is this Wall Template for?</b>{bcs.map((x: any) => <div key={x.id}><a href={`/walls?id=new&b=${x.id}`}>{x.name}</a> <span className="mut">{x.c} of {lim.m} used</span></div>)}</div>)
      : cur ? <WallEditor key={String(cur.id) + (pick?.id ?? '')} id={cur.id} initialName={cur.name} initial={cur.data.assets} siteId={pick?.id ?? cur.site_id ?? null} /> : <p className="mut">Select a Wall Template or create a new one.</p>}</div></div></>);
}
