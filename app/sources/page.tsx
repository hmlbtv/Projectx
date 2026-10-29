import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { addSourceSet, updateSourceSet, deleteSourceSet } from '@/lib/actions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
import ImportSources from './ImportSources';
export const dynamic = 'force-dynamic';

export default async function Sources() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const sets = await rows(`select s.*, (select count(*)::int from jobs j where j.source_set_id=s.id) jobs from source_sets s where s.tenant_id=$1 order by s.name`, [me.tenant_id ?? 0]);
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Source Sets</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ImportSources /><AddDialog inline action={addSourceSet} label="Add Source Set" title="New Source Set" placeholder="Source Set name"><textarea name="sources" placeholder="One source per line" rows={6} /></AddDialog></div></div>
    <p className="mut">A Source Set is the list of sources (cameras, graphics, feeds) that can be assigned to Monitor Wall tiles. Choose one for each Job when you create it in Productions.</p>
    {sets.length === 0 && <p className="mut">No Source Sets yet.</p>}
    <div className="tiles">{sets.map((s: any) => (<div key={s.id} className="card tile"><div className="tilelink"><b>{s.name}</b><span className="mut">{s.sources.length} sources · used by {s.jobs} Job{s.jobs === 1 ? '' : 's'}</span><span className="mut" style={{ fontSize: '.85rem' }}>{s.sources.slice(0, 4).join(', ')}{s.sources.length > 4 ? '…' : ''}</span></div>
      <Menu><b>Edit Source Set</b><form action={updateSourceSet} className="stack"><input type="hidden" name="id" value={s.id} /><input name="name" defaultValue={s.name} required />
        <textarea name="sources" rows={Math.min(10, Math.max(4, s.sources.length + 1))} defaultValue={s.sources.join('\n')} /><button className="sec">Save</button></form>
        <form action={deleteSourceSet} className="del-row"><input type="hidden" name="id" value={s.id} /><span className="mut">Delete this Source Set? Jobs using it will have none.</span><button className="del">Yes, delete</button></form></Menu></div>))}</div></>);
}
