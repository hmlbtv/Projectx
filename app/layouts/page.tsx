import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { LayoutPreview } from './Preview';
import { saveLayout, deleteLayout, copyLayout, setLayoutStandard } from '@/lib/actions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
import Link from 'next/link';
import LayoutEditor from './LayoutEditor';
export const dynamic = 'force-dynamic';

export default async function Layouts({ searchParams }: { searchParams: Promise<{ id?: string; q?: string; sort?: string; f?: string; view?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const ls = await rows('select * from mv_layouts where tenant_id=$1 or tenant_id is null order by tenant_id nulls first, id', [t]);
  const { id, q: q0, sort: so, f: fl, view: vw } = await searchParams, top = me.role === 'webappdev';
  const tl = await rows('select id,name,assets,tenant_id from mv_tiles where tenant_id=$1 or tenant_id is null order by tenant_id nulls first, name', [t]);
  const tileMap: Record<number, any[]> = Object.fromEntries(tl.map((x: any) => [x.id, x.assets]));
  if (id) { const cur = ls.find((x: any) => String(x.id) === id); if (!cur) redirect('/layouts');
    const std = !top && !cur.tenant_id;
    return (<><h1 style={{ margin: '0 0 12px' }}>MV Designer</h1>
      <LayoutEditor canNeaten={top} standard={top ? !cur.tenant_id : null} key={cur.id} id={cur.id} name={cur.name} tiles={cur.tiles} tileList={tl.map((x: any) => ({ id: x.id, name: x.name, assets: x.assets, mine: !!x.tenant_id }))}
        notice={std ? (<div className="card dz-note"><span>This is a Standard layout from the TelePlanner team. Change it as you like: Save makes your own copy and the Standard one stays as it is for everyone.</span></div>) : undefined} /></>); }
  const q = (q0 ?? '').trim().slice(0, 80), f = ['standard', 'mine', 'tiles', 'notiles'].includes(fl ?? '') ? fl! : 'all', sort = ['name', 'namez', 'new', 'old', 'most', 'fewest', 'type', 'typez', 'tmost', 'tfewest'].includes(so ?? '') ? so! : 'default', view = vw === 'list' ? 'list' : 'cards';
  const nt = (l: any) => (l.tiles || []).filter((x: any) => x.tileId).length;
  const withTiles = (l: any) => (l.tiles || []).some((x: any) => x.tileId);
  const shown = ls.filter((l: any) => (!q || l.name.toLowerCase().includes(q.toLowerCase())) && (f === 'all' || (f === 'standard' ? !l.tenant_id : f === 'mine' ? !!l.tenant_id : f === 'tiles' ? withTiles(l) : !withTiles(l))))
    .sort((a: any, b: any) => sort === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : sort === 'namez' ? b.name.localeCompare(a.name, undefined, { numeric: true }) : sort === 'new' ? b.id - a.id : sort === 'old' ? a.id - b.id
      : sort === 'most' ? b.tiles.length - a.tiles.length : sort === 'fewest' ? a.tiles.length - b.tiles.length
      : sort === 'type' ? (a.tenant_id ? 1 : 0) - (b.tenant_id ? 1 : 0) : sort === 'typez' ? (b.tenant_id ? 1 : 0) - (a.tenant_id ? 1 : 0)
      : sort === 'tmost' ? nt(b) - nt(a) : sort === 'tfewest' ? nt(a) - nt(b) : 0);
  // Column headers in the list view: click to sort, click again to reverse.
  const th = (label: string, asc: string, desc: string) => { const on = sort === asc || sort === desc, next = sort === asc ? desc : asc;
    return <th><Link href={`/layouts?${new URLSearchParams({ ...(q ? { q } : {}), f, sort: next, view }).toString()}`} className={on ? 'on' : ''}>{label}{on ? (sort === asc ? ' ▲' : ' ▼') : ''}</Link></th>; };
  const qs = (v: string) => new URLSearchParams({ ...(q ? { q } : {}), f, sort, view: v }).toString();
  const menu = (l: any) => (l.tenant_id || me.role === 'webappdev') && <Menu>{top && <form action={setLayoutStandard}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="standard" value={l.tenant_id ? '1' : '0'} /><button>{l.tenant_id ? 'Make Standard (all tenants)' : 'Make custom (my tenant only)'}</button></form>}<form action={deleteLayout} className="del-row"><input type="hidden" name="id" value={l.id} /><span className="mut">Delete this layout? Monitor Plans using it lose their tile layout.</span><button className="del">Yes, delete</button></form></Menu>;
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>MV Designer</h1>
      <AddDialog inline action={saveLayout} label="Add MV Layout" title="New MV Layout" placeholder="Layout name"><label className="mut">Number of tiles<input name="count" type="number" min="1" max="36" defaultValue="4" /></label>
        {me.role === 'webappdev' && <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" name="standard" value="1" style={{ minHeight: 0, width: 'auto' }} /> Standard (all tenants)</label>}</AddDialog></div>
    <p className="mut">Standard 16:9 frame. Standard layouts are set by the site admin and shared with every tenant. Custom layouts are private to your Tenant and only Admin/Manager can make them. Click a layout to edit it and put Tiles on its monitors.</p>
    <form method="get" className="lay-bar">
      <input type="search" name="q" defaultValue={q} placeholder="Search layouts" aria-label="Search layouts" />
      <select name="f" defaultValue={f} aria-label="Filter"><option value="all">All layouts</option><option value="standard">Standard only</option><option value="mine">My tenant only</option><option value="tiles">With tiles on windows</option><option value="notiles">No tiles yet</option></select>
      <select name="sort" defaultValue={sort} aria-label="Sort"><option value="default">Standard first</option><option value="name">Name A to Z</option><option value="namez">Name Z to A</option><option value="new">Newest first</option><option value="old">Oldest first</option><option value="most">Most windows</option><option value="fewest">Fewest windows</option><option value="tmost">Most with a tile</option><option value="tfewest">Fewest with a tile</option><option value="type">Standard first (by type)</option><option value="typez">Custom first (by type)</option></select>
      <input type="hidden" name="view" value={view} /><button className="sec small">Apply</button>
      <span className="lay-view"><Link className={view === 'cards' ? 'on' : ''} href={`/layouts?${qs('cards')}`}>Cards</Link><Link className={view === 'list' ? 'on' : ''} href={`/layouts?${qs('list')}`}>List</Link></span></form>
    <p className="mut">{shown.length} of {ls.length} layout{ls.length === 1 ? '' : 's'}</p>
    {shown.length === 0 && <p className="mut">No layouts match.</p>}
    {view === 'cards' ? <div className="tiles">
      {shown.map((l: any) => (<div key={l.id} className="card tile"><Link href={`/layouts?id=${l.id}`} className="tilelink"><LayoutPreview tiles={l.tiles} tileMap={tileMap} /><b>{l.name}</b>{!l.tenant_id && <span><span className="tag">standard</span></span>}</Link>
        {menu(l)}</div>))}</div>
    : <div className="card" style={{ padding: 0, overflowX: 'auto' }}><table className="lay-list"><thead><tr><th></th>{th('Name', 'name', 'namez')}{th('Type', 'type', 'typez')}{th('Windows', 'fewest', 'most')}{th('With a tile', 'tfewest', 'tmost')}<th></th></tr></thead><tbody>
      {shown.map((l: any) => (<tr key={l.id}><td><Link href={`/layouts?id=${l.id}`}><LayoutPreview tiles={l.tiles} tileMap={tileMap} width={96} /></Link></td>
        <td><Link href={`/layouts?id=${l.id}`}><b>{l.name}</b></Link></td><td>{l.tenant_id ? <span className="tag">custom</span> : <span className="tag">standard</span>}</td><td>{(l.tiles || []).length}</td><td>{(l.tiles || []).filter((x: any) => x.tileId).length}</td><td className="lay-act">{menu(l)}</td></tr>))}</tbody></table></div>}</>);
}
