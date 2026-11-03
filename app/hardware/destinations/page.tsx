import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMe, isAdmin } from '@/lib/session';
import { rows } from '@/lib/db';
import { addDestSet, updateDestSet, deleteDestSet } from '@/lib/actions';
import AddDialog from '../../AddDialog';
import Menu from '../../Menu';
export const dynamic = 'force-dynamic';

// Destination Sets now live under Hardware: the named outputs of a Site (they will be linked to the hardware).
export default async function Destinations() {
  const me = await requireMe(); if (!isAdmin(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const [sites, dsets] = await Promise.all([rows<any>('select id,name from sites where tenant_id=$1 order by name', [t]),
    rows<any>('select s.id, s.site_id, s.name, coalesce((select json_agg(d.name order by d.pos, d.id) from destinations d where d.set_id=s.id), \'[]\'::json) dests from destination_sets s where s.tenant_id=$1 order by s.name', [t])]);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return (<><div className="pagehead"><h1 style={{ margin: 0 }}>Destination Sets</h1></div>
    <p className="mut">The named outputs of a Site (for example “UHD 5”). A monitor in a Wall Template is given some of them, and the multiview windows take those names. <Link href="/hardware">MV Hardware</Link> · <Link href="/hardware/usage">Usage report</Link></p>
    {sites.length === 0 && <p className="mut">Add a Site first (Sites menu).</p>}
    {sites.map((s: any) => (<div key={s.id}><h2 style={{ margin: '22px 0 4px' }}>{s.name}</h2>
      <AddDialog action={addDestSet} label="Add Destination Set" title="New Destination Set" placeholder="Destination Set name (e.g. UHD 5)"><input type="hidden" name="site" value={s.id} /><textarea name="dests" placeholder="One destination per line" rows={8} /></AddDialog>
      {dsets.filter((d: any) => d.site_id === s.id).length === 0 && <p className="mut">No Destination Sets yet.</p>}
      <div className="tiles">{dsets.filter((d: any) => d.site_id === s.id).map((d: any) => (<div key={d.id} className="card tile"><div className="tilelink"><b>{d.name}</b><span className="mut">{plural(d.dests.length, 'destination')}</span><span className="mut" style={{ fontSize: '.85rem' }}>{d.dests.slice(0, 5).join(' · ')}{d.dests.length > 5 ? ` · +${d.dests.length - 5} more` : ''}</span></div>
        <Menu><b>Edit Destination Set</b><form action={updateDestSet} className="stack"><input type="hidden" name="id" value={d.id} /><input name="name" defaultValue={d.name} required /><textarea name="dests" rows={Math.min(12, Math.max(4, d.dests.length + 1))} defaultValue={d.dests.join('\n')} /><button className="sec">Save</button></form>
          <form action={deleteDestSet} className="del-row"><input type="hidden" name="id" value={d.id} /><span className="mut">Delete this Destination Set? Monitors using it lose their destinations.</span><button className="del">Yes, delete</button></form></Menu></div>))}</div></div>))}</>);
}
