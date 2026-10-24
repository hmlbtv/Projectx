import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { addSourceSet, updateSourceSet, deleteSourceSet } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Sources() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const sets = await rows(`select s.*, (select count(*)::int from jobs j where j.source_set_id=s.id) jobs from source_sets s where s.tenant_id=$1 order by s.name`, [me.tenant_id ?? 0]);
  return (<><h1>Source Sets</h1>
    <p className="mut">A Source Set is the list of sources (cameras, graphics, feeds) that can be assigned to Monitor Wall tiles. Choose one for each Job when you create it in Productions.</p>
    <div className="card"><b>New Source Set</b>
      <form action={addSourceSet} className="stack"><input name="name" placeholder="Source Set name" required /><textarea name="sources" placeholder="One source per line" rows={5} /><button>Add Source Set</button></form></div>
    {sets.length === 0 && <p className="mut">No Source Sets yet.</p>}
    {sets.map((s: any) => (<div key={s.id} className="card">
      <form action={updateSourceSet} className="stack"><input type="hidden" name="id" value={s.id} />
        <input name="name" defaultValue={s.name} required />
        <textarea name="sources" rows={Math.min(12, Math.max(4, s.sources.length + 1))} defaultValue={s.sources.join('\n')} />
        <div className="row"><span className="mut" style={{ flex: 1 }}>{s.sources.length} sources · used by {s.jobs} Job{s.jobs === 1 ? '' : 's'}</span><button className="sec">Save</button></div></form>
      <form action={deleteSourceSet} style={{ marginTop: 8 }}><input type="hidden" name="id" value={s.id} /><button className="sec" style={{ color: 'var(--red, #e5352b)' }}>Delete</button></form>
    </div>))}</>);
}
