import AddDialog from '../AddDialog';
import InviteUser from './InviteUser';
import ShareWall from './ShareWall';
import ReassignLink from './ReassignLink';
import { revokeWallLink } from '@/lib/guestActions';
import { rows } from '@/lib/db';
import { requireMe, canManage, isAdmin } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Menu from '../Menu';
import { addBroadcaster, addProduction, addJob, removeJobUser, assignWall, unassignWall, assignWalls, unassignWalls, updateBroadcaster, updateProduction, updateJob, deleteBroadcaster, deleteProduction, deleteJob, copyJobToNew } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Productions({ searchParams }: { searchParams: Promise<{ b?: string; p?: string; j?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const lim = (await rows('select max_broadcasters b, max_productions p, max_jobs_per_production j from tenants where id=$1', [t]))[0];
  const bs_p = rows('select * from broadcasters where tenant_id=$1 order by id', [t]);
  const ps_p = rows('select p.* from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by p.id', [t]);
  const js_p = rows('select j.*, (j.expires_at < current_date) expired, ss.name ss_name from jobs j left join source_sets ss on ss.id=j.source_set_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by j.job_date desc nulls last', [t]);
  const rw_p = rows(`select jw.job_id, rw.id, rw.name wname, r.name rname from job_walls jw join room_walls rw on rw.id=jw.room_wall_id join rooms r on r.id=rw.room_id
    join locations l on l.id=r.location_id join sites st on st.id=l.site_id where st.tenant_id=$1`, [t]);
  const wl_p = rows(`select wl.id, wl.job_id, wl.email, wl.access, wl.revoked, rw.name wname from wall_links wl join room_walls rw on rw.id=wl.room_wall_id
    join jobs jb on jb.id=wl.job_id join productions pr on pr.id=jb.production_id join broadcasters bc on bc.id=pr.broadcaster_id where bc.tenant_id=$1 order by wl.id`, [t]);
  const contacts_p = rows('select id,name,email,company from contacts where tenant_id=$1 order by name', [t]);
  const pcs_p = rows('select pc.production_id, pc.contact_id from production_contacts pc join contacts c on c.id=pc.contact_id where c.tenant_id=$1', [t]);
  const sets_p = rows('select * from source_sets where tenant_id=$1', [t]);
  const allWalls_p = rows('select rw.id, rw.name, r.name room, l.name loc, s.name site from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by s.name, l.name, r.name, rw.name', [t]);
  const tree_p = rows('select s.id sid, s.name site, l.id lid, l.name loc, r.id rid, r.name room from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by s.name, l.name, r.name', [t]);
  const ju_p = rows('select ju.job_id, ju.user_id, u.email from job_users ju join users u on u.id=ju.user_id where u.tenant_id=$1', [t]);
  const [bs, ps, js, rw, wl, contacts, pcs, sets, allWalls, ju, tree] = await Promise.all([bs_p, ps_p, js_p, rw_p, wl_p, contacts_p, pcs_p, sets_p, allWalls_p, ju_p, tree_p]); // run the page's queries together instead of one after another
  const q = await searchParams; const adm = isAdmin(me); const d = (x: any) => x ? new Date(x).toISOString().slice(0, 10) : '';
  const Del = ({ action, id, what }: { action: any; id: number; what: string }) => adm ? (<form action={action} className="del-row"><input type="hidden" name="id" value={id} /><span className="mut">Delete this {what} and everything inside it? This cannot be undone.</span><button className="del">Yes, delete</button></form>) : null;
  const note = <p className="mut">{me.role === 'webappdev' ? 'No limits on this account.' : <>Limits: {lim.b} Broadcaster{lim.b === 1 ? '' : 's'}, {lim.p} Productions each, {lim.j} active Jobs each.</>} Jobs are archived when they expire.</p>;
  const Bar = ({ back }: { back: string }) => (<div className="crumbs"><Link href={back} className="btn sec">← Back</Link><Link href="/productions" className="btn sec">Productions home</Link></div>);
  const jobId = Number(q.j) || 0, prodId = Number(q.p) || 0, bcId = Number(q.b) || 0;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---- Job page ----
  if (jobId) {
    const j = js.find((x: any) => x.id === jobId); if (!j) redirect('/productions');
    const p = ps.find((x: any) => x.id === j.production_id)!; const b = bs.find((x: any) => x.id === p.broadcaster_id)!;
    const inUse = (id: number) => rw.some((x: any) => x.job_id === j.id && x.id === id);
    // Add or remove every wall under a Site, Location or Room in one click.
    const Bulk = ({ ids, what }: { ids: number[]; what: string }) => { if (ids.length === 0) return null; const todo = ids.filter(i => !inUse(i)); const all = todo.length === 0;
      return (<form action={all ? unassignWalls : assignWalls} className="row" style={{ margin: '2px 0 4px 16px' }}><input type="hidden" name="job" value={j.id} />{ids.map(i => <input key={i} type="hidden" name="wall" value={i} />)}
        <button className={all ? 'del' : 'sec'} style={{ minHeight: 0, padding: '2px 10px' }}>{all ? `Remove all ${ids.length} from this Job` : `Add all ${todo.length === ids.length ? ids.length : todo.length + ' remaining'} in ${what}`}</button></form>); };
    const wallsIn = (f: (r: any) => boolean) => allWalls.filter((w: any) => tree.some((r: any) => f(r) && w.room === r.room && w.loc === r.loc && w.site === r.site)).map((w: any) => w.id as number);
    return (<><Bar back={`/productions?p=${p.id}`} />
      <div className="card tile head"><div><div className="mut">{b.name} › {p.name}</div><h1 style={{ margin: 0 }}>{j.name}</h1><div className="mut">Job · {d(j.job_date)} · expires {d(j.expires_at)} · {j.ss_name ?? 'no Source Set'}</div></div>
        <Menu><b>Edit Job</b><form action={updateJob} className="stack"><input type="hidden" name="id" value={j.id} /><input name="name" defaultValue={j.name} required />
          <label className="mut">Job date<input type="date" name="date" defaultValue={d(j.job_date)} /></label><label className="mut">Final date<input type="date" name="final" defaultValue={d(j.final_date)} /></label><label className="mut">Expires<input type="date" name="expires" defaultValue={d(j.expires_at)} /></label>
          <select name="sourceSet" defaultValue={j.source_set_id ?? ''}><option value="">Source Set…</option>{sets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="sec">Save</button></form>
          <Del action={deleteJob} id={j.id} what="Job" /></Menu></div>
      <div className="card">
      <div>Wall Templates: {rw.filter((x: any) => x.job_id === j.id).length === 0 && <span className="mut">none assigned yet</span>}{rw.filter((x: any) => x.job_id === j.id).map((x: any) => <form key={x.id} action={unassignWall} style={{ display: 'inline' }}><input type="hidden" name="job" value={j.id} /><input type="hidden" name="wall" value={x.id} /><span className="tag">{x.rname} / {x.wname} <button title="Remove from Job" style={{ background: 'none', color: 'inherit', padding: 0 }}>×</button></span></form>)}</div>
      <div style={{ margin: '8px 0' }}><b>Choose Wall Templates</b> <span className="mut">(open a Site, Location and Room, then add the walls this Job uses)</span>
        {tree.length === 0 && <p className="mut">Add Rooms and Wall Templates on the Sites page first.</p>}
        {[...new Set(tree.map((x: any) => x.sid))].map((sid: any) => { const sr = tree.filter((x: any) => x.sid === sid); const inUseS = sr.filter((r: any) => rw.some((x: any) => x.job_id === j.id && allWalls.find((w: any) => w.id === x.id && w.room === r.room && w.loc === r.loc && w.site === r.site))).length;
          return (<details key={sid} open={inUseS > 0} style={{ margin: '4px 0' }}><summary style={{ cursor: 'pointer' }}><b>{sr[0].site}</b></summary><Bulk ids={wallsIn((r: any) => r.sid === sid)} what={sr[0].site} />
            {[...new Set(sr.map((x: any) => x.lid))].map((lid: any) => { const lr = sr.filter((x: any) => x.lid === lid);
              return (<details key={lid} open={lr.some((r: any) => allWalls.some((w: any) => w.room === r.room && w.loc === r.loc && rw.some((x: any) => x.job_id === j.id && x.id === w.id)))} style={{ marginLeft: 16 }}><summary style={{ cursor: 'pointer' }}>{lr[0].loc}</summary><Bulk ids={wallsIn((r: any) => r.lid === lid)} what={lr[0].loc} />
                {lr.map((r: any) => { const ws = allWalls.filter((w: any) => w.room === r.room && w.loc === r.loc && w.site === r.site); const used = ws.filter((w: any) => rw.some((x: any) => x.job_id === j.id && x.id === w.id));
                  return (<details key={r.rid} open={used.length > 0} style={{ marginLeft: 16 }}><summary style={{ cursor: 'pointer' }}>{r.room} <span className="mut">· {used.length} of {ws.length} in use</span></summary>{ws.length > 1 && <Bulk ids={ws.map((w: any) => w.id as number)} what={r.room} />}
                    {ws.length === 0 && <p className="mut" style={{ marginLeft: 16 }}>No Wall Templates in this Room.</p>}
                    {ws.map((w: any) => { const on = used.some((u: any) => u.id === w.id);
                      return (<form key={w.id} action={on ? unassignWall : assignWall} className="row" style={{ marginLeft: 16, margin: '2px 0 2px 16px' }}><input type="hidden" name="job" value={j.id} /><input type="hidden" name="wall" value={w.id} />
                        <span>{w.name}</span>{on && <span className="tag">in use</span>}<button className={on ? 'del' : 'sec'} style={{ minHeight: 0, padding: '2px 10px' }}>{on ? 'Remove' : 'Use in this Job'}</button></form>); })}</details>); })}</details>); })}</details>); })}</div>
      </div></>);
  }

  // ---- Jobs of a Production ----
  if (prodId) {
    const p = ps.find((x: any) => x.id === prodId); if (!p) redirect('/productions');
    const b = bs.find((x: any) => x.id === p.broadcaster_id)!; const all = js.filter((x: any) => x.production_id === p.id), mine = all.filter((x: any) => !x.expired), old = all.filter((x: any) => x.expired);
    return (<><Bar back={`/productions?b=${b.id}`} />
      <div className="card tile head"><div><div className="mut">{b.name}</div><h1 style={{ margin: 0 }}>{p.name}</h1><div className="mut">Production · {plural(mine.length, 'current Job')}</div></div>
        <Menu><b>Edit Production</b><form action={updateProduction} className="stack"><input type="hidden" name="id" value={p.id} /><input name="name" defaultValue={p.name} required /><button className="sec">Save</button></form><Del action={deleteProduction} id={p.id} what="Production" /></Menu></div>
      <AddDialog action={addJob} label="Add Job" title="New Job" placeholder="Job name"><input type="hidden" name="parent" value={p.id} />
        <label className="mut">Job date<input type="date" name="date" /></label><label className="mut">Final date<input type="date" name="final" /></label><label className="mut">Expires (optional)<input type="date" name="expires" /></label>
        <select name="sourceSet"><option value="">Source Set…</option>{sets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></AddDialog>
      {mine.length === 0 && <p className="mut">No current Jobs yet.</p>}
      <div className="tiles">{mine.map((j: any) => (<div key={j.id} className="card tile"><Link href={`/productions?j=${j.id}`} className="tilelink"><b>{j.name}</b><span className="mut">{d(j.job_date)} · expires {d(j.expires_at)} · {j.ss_name ?? 'no Source Set'}</span></Link>
        <Menu><b>Edit Job</b><form action={updateJob} className="stack"><input type="hidden" name="id" value={j.id} /><input name="name" defaultValue={j.name} required />
          <label className="mut">Job date<input type="date" name="date" defaultValue={d(j.job_date)} /></label><label className="mut">Final date<input type="date" name="final" defaultValue={d(j.final_date)} /></label><label className="mut">Expires<input type="date" name="expires" defaultValue={d(j.expires_at)} /></label>
          <select name="sourceSet" defaultValue={j.source_set_id ?? ''}><option value="">Source Set…</option>{sets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="sec">Save</button></form>
          <Del action={deleteJob} id={j.id} what="Job" /></Menu></div>))}</div>
      {old.length > 0 && <details><summary style={{ cursor: 'pointer', fontSize: '1.4rem', fontWeight: 700, margin: '28px 0 10px' }}>Archive ({old.length})</summary><><p className="mut">Expired Jobs, kept for reference. “Copy to new” makes a new Job with the same walls and Monitor Plans, without the dates.</p>
        <div className="tiles">{old.map((j: any) => (<div key={j.id} className="card tile"><Link href={`/productions?j=${j.id}`} className="tilelink"><b>{j.name}</b><span className="mut">{d(j.job_date)} · expired {d(j.expires_at)} · {j.ss_name ?? 'no Source Set'}</span></Link>
          <form action={copyJobToNew}><input type="hidden" name="id" value={j.id} /><button className="sec small">Copy to new</button></form></div>))}</div></></details>}</>);
  }

  // ---- Productions of a Broadcaster ----
  if (bcId) {
    const b = bs.find((x: any) => x.id === bcId); if (!b) redirect('/productions');
    const mine = ps.filter((x: any) => x.broadcaster_id === b.id);
    return (<><Bar back="/productions" />
      <div className="card tile head"><div><h1 style={{ margin: 0 }}>{b.name}</h1><div className="mut">Broadcaster · {plural(mine.length, 'Production')}</div></div>
        <Menu><b>Edit Broadcaster</b><form action={updateBroadcaster} className="stack"><input type="hidden" name="id" value={b.id} /><input name="name" defaultValue={b.name} required /><button className="sec">Save</button></form><Del action={deleteBroadcaster} id={b.id} what="Broadcaster" /></Menu></div>
      <AddDialog action={addProduction} label="Add Production" title="New Production" placeholder="Production name"><input type="hidden" name="parent" value={b.id} /></AddDialog>
      {mine.length === 0 && <p className="mut">No Productions yet.</p>}
      <div className="tiles">{mine.map((p: any) => (<div key={p.id} className="card tile"><Link href={`/productions?p=${p.id}`} className="tilelink"><b>{p.name}</b><span className="mut">{plural(js.filter((j: any) => j.production_id === p.id && !j.expired).length, 'Job')}</span></Link>
        <Menu><b>Edit Production</b><form action={updateProduction} className="stack"><input type="hidden" name="id" value={p.id} /><input name="name" defaultValue={p.name} required /><button className="sec">Save</button></form><Del action={deleteProduction} id={p.id} what="Production" /></Menu></div>))}</div></>);
  }

  // ---- Home: Broadcasters ----
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Productions</h1><AddDialog action={addBroadcaster} inline label="Add Broadcaster" title="New Broadcaster" placeholder="Broadcaster name" /></div>{note}
    {bs.length === 0 && <p className="mut">No Broadcasters yet. Add one to get started.</p>}
    <div className="tiles">{bs.map((b: any) => (<div key={b.id} className="card tile"><Link href={`/productions?b=${b.id}`} className="tilelink"><b>{b.name}</b><span className="mut">{plural(ps.filter((p: any) => p.broadcaster_id === b.id).length, 'Production')}</span></Link>
      <Menu><b>Edit Broadcaster</b><form action={updateBroadcaster} className="stack"><input type="hidden" name="id" value={b.id} /><input name="name" defaultValue={b.name} required /><button className="sec">Save</button></form><Del action={deleteBroadcaster} id={b.id} what="Broadcaster" /></Menu></div>))}</div></>);
}
