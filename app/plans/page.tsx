import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { addComment, copyPlan } from '@/lib/actions';
import { loadJobPlans } from '@/lib/plans';
import { unreadByJob, wallCommentsFor, markSeen } from '@/lib/comments';
import ArchiveFilter from '@/app/ArchiveFilter';
import DetailTable from '@/app/shared/DetailTable';
import AutoSelect from '@/app/AutoSelect';
import Calendar from '@/app/productions/Calendar';
import WallComments from './WallComments';
import Plan from './Plan';
import CopyPlan from './CopyPlan';
import Invites from './Invites';
import { planWalls } from '@/lib/planWalls';
import { planHardware } from '@/lib/hardware';
import { savePlan, loadPlans } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Plans({ searchParams }: { searchParams: Promise<{ job?: string; plan?: string; copied?: string; q?: string; v?: string; cv?: string; cd?: string; bc?: string; prod?: string; when?: string; new?: string }> }) {
  const me = await requireMe(); if (me.role === 'onetime') redirect('/shared'); const sp = await searchParams; const { job, plan: planQ, copied } = sp;
  const jobs = await rows(`select j.id,j.name,j.job_date,j.final_date,b.id bid,(j.expires_at < current_date) expired,p.name prod,b.name broadcaster from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    where b.tenant_id=$3 and (j.id in (select job_id from job_users where user_id=$1) or $2::boolean) order by j.job_date desc nulls last`, [me.id, canManage(me), me.tenant_id ?? 0]);
  const cur = jobs.find((j: any) => String(j.id) === job);
  if (!cur) { const unread = await unreadByJob(me.id);
    const card = (j: any, old: boolean) => (<div key={j.id} className="card" style={!old && unread[j.id] > 0 ? { borderLeft: '6px solid #e5352b', boxShadow: '0 0 0 2px rgba(229,53,43,.35)' } : undefined}><div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><div><a href={`/plans?job=${j.id}`}><b>{j.name}</b></a> <span className="mut">{String(j.job_date ?? '').slice(0, 10)}</span>
      <div className="mut" style={{ fontSize: '.85rem' }}>{j.broadcaster} \ {j.prod} \ {j.name}</div></div>
      {!old && unread[j.id] > 0 && <a href={`/plans?job=${j.id}`} style={{ textDecoration: 'none', flex: '0 0 auto' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e5352b', color: '#fff', fontWeight: 800, fontSize: '.95rem', padding: '8px 14px', borderRadius: 999, boxShadow: '0 0 0 4px rgba(229,53,43,.25)' }}>🔔 {unread[j.id]} new comment{unread[j.id] === 1 ? '' : 's'}</span></a>}</div></div>);
    const q = (sp.q ?? '').trim().slice(0, 80), view = sp.v === 'cal' || sp.v === 'detail' ? sp.v : 'list';
    const dt = (x: any) => x ? new Date(x).toISOString().slice(0, 10) : '', today = new Date().toISOString().slice(0, 10);
    const fb = sp.bc ?? '', fp = sp.prod ?? '', fw = ['upcoming', 'past', 'undated'].includes(sp.when ?? '') ? sp.when! : '', fn = sp.new === '1';
    const uniq = (k: string) => [...new Set(jobs.map((x: any) => x[k] as string))].sort((x, y) => x.localeCompare(y));
    const needle = q.toLowerCase();
    const shown = jobs.filter((x: any) => (!fb || x.broadcaster === fb) && (!fp || x.prod === fp) && (!fn || unread[x.id] > 0)
      && (!fw || (fw === 'undated' ? !x.job_date : fw === 'upcoming' ? !!x.job_date && dt(x.final_date ?? x.job_date) >= today : !!x.job_date && dt(x.final_date ?? x.job_date) < today))
      && (!needle || `${x.broadcaster} ${x.prod} ${x.name} ${dt(x.job_date)}`.toLowerCase().includes(needle)));
    const live = shown.filter((j: any) => !j.expired), old = shown.filter((j: any) => j.expired);
    const keep = [q && 'q=' + encodeURIComponent(q), fb && 'bc=' + encodeURIComponent(fb), fp && 'prod=' + encodeURIComponent(fp), fw && 'when=' + fw, fn && 'new=1'].filter(Boolean).join('&');
    const tab = (v: string, label: string, first: boolean, last: boolean) => (<a href={`/plans?v=${v}${keep ? '&' + keep : ''}`} className={view === v ? 'btn small' : 'btn sec small'} style={{ borderRadius: first ? '8px 0 0 8px' : last ? '0 8px 8px 0' : 0, ...(view === v ? { background: '#e5352b', color: '#fff', borderColor: '#e5352b' } : {}) }}>{label}</a>);
    const detail = (list: any[]) => (<DetailTable base="/plans?job=" cols={['wall', 'path', 'date', 'access', 'unread']} labels={{ wall: 'Job', path: 'Broadcaster › Production', access: 'Status' }} rows={list.map((j: any) => ({ id: j.id, wall: j.name, path: `${j.broadcaster} › ${j.prod}`, room: '', org: '', date: dt(j.job_date), access: j.expired ? 'Expired' : 'Active', unread: unread[j.id] ?? 0 }))} />);
    const evs = shown.filter((j: any) => j.job_date).map((j: any) => { const st = dt(j.job_date), en = dt(j.final_date); return { id: j.id, title: j.name, prod: j.prod, bc: j.bid, bcName: j.broadcaster, start: st, end: en && en >= st ? en : st }; });
    return (<><h1>Monitor Plans</h1>
      {jobs.length > 0 && <><form method="get" className="searchbar"><input name="q" defaultValue={q} placeholder="Search Jobs, Productions or Broadcasters" aria-label="Search" /><input type="hidden" name="v" value={view} /><button className="sec">Search</button>
        <AutoSelect name="bc" value={fb} label="Broadcaster" options={[['', 'All Broadcasters'], ...uniq('broadcaster').map(x => [x, x] as [string, string])]} />
        <AutoSelect name="prod" value={fp} label="Production" options={[['', 'All Productions'], ...uniq('prod').map(x => [x, x] as [string, string])]} />
        <AutoSelect name="when" value={fw} label="When" options={[['', 'Any date'], ['upcoming', 'Current and upcoming'], ['past', 'Past'], ['undated', 'No date']]} />
        <AutoSelect name="new" value={fn ? '1' : ''} label="Comments" options={[['', 'All Jobs'], ['1', 'New comments only']]} />
        {(q || fb || fp || fw || fn) && <a href={`/plans?v=${view}`} className="btn small">Clear filters</a>}</form>
        <div style={{ display: 'inline-flex', margin: '4px 0 12px' }} role="group" aria-label="View">{tab('list', 'List', true, false)}{tab('detail', 'Details', false, false)}{tab('cal', 'Calendar', false, true)}</div></>}
      {jobs.length === 0 && <p className="mut">No active Jobs assigned to you.</p>}{jobs.length > 0 && shown.length === 0 && <div className="card mut">Nothing matches your search.</div>}
      {view === 'cal' && shown.length > 0 && (evs.length ? <Calendar kind="plans" extra={keep ? keep + '&' : ''} events={evs} initView={sp.cv === 'day' || sp.cv === 'week' ? sp.cv : 'month'} initDate={sp.cd} /> : <div className="card mut">None of these Jobs has a date to show.</div>)}
      {view === 'list' && live.map((j: any) => card(j, false))}
      {view === 'detail' && live.length > 0 && detail(live)}
      {view !== 'cal' && old.length > 0 && <details><summary style={{ cursor: 'pointer', fontSize: '1.4rem', fontWeight: 700, margin: '28px 0 10px' }}>Archive ({old.length})</summary><><p className="mut">Expired Jobs, kept for reference (view only).</p>{view === 'detail' ? detail(old) : <ArchiveFilter items={old.map((j: any) => ({ key: j.id, text: `${j.broadcaster} ${j.prod} ${j.name} ${dt(j.job_date)}`, prod: j.prod, year: dt(j.job_date).slice(0, 4), node: card(j, true) }))} />}</></details>}</>); }
  const arch = !!cur.expired;
  const j = (await rows('select j.*, ss.sources, ss.categories from jobs j left join source_sets ss on ss.id=j.source_set_id where j.id=$1', [cur.id]))[0];
  const rws = await rows(`select r.id room_id, r.name room, rw.id, rw.name, rw.wall_template_id wt_id, wt.data, wt.defaults from job_walls jw join room_walls rw on rw.id=jw.room_wall_id join wall_templates wt on wt.id=rw.wall_template_id join rooms r on r.id=rw.room_id where jw.job_id=$1 order by r.id, rw.id`, [cur.id]);
  // MV Layouts come from the Job's own tenant (plus shared presets) - never from the viewer's tenant.
  const layouts = await rows('select l.id,l.name,l.tiles from mv_layouts l where l.tenant_id is null or l.tenant_id=(select b.tenant_id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1) order by l.tenant_id nulls first,l.id', [cur.id]);
  const savedPlans = await loadJobPlans(cur.id) as any;
  const saved = [{ name: 'Monitor Plan', data: savedPlans }]; // one plan per wall, shared by everyone on the Job
  const wcom = await wallCommentsFor(cur.id, rws.filter((r: any) => r.id).map((r: any) => r.id as number));
  const legacy = await rows(`select c.*, coalesce(u.name, c.guest_email || ' (guest)') uname from comments c left join users u on u.id=c.user_id where c.job_id=$1 and c.room_wall_id is null order by c.id`, [cur.id]);
  await markSeen(me.id, cur.id, rws.filter((r: any) => r.id).map((r: any) => r.id as number));
  const tenantId = (await rows('select b.tenant_id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1', [cur.id]))[0].tenant_id;
  const hw = await planHardware(tenantId, rws.filter((r: any) => r.id).map((r: any) => r.id as number), savedPlans);
  const pw = await planWalls(rws.filter((r: any) => r.id).map((r: any) => ({ id: r.id, name: r.name, data: r.data, defaults: r.defaults })), tenantId);
  // Saved plans this person may copy into this Job: other Jobs (finished ones too) of the same workspace, and only plans for walls in a Location this Job also uses.
  // A person sees their own plans; Admin/Manager see all. Grouped by Production, then Job, in the dialog.
  const locIds = (await rows('select distinct rw.wall_template_id location_id from job_walls jw join room_walls rw on rw.id=jw.room_wall_id join rooms r on r.id=rw.room_id where jw.job_id=$1', [cur.id])).map((x: any) => x.location_id);
  const cands = locIds.length === 0 ? [] : await rows(`select j.id, j.name, x.updated_at, x.wts, j.id job_id, j.name job, p.id prod_id, p.name prod, (j.expires_at < current_date) expired, coalesce(u.name, u.email) who, 0 user_id,
      (select string_agg(distinct st.name || ' › ' || l.name, ', ') from job_wall_plans q join room_walls rw on rw.id=q.room_wall_id join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites st on st.id=l.site_id where q.job_id=j.id and rw.wall_template_id = any($4::int[])) place
    from (select q.job_id, array_agg(distinct rw.wall_template_id) wts, max(q.updated_at) updated_at, (array_agg(q.updated_by order by q.updated_at desc))[1] ub from job_wall_plans q join room_walls rw on rw.id=q.room_wall_id join rooms r on r.id=rw.room_id where q.job_id<>$1 and rw.wall_template_id = any($4::int[]) group by q.job_id) x
    join jobs j on j.id=x.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id left join users u on u.id=x.ub
    where b.tenant_id=$2 and ($3::boolean or j.id in (select job_id from job_users where user_id=$5))
    order by p.name, j.job_date desc nulls last limit 200`, [cur.id, tenantId, canManage(me), locIds, me.id]);
  const invRows = canManage(me) ? await rows('select lower(email) email, access, room_wall_id from wall_links where job_id=$1 and not revoked order by id', [cur.id]) : [];
  const invited = Array.from(new Set(invRows.map((x: any) => x.email))).map(e => ({ email: e as string, access: invRows.find((x: any) => x.email === e).access as string, walls: invRows.filter((x: any) => x.email === e).map((x: any) => x.room_wall_id as number) }));
  const contacts = canManage(me) ? await rows('select id,name,email,company from contacts where tenant_id=$1 order by name', [tenantId]) : [];
  const roomIds = [...new Set(rws.map((r: any) => r.room_id))];
  return (<><a href="/plans">← Monitor Plans</a><h1>{cur.prod} / {cur.name}</h1>{arch && <p className="mut">This Job has expired and is in the Archive: view only.</p>}
    {copied === 'review' && <p role="alert" style={{ color: '#b45309' }}>That plan had differences that need to be reviewed first. Open "Copy a saved plan" and tick the review box.</p>}
    {copied === 'none' && <p role="alert" style={{ color: '#b45309' }}>Nothing was copied: that plan has nothing to copy onto that wall.</p>}
    {roomIds.map(rid => { const rs = rws.filter((r: any) => r.room_id === rid); return (<div key={rid}><h2>Room: {rs[0].room}</h2>
      {rs.filter((r: any) => r.id).length === 0 ? <div className="card mut">No Wall Template has been added to this Room yet. Check back once it has been set up.</div> : <Plan hw={hw} printInfo={{ id: cur.id, bc: cur.broadcaster, prod: cur.prod, name: cur.name, dates: [['Job date', j.job_date], ['Final date', j.final_date], ['Expires', j.expires_at]].filter(x => x[1]).map(x => [x[0], new Date(x[1] as any).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })]) as [string, string][] }} refresh={loadPlans.bind(null, cur.id)} readOnly={arch} save={arch ? undefined : savePlan.bind(null, cur.id)} walls={pw.filter(w => rs.some((r: any) => r.id === w.id))} layouts={layouts} sources={j.sources ?? []} sourceCats={j.categories ?? {}} saved={saved} start={planQ} copy={arch || cands.length === 0 ? undefined : Object.fromEntries(rs.filter((r: any) => r.id && cands.some((c: any) => (c.wts ?? []).includes(r.wt_id))).map((r: any) => [r.id, <CopyPlan key={r.id} job={cur.id} wall={r.id} action={copyPlan} plans={cands.filter((c: any) => (c.wts ?? []).includes(r.wt_id)).map((c: any) => ({ id: c.id, name: c.name, prod: c.prod, prodId: c.prod_id, job: c.job, jobId: c.job_id, place: c.place ?? '', expired: !!c.expired, when: String(c.updated_at).slice(0, 10), who: c.user_id === me.id ? '' : c.who }))} />]))} below={Object.fromEntries(rs.filter((r: any) => r.id).map((r: any) => [r.id, <WallComments key={r.id} title={`${r.name} · ${cur.name}`} comments={wcom[r.id] ?? []} action={arch ? undefined : addComment} hidden={{ job: cur.id, wall: r.id }} />]))} />}
      {legacy.filter((c: any) => c.room_id === rid).length > 0 && <div className="card"><b>Earlier Room comments</b>{legacy.filter((c: any) => c.room_id === rid).map((c: any) => <div key={c.id}><b>{c.uname}</b>: {c.body}</div>)}</div>}</div>); })}
    {!arch && canManage(me) && <Invites job={cur.id} walls={rws.filter((r: any) => r.id).map((r: any) => ({ id: r.id, room: r.room, name: r.name }))} contacts={contacts as any} invited={invited} />}</>);
}
