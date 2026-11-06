import Link from 'next/link';
import { rows } from '@/lib/db';
import { myEmails } from '@/lib/emails';
import { requireMe, myOrgs } from '@/lib/session';
import ArchiveFilter from '../ArchiveFilter';
import DetailTable from './DetailTable';
import AutoSelect from '../AutoSelect';
import Calendar from '../productions/Calendar';
import { unreadByWall } from '@/lib/comments';
export const dynamic = 'force-dynamic';

// Every active invitation sent to this account's email, from any tenant, in one place.
export default async function Shared({ searchParams }: { searchParams: Promise<{ q?: string; v?: string; cv?: string; cd?: string; org?: string; bc?: string; acc?: string; when?: string; new?: string }> }) {
  const sp = await searchParams, q = (sp.q ?? '').trim().slice(0, 80), view = sp.v === 'cal' || sp.v === 'detail' ? sp.v : 'list';
  const me = await requireMe();
  // People who belong to several organizations only see shares that belong to the organization they are working in (and, in their home organization, shares from organizations they are not a member of), so two companies never appear together.
  const multi = (await myOrgs(me.id)).length > 1;
  const items = await rows(`select j.job_date, j.final_date, t.id tenant_id, wl.id, wl.job_id, wl.room_wall_id, wl.access, (j.expires_at < current_date) expired, t.name tenant, b.name broadcaster, p.name prod, j.name job, r.name room, rw.name wall, j.expires_at
    from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id join tenants t on t.id=b.tenant_id
    join room_walls rw on rw.id=wl.room_wall_id join rooms r on r.id=rw.room_id
    where lower(wl.email) in ${myEmails(1)} and ($2::boolean = false or t.id=$3 or ($4::boolean and t.id not in (select tenant_id from users where id=$1 union select tenant_id from memberships where user_id=$1))) and not wl.revoked and (select tn.status from tenants tn join broadcasters bb on bb.tenant_id=tn.id join productions pp on pp.broadcaster_id=bb.id where pp.id=j.production_id)='active' order by t.name, j.job_date desc nulls last, wl.id`, [me.id, multi, me.tenant_id ?? 0, !me.membership_id]);
  const unread = await unreadByWall(me.id);
  const dt = (x: any) => x ? new Date(x).toISOString().slice(0, 10) : '';
  const today = new Date().toISOString().slice(0, 10), nw = (x: any) => unread[`${x.job_id}:${x.room_wall_id}`] > 0;
  const fo = sp.org ?? '', fb = sp.bc ?? '', fa = sp.acc === 'edit' || sp.acc === 'view' ? sp.acc : '', fw = ['upcoming', 'past', 'undated'].includes(sp.when ?? '') ? sp.when! : '', fn = sp.new === '1';
  const uniq = (k: string) => [...new Set(items.map((x: any) => x[k] as string))].sort((a, b) => a.localeCompare(b));
  const filtered = items.filter((x: any) => (!fo || x.tenant === fo) && (!fb || x.broadcaster === fb) && (!fa || (fa === 'edit') === (x.access === 'edit')) && (!fn || nw(x))
    && (!fw || (fw === 'undated' ? !x.job_date : fw === 'upcoming' ? !!x.job_date && dt(x.final_date ?? x.job_date) >= today : !!x.job_date && dt(x.final_date ?? x.job_date) < today)));
  const needle = q.toLowerCase();
  const shown = needle ? filtered.filter((x: any) => `${x.tenant} ${x.broadcaster} ${x.prod} ${x.job} ${x.room} ${x.wall} ${x.access === 'edit' ? 'can edit' : 'view only'}`.toLowerCase().includes(needle)) : filtered;

  const render = (list: any[], archived: boolean) => [...new Set(list.map((x: any) => x.tenant))].map(g => (<div key={g}><h2>{g}</h2>{list.filter((i: any) => i.tenant === g).map((i: any) => (
      <div key={i.id} className="card" style={unread[`${i.job_id}:${i.room_wall_id}`] > 0 ? { borderLeft: '6px solid #e5352b', boxShadow: '0 0 0 2px rgba(229,53,43,.35)' } : undefined}><div className="row" style={{ justifyContent: 'space-between' }}><div><b>{i.wall}</b> <div className="mut" style={{ fontSize: '.85rem' }}>{i.broadcaster} \ {i.prod} \ {i.job} · {i.room}</div></div>
        <div>{unread[`${i.job_id}:${i.room_wall_id}`] > 0 && <Link href={`/shared/${i.id}`} style={{ textDecoration: 'none', marginRight: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e5352b', color: '#fff', fontWeight: 800, fontSize: '.9rem', padding: '7px 13px', borderRadius: 999, boxShadow: '0 0 0 4px rgba(229,53,43,.25)' }}>🔔 {unread[`${i.job_id}:${i.room_wall_id}`]} new</span></Link>}<span className="tag">{archived ? 'Expired' : i.access === 'edit' ? 'Can edit' : 'View only'}</span> <Link href={`/shared/${i.id}`}><button className="sec" type="button">Open</button></Link></div></div></div>))}</div>));
  const live = shown.filter((x: any) => !x.expired), old = shown.filter((x: any) => x.expired);
  const evs = shown.filter((i: any) => i.job_date).map((i: any) => { const st = dt(i.job_date), en = dt(i.final_date); return { id: i.id, title: i.wall, prod: `${i.prod} › ${i.job}`, bc: i.tenant_id ?? 0, bcName: i.tenant, start: st, end: en && en >= st ? en : st }; });
  const keep = [q && 'q=' + encodeURIComponent(q), fo && 'org=' + encodeURIComponent(fo), fb && 'bc=' + encodeURIComponent(fb), fa && 'acc=' + fa, fw && 'when=' + fw, fn && 'new=1'].filter(Boolean).join('&');
  const tab = (v: string, label: string, first: boolean, last: boolean) => (<Link href={`/shared?v=${v}${keep ? '&' + keep : ''}`} className={view === v ? 'btn small' : 'btn sec small'} style={{ borderRadius: first ? '8px 0 0 8px' : last ? '0 8px 8px 0' : 0, ...(view === v ? { background: '#e5352b', color: '#fff', borderColor: '#e5352b' } : {}) }}>{label}</Link>);
  const detail = (list: any[]) => (<DetailTable rows={list.map((i: any) => ({ id: i.id, wall: i.wall, path: `${i.broadcaster} › ${i.prod} › ${i.job}`, room: i.room, org: i.tenant, date: dt(i.job_date), access: i.expired ? 'Expired' : i.access === 'edit' ? 'Can edit' : 'View only', unread: unread[`${i.job_id}:${i.room_wall_id}`] ?? 0 }))} />);
  return (<><h1>Shared with me</h1><p className="mut">Monitor walls other teams have shared with you (sent to {me.email} or any other email you have added in Account). You can edit or only view each one, depending on the invitation.</p>
    {items.length > 0 && <><form method="get" className="searchbar"><input name="q" defaultValue={q} placeholder="Search walls, Jobs, Productions, rooms or organizations" aria-label="Search" /><input type="hidden" name="v" value={view} /><button className="sec">Search</button>
        <AutoSelect name="org" value={fo} label="Organization" options={[['', 'All organizations'], ...uniq('tenant').map(x => [x, x] as [string, string])]} />
        <AutoSelect name="bc" value={fb} label="Broadcaster" options={[['', 'All Broadcasters'], ...uniq('broadcaster').map(x => [x, x] as [string, string])]} />
        <AutoSelect name="acc" value={fa} label="Access" options={[['', 'Any access'], ['edit', 'Can edit'], ['view', 'View only']]} />
        <AutoSelect name="when" value={fw} label="When" options={[['', 'Any date'], ['upcoming', 'Current and upcoming'], ['past', 'Past'], ['undated', 'No date']]} />
        <AutoSelect name="new" value={fn ? '1' : ''} label="Comments" options={[['', 'All walls'], ['1', 'New comments only']]} />
        {(q || fo || fb || fa || fw || fn) && <Link href={`/shared?v=${view}`} className="btn small">Clear filters</Link>}</form>
      <div style={{ display: 'inline-flex', margin: '4px 0 12px' }} role="group" aria-label="View">{tab('list', 'List', true, false)}{tab('detail', 'Details', false, false)}{tab('cal', 'Calendar', false, true)}</div></>}
    {items.length === 0 && <div className="card mut">Nothing is shared with you right now. When someone invites you to a wall it will appear here.</div>}
    {items.length > 0 && shown.length === 0 && <div className="card mut">Nothing matches your search.</div>}
    {view === 'cal' && shown.length > 0 && (evs.length ? <Calendar shared extra={q ? `q=${encodeURIComponent(q)}&` : ''} events={evs} initView={sp.cv === 'day' || sp.cv === 'week' ? sp.cv : 'month'} initDate={sp.cd} /> : <div className="card mut">None of these walls has a Job date to show.</div>)}
    {view === 'list' && render(live, false)}
    {view === 'detail' && live.length > 0 && detail(live)}
    {view !== 'cal' && old.length > 0 && <details><summary style={{ cursor: 'pointer', fontSize: '1.4rem', fontWeight: 700, margin: '28px 0 10px' }}>Archive ({old.length})</summary><><p className="mut">Expired Jobs, kept for reference (view only).</p>{view === 'detail' ? detail(old) : <ArchiveFilter items={old.map((i: any) => ({ key: i.id, text: `${i.tenant} ${i.broadcaster} ${i.prod} ${i.job} ${i.room} ${i.wall}`, prod: i.prod, year: String(i.job_date ?? '').slice(0, 4), node: render([i], true) }))} />}</></details>}</>);
}
