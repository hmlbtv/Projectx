import Calendar from './Calendar';
import ImportJobs from './ImportJobs';
import JobDates from './JobDates';
import ArchiveFilter from '../ArchiveFilter';
import AddDialog from '../AddDialog';
import { rows } from '@/lib/db';
import { requireMe, canManage, isAdmin } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Menu from '../Menu';
import DefPick from './DefPick';
import { getLimits, limitText } from '@/lib/subscriptions';
import TreeControls from '../hardware/TreeControls';
import { addBroadcaster, addProduction, addJob, assignWall, setWallDef, unassignWall, assignWalls, unassignWalls, updateBroadcaster, updateProduction, updateJob, deleteBroadcaster, deleteProduction, deleteJob, copyJobToNew } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Productions({ searchParams }: { searchParams: Promise<{ b?: string; p?: string; j?: string; v?: string; from?: string; cd?: string; cv?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const q = await searchParams; const onlyJob = Number(q.j) || 0; // on a Job page only that Job's walls, links and users are needed
  const plan = await getLimits(t); const lim = { b: plan.limits.broadcasters, p: plan.limits.productions, j: plan.limits.jobs_per_production };
  const bs_p = rows('select * from broadcasters where tenant_id=$1 order by id', [t]);
  const ps_p = rows('select p.* from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by p.id', [t]);
  const js_p = rows('select j.*, (j.expires_at < current_date) expired, ss.name ss_name from jobs j left join source_sets ss on ss.id=j.source_set_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by j.job_date desc nulls last', [t]);
  const rw_p = rows(`select jw.job_id, rw.id, rw.name wname, r.name rname from job_walls jw join room_walls rw on rw.id=jw.room_wall_id join rooms r on r.id=rw.room_id
    join locations l on l.id=r.location_id join sites st on st.id=l.site_id where st.tenant_id=$1 and ($2::int=0 or jw.job_id=$2)`, [t, onlyJob]);
  const sets_p = rows('select * from source_sets where tenant_id=$1', [t]);
  const allWalls_p = rows('select rw.id, rw.name, wt.defaults, r.name room, l.name loc, s.name site from room_walls rw join wall_templates wt on wt.id=rw.wall_template_id join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by s.name, l.name, r.name, rw.name', [t]);
  const tree_p = rows('select s.id sid, s.name site, l.id lid, l.name loc, r.id rid, r.name room from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by s.name, l.name, r.name', [t]);
  const [bs, ps, js, rw, sets, allWalls, tree] = await Promise.all([bs_p, ps_p, js_p, rw_p, sets_p, allWalls_p, tree_p]); // run the page's queries together instead of one after another
  const adm = isAdmin(me); const d = (x: any) => x ? new Date(x).toISOString().slice(0, 10) : '';
  const Del = ({ action, id, what }: { action: any; id: number; what: string }) => adm ? (<form action={action} className="del-row"><input type="hidden" name="id" value={id} /><span className="mut">Delete this {what} and everything inside it? This cannot be undone.</span><button className="del">Yes, delete</button></form>) : null;
  const note = <p className="mut">{me.role === 'webappdev' ? 'No limits on this account.' : <>{plan.name} plan: {limitText(lim.b)} Broadcaster{lim.b === 1 ? '' : 's'}, {limitText(lim.p)} Productions each, {limitText(lim.j)} active Jobs each. <Link href="/account">See your plan</Link></>} Jobs are archived when they expire.</p>;
  const Bar = ({ back }: { back: string }) => (<div className="crumbs"><Link href={back} className="btn sec small">← Back</Link><Link href="/productions" className="btn sec small">Productions home</Link></div>);
  const jobId = Number(q.j) || 0, prodId = Number(q.p) || 0, bcId = Number(q.b) || 0;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---- Job page ----
  if (jobId) {
    const j = js.find((x: any) => x.id === jobId); if (!j) redirect('/productions');
    const p = ps.find((x: any) => x.id === j.production_id)!; const b = bs.find((x: any) => x.id === p.broadcaster_id)!;
    const jobPlans = await rows('select room_wall_id, data from job_wall_plans where job_id=$1', [j.id]);
    const inUse = (id: number) => rw.some((x: any) => x.job_id === j.id && x.id === id);
    // Add or remove every wall under a Site, Location or Room in one click.
    const Bulk = ({ ids, what }: { ids: number[]; what: string }) => { if (ids.length === 0) return null; const todo = ids.filter(i => !inUse(i)); const all = todo.length === 0;
      return (<form action={all ? unassignWalls : assignWalls} className="row" style={{ margin: '2px 0 4px 16px' }}><input type="hidden" name="job" value={j.id} />{ids.map(i => <input key={i} type="hidden" name="wall" value={i} />)}
        <button className={all ? 'del' : 'sec'} style={{ minHeight: 0, padding: '2px 10px' }}>{all ? `Remove all ${ids.length} from this Job` : `Add all ${todo.length === ids.length ? ids.length : todo.length + ' remaining'} in ${what}`}</button></form>); };
    const wallsIn = (f: (r: any) => boolean) => allWalls.filter((w: any) => tree.some((r: any) => f(r) && w.room === r.room && w.loc === r.loc && w.site === r.site)).map((w: any) => w.id as number);
    return (<><Bar back={q.from === 'cal' ? `/productions?v=cal&cd=${encodeURIComponent(q.cd ?? '')}&cv=${encodeURIComponent(q.cv ?? 'month')}` : `/productions?p=${p.id}`} />
      <div className="card tile head"><div><div className="mut">{b.name} › {p.name}</div><h1 style={{ margin: 0 }}>{j.name}</h1><div className="mut">Job · {d(j.job_date)} · expires {d(j.expires_at)} · {j.ss_name ?? 'no Source Set'}</div></div>
        <Menu><b>Edit Job</b><form action={updateJob} className="stack"><input type="hidden" name="id" value={j.id} /><input name="name" defaultValue={j.name} required />
          <label className="mut">Job date<input type="date" name="date" defaultValue={d(j.job_date)} /></label><label className="mut">Final date<input type="date" name="final" defaultValue={d(j.final_date)} /></label><label className="mut">Expires<input type="date" name="expires" defaultValue={d(j.expires_at)} /></label>
          <select name="sourceSet" defaultValue={j.source_set_id ?? ''}><option value="">Source Set…</option>{sets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="sec">Save</button></form>
          <Del action={deleteJob} id={j.id} what="Job" /></Menu></div>
      <div className="card">
      <div>Wall Templates: {rw.filter((x: any) => x.job_id === j.id).length === 0 && <span className="mut">none assigned yet</span>}{rw.filter((x: any) => x.job_id === j.id).map((x: any) => <form key={x.id} action={unassignWall} style={{ display: 'inline' }}><input type="hidden" name="job" value={j.id} /><input type="hidden" name="wall" value={x.id} /><span className="tag">{x.rname} / {x.wname} <button title="Remove from Job" style={{ background: 'none', color: 'inherit', padding: 0 }}>×</button></span></form>)}</div>
      <div style={{ margin: '8px 0' }}><b>Choose Wall Templates</b> <span className="mut">(open a Site, Location and Room, then add the walls this Job uses)</span>{tree.length > 0 && <div style={{ margin: '8px 0 0' }}><TreeControls target="#jobtree" store="teleplanner.jobtree" /></div>}<div id="jobtree">
        {tree.length === 0 && <p className="mut">Add Rooms and Wall Templates on the Sites page first.</p>}
        {[...new Set(tree.map((x: any) => x.sid))].map((sid: any) => { const sr = tree.filter((x: any) => x.sid === sid); const inUseS = sr.filter((r: any) => rw.some((x: any) => x.job_id === j.id && allWalls.find((w: any) => w.id === x.id && w.room === r.room && w.loc === r.loc && w.site === r.site))).length;
          return (<details key={sid} data-k={'s' + sid} className="tree l1" open={inUseS > 0}><summary><b>{sr[0].site}</b></summary><Bulk ids={wallsIn((r: any) => r.sid === sid)} what={sr[0].site} />
            {[...new Set(sr.map((x: any) => x.lid))].map((lid: any) => { const lr = sr.filter((x: any) => x.lid === lid);
              return (<details key={lid} data-k={'l' + lid} className="tree l2" open={lr.some((r: any) => allWalls.some((w: any) => w.room === r.room && w.loc === r.loc && rw.some((x: any) => x.job_id === j.id && x.id === w.id)))}><summary><b>{lr[0].loc}</b></summary><Bulk ids={wallsIn((r: any) => r.lid === lid)} what={lr[0].loc} />
                {lr.map((r: any) => { const ws = allWalls.filter((w: any) => w.room === r.room && w.loc === r.loc && w.site === r.site); const used = ws.filter((w: any) => rw.some((x: any) => x.job_id === j.id && x.id === w.id));
                  return (<details key={r.rid} data-k={'r' + r.rid} className="tree l3" open={used.length > 0}><summary><b>{r.room}</b> <span className="tag">{used.length} of {ws.length} in use</span></summary>{ws.length > 1 && <Bulk ids={ws.map((w: any) => w.id as number)} what={r.room} />}
                    {ws.length === 0 && <p className="mut" style={{ marginLeft: 16 }}>No Wall Templates in this Room.</p>}
                    {ws.map((w: any) => { const on = used.some((u: any) => u.id === w.id); const defs: any[] = Array.isArray(w.defaults) ? w.defaults : []; const plan = on ? jobPlans.find((x: any) => x.room_wall_id === w.id)?.data : undefined;
                      const same = (a: any, b: any) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
                      const cur = !on ? 'none' : plan ? (defs.find((x: any) => same(x.mons, plan.mons))?.id ?? (same(plan.mons, {}) ? 'none' : 'custom')) : (defs.find((x: any) => x.active)?.id ?? 'none');
                      const locked = !!plan && (Object.keys(plan.assign ?? {}).length > 0 || Object.keys(plan.srcs ?? {}).length > 0);
                      return (<div key={w.id} style={{ margin: '4px 0 4px 16px', padding: '6px 10px', border: '1px solid var(--line, #2a313b)', borderRadius: 6, background: on ? 'rgba(80,160,255,.07)' : 'transparent' }}>
                        <form action={on ? unassignWall : assignWall} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}><input type="hidden" name="job" value={j.id} /><input type="hidden" name="wall" value={w.id} />
                          <span><b>{w.name}</b> {on && <span className="tag">in use</span>}</span>
                          <button className={on ? 'del' : 'sec'} style={{ minHeight: 0, padding: '2px 10px' }}>{on ? 'Remove' : 'Use in this Job'}</button></form>
                        {on && (defs.length > 0 ? <div style={{ marginTop: 6 }}><DefPick action={setWallDef} job={j.id} wall={w.id} value={cur} options={defs.map((x: any) => ({ id: x.id, name: x.name, active: x.active }))} locked={locked} /></div> : <div className="mut" style={{ marginTop: 4, fontSize: 13 }}>This Wall Template has no default configurations.</div>)}
                      </div>); })}</details>); })}</details>); })}</details>); })}</div></div>
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
        <JobDates />
        <select name="sourceSet"><option value="">Source Set…</option>{sets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></AddDialog>
      {mine.length === 0 && <p className="mut">No current Jobs yet.</p>}
      <div className="tiles">{mine.map((j: any) => (<div key={j.id} className="card tile"><Link href={`/productions?j=${j.id}`} className="tilelink"><b>{j.name}</b><span className="mut">{d(j.job_date)} · expires {d(j.expires_at)} · {j.ss_name ?? 'no Source Set'}</span></Link>
        <Menu><b>Edit Job</b><form action={updateJob} className="stack"><input type="hidden" name="id" value={j.id} /><input name="name" defaultValue={j.name} required />
          <label className="mut">Job date<input type="date" name="date" defaultValue={d(j.job_date)} /></label><label className="mut">Final date<input type="date" name="final" defaultValue={d(j.final_date)} /></label><label className="mut">Expires<input type="date" name="expires" defaultValue={d(j.expires_at)} /></label>
          <select name="sourceSet" defaultValue={j.source_set_id ?? ''}><option value="">Source Set…</option>{sets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="sec">Save</button></form>
          <Del action={deleteJob} id={j.id} what="Job" /></Menu></div>))}</div>
      {old.length > 0 && <details><summary style={{ cursor: 'pointer', fontSize: '1.4rem', fontWeight: 700, margin: '28px 0 10px' }}>Archive ({old.length})</summary><><p className="mut">Expired Jobs, kept for reference. “Copy to new Job” makes a new Job with the same walls and Monitor Plans, without the dates.</p>
        <ArchiveFilter tiles items={old.map((j: any) => ({ key: j.id, text: `${j.name} ${d(j.job_date)} ${d(j.expires_at)} ${j.ss_name ?? ''}`, prod: p.name, year: String(j.job_date ?? j.expires_at ?? '').slice(0, 4), node: (<div key={j.id} className="card tile"><Link href={`/productions?j=${j.id}`} className="tilelink"><b>{j.name}</b><span className="mut">{d(j.job_date)} · expired {d(j.expires_at)} · {j.ss_name ?? 'no Source Set'}</span></Link>
          <form action={copyJobToNew}><input type="hidden" name="id" value={j.id} /><button className="sec small">Copy to new Job</button></form></div>) }))} /></></details>}</>);
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

  const cal = q.v === 'cal'; const evs = js.filter((j: any) => j.job_date).map((j: any) => { const pr = ps.find((x: any) => x.id === j.production_id), b = bs.find((x: any) => x.id === pr?.broadcaster_id); const st = d(j.job_date), en = d(j.final_date); return { id: j.id, title: j.name, prod: pr?.name ?? '', bc: b?.id ?? 0, bcName: b?.name ?? '', start: st, end: en && en >= st ? en : st }; });
  // ---- Home: Broadcasters ----
  return (<><div className="pagehead"><h1 style={{ margin: 0 }}>Productions</h1><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}><Link href="/integrations" className="btn sec small">Scheduling integration</Link><ImportJobs /><AddDialog action={addBroadcaster} inline label="Add Broadcaster" title="New Broadcaster" placeholder="Broadcaster name" /></div></div>{note}
    <div style={{ display: 'inline-flex', margin: '4px 0 12px' }} role="group" aria-label="View"><Link href="/productions" className={cal ? 'btn sec small' : 'btn small'} style={{ borderRadius: '8px 0 0 8px', ...(cal ? {} : { background: '#e5352b', color: '#fff', borderColor: '#e5352b' }) }}>List</Link><Link href="/productions?v=cal" className={cal ? 'btn small' : 'btn sec small'} style={{ borderRadius: '0 8px 8px 0', ...(cal ? { background: '#e5352b', color: '#fff', borderColor: '#e5352b' } : {}) }}>Calendar</Link></div>
    {cal && <Calendar events={evs} initView={q.cv === 'day' || q.cv === 'week' ? q.cv : 'month'} initDate={q.cd} />}
    {!cal && bs.length === 0 && <p className="mut">No Broadcasters yet. Add one to get started.</p>}
    {!cal && <div className="tiles">{bs.map((b: any) => (<div key={b.id} className="card tile"><Link href={`/productions?b=${b.id}`} className="tilelink"><b>{b.name}</b><span className="mut">{plural(ps.filter((p: any) => p.broadcaster_id === b.id).length, 'Production')}</span></Link>
      <Menu><b>Edit Broadcaster</b><form action={updateBroadcaster} className="stack"><input type="hidden" name="id" value={b.id} /><input name="name" defaultValue={b.name} required /><button className="sec">Save</button></form><Del action={deleteBroadcaster} id={b.id} what="Broadcaster" /></Menu></div>))}</div>}</>);
}
