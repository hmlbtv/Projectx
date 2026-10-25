import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { renameTile, copyTile, deleteTile } from '@/lib/actions';
import { TileArt } from '../designer/TileArt';
import Menu from '../Menu';
import TileEditor from './TileEditor';
export const dynamic = 'force-dynamic';

export default async function Tiles({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const { id, q } = await searchParams; const t = me.tenant_id ?? 0, top = me.role === 'webappdev';
  const list = await rows('select * from mv_tiles where (tenant_id=$1 or tenant_id is null) and name ilike $2 order by tenant_id nulls first, name', [t, `%${(q ?? '').replace(/[%_\\]/g, '')}%`]);

  if (id) {
    const cur = id === 'new' ? { id: null, name: 'New MV Tile', assets: [], tenant_id: t } : list.find((x: any) => String(x.id) === id) ?? (await rows('select * from mv_tiles where id=$1 and (tenant_id=$2 or tenant_id is null)', [Number(id) || 0, t]))[0];
    if (!cur) redirect('/tiles');
    const std = cur.id && !cur.tenant_id, ro = !!std && !top;
    return (<><h1 style={{ margin: '0 0 12px' }}>Tile Designer</h1>
      <TileEditor key={String(cur.id)} id={cur.id} name={cur.name} assets={cur.assets} readOnly={ro} flags={top ? [{ key: 'standard', label: 'Standard (all tenants)', initial: !!std }] : []}
        notice={ro ? (<div className="card dz-note"><span>This is a Standard tile from the TelePlanner team, so it can't be edited. Make a copy to customise it for your tenant.</span>
          <form action={copyTile}><input type="hidden" name="id" value={cur.id} /><button className="small">Copy to my tiles</button></form></div>) : undefined} /></>);
  }

  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Tile Designer</h1><Link href="/tiles?id=new" className="btn small">+ New MV Tile</Link></div>
    <p className="mut">An MV Tile is a 16:9 frame holding Tile Assets such as a UMD, audio meters, tally and a clock. {top ? 'As site admin you can make Standard tiles for every tenant.' : 'Standard tiles come from the TelePlanner team; custom tiles are private to your Tenant.'}</p>
    <form className="row"><input name="q" placeholder="Search MV Tiles" defaultValue={q} /><button className="sec">Search</button></form>
    {list.length === 0 && <p className="mut">No MV Tiles{q ? ' match your search' : ' yet. Press New MV Tile to make one'}.</p>}
    <div className="dgrid">{list.map((x: any) => { const std = !x.tenant_id, canEdit = !std || top;
      return (<div key={x.id} className="card dcard"><Link href={`/tiles?id=${x.id}`} className="tilelink"><TileArt assets={x.assets} width="100%" /><b>{x.name}</b>
          <span><span className="tag">{std ? 'standard' : 'custom'}</span><span className="tag">{x.assets.length} asset{x.assets.length === 1 ? '' : 's'}</span></span></Link>
        <Menu>
          {canEdit && <><b>Rename</b><form action={renameTile} className="stack"><input type="hidden" name="id" value={x.id} /><input name="name" defaultValue={x.name} required /><button className="sec">Save</button></form></>}
          <form action={copyTile}><input type="hidden" name="id" value={x.id} /><button className="sec">Copy</button></form>
          {canEdit && <form action={deleteTile} className="del-row"><input type="hidden" name="id" value={x.id} /><span className="mut">Delete this tile?</span><button className="del">Yes, delete</button></form>}
        </Menu></div>); })}</div></>);
}
