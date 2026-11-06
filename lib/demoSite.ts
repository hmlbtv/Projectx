import { one, rows } from './db';

// The Demo Site: "(DEMO)Tele Planner TV". The site admin builds it in their own workspace as an ordinary Broadcaster with this name (Productions, Jobs, Wall Templates,
// walls, Monitor Plans, sources), then publishes it. Every Demo workspace gets its own copy the first time someone signs in, can change it freely, and can reset it
// back to the published version. Copies are tagged (demo = true) and do not count against plan limits.
export const DEMO_NAME = '(DEMO)Tele Planner TV';
const KEY = 'demo_site';

type Snap = { at: string; sites: any[]; locs: any[]; rooms: any[]; wts: any[]; rwalls: any[]; sets: any[]; prods: any[] };

export async function demoInfo() {
  const r = await one<{ value: string }>('select value from settings where key=$1', [KEY]);
  if (!r) return null; try { const d: Snap = JSON.parse(r.value); return { at: d.at, prods: d.prods.length, jobs: d.prods.reduce((n, p) => n + p.jobs.length, 0), walls: d.rwalls.length }; } catch { return null; }
}

// Read the site admin's "(DEMO)Tele Planner TV" Broadcaster and store a copy as the published Demo Site.
export async function publishDemo(tenant: number): Promise<{ error?: string; ok?: string }> {
  const b = await one<{ id: number }>('select id from broadcasters where tenant_id=$1 and name=$2 order by id limit 1', [tenant, DEMO_NAME]);
  if (!b) return { error: `Create a Broadcaster called ${DEMO_NAME} in your workspace first, and build the example in it.` };
  const prods = await rows<any>('select id, name from productions where broadcaster_id=$1 order by id', [b.id]);
  const jobs = await rows<any>(`select j.id, j.production_id, j.name, (j.job_date - current_date)::int jd, (j.final_date - current_date)::int fd, (j.expires_at - current_date)::int ex, j.source_set_id ss
    from jobs j join productions p on p.id=j.production_id where p.broadcaster_id=$1 order by j.id`, [b.id]);
  if (!jobs.length) return { error: 'The example has no Jobs yet. Add a Production and a Job to it first.' };
  const jw = await rows<any>('select job_id, room_wall_id from job_walls where job_id = any($1::int[])', [jobs.map(j => j.id)]);
  const plans = await rows<any>('select job_id, room_wall_id, data from job_wall_plans where job_id = any($1::int[])', [jobs.map(j => j.id)]);
  const rwIds = Array.from(new Set(jw.map(x => x.room_wall_id as number)));
  const rwalls = rwIds.length ? await rows<any>('select id, room_id, wall_template_id, name from room_walls where id = any($1::int[])', [rwIds]) : [];
  const rooms = rwalls.length ? await rows<any>('select id, location_id, name, whole from rooms where id = any($1::int[])', [Array.from(new Set(rwalls.map(x => x.room_id)))]) : [];
  const locs = rooms.length ? await rows<any>('select id, site_id, name from locations where id = any($1::int[])', [Array.from(new Set(rooms.map(x => x.location_id)))]) : [];
  const sites = locs.length ? await rows<any>('select id, name from sites where id = any($1::int[])', [Array.from(new Set(locs.map(x => x.site_id)))]) : [];
  const wts = rwalls.length ? await rows<any>('select id, name, data, defaults, site_id, broadcaster_id from wall_templates where id = any($1::int[])', [Array.from(new Set(rwalls.map(x => x.wall_template_id)))]) : [];
  const setIds = Array.from(new Set(jobs.map(j => j.ss).filter(Boolean)));
  const sets = setIds.length ? await rows<any>('select id, name, sources, categories, cat_names from source_sets where id = any($1::int[])', [setIds]) : [];
  const snap: Snap = {
    at: new Date().toISOString(), sites, locs, rooms, wts: wts.map(w => ({ ...w, own: w.broadcaster_id === b.id })), rwalls, sets,
    prods: prods.map(p => ({ id: p.id, name: p.name, jobs: jobs.filter(j => j.production_id === p.id).map(j => ({ id: j.id, name: j.name, jd: j.jd, fd: j.fd, ex: j.ex, ss: j.ss,
      walls: jw.filter(x => x.job_id === j.id).map(x => x.room_wall_id), plans: Object.fromEntries(plans.filter(x => x.job_id === j.id).map(x => [x.room_wall_id, x.data])) })) })),
  };
  const text = JSON.stringify(snap); if (text.length > 4_000_000) return { error: 'The Demo Site is too large to publish.' };
  await rows('insert into settings(key,value) values($1,$2) on conflict (key) do update set value=excluded.value', [KEY, text]);
  return { ok: `Published: ${snap.prods.length} Production${snap.prods.length === 1 ? '' : 's'}, ${jobs.length} Job${jobs.length === 1 ? '' : 's'}, ${rwalls.length} wall${rwalls.length === 1 ? '' : 's'}. New workspaces get it on first sign-in, and anyone can reset to it.` };
}

// Give a workspace its own copy (replacing the one it has). Only rows tagged demo are removed, so a user's own work is never touched.
export async function installDemo(tenant: number): Promise<{ error?: string }> {
  const r = await one<{ value: string }>('select value from settings where key=$1', [KEY]); if (!r) return { error: 'The Demo Site has not been published yet.' };
  const d: Snap = JSON.parse(r.value);
  await rows('delete from broadcasters where tenant_id=$1 and demo', [tenant]); // Productions, Jobs, their walls, plans and invitations go with it
  await rows('delete from sites where tenant_id=$1 and demo', [tenant]);
  await rows('delete from wall_templates where tenant_id=$1 and demo', [tenant]);
  await rows('delete from source_sets where tenant_id=$1 and demo', [tenant]);
  const bid = (await one<{ id: number }>('insert into broadcasters(tenant_id,name,demo) values($1,$2,true) returning id', [tenant, DEMO_NAME]))!.id;
  const m = { site: new Map<number, number>(), loc: new Map<number, number>(), room: new Map<number, number>(), wt: new Map<number, number>(), rw: new Map<number, number>(), set: new Map<number, number>() };
  for (const x of d.sites) m.site.set(x.id, (await one<{ id: number }>('insert into sites(tenant_id,name,demo) values($1,$2,true) returning id', [tenant, x.name]))!.id);
  for (const x of d.locs) m.loc.set(x.id, (await one<{ id: number }>('insert into locations(site_id,name) values($1,$2) returning id', [m.site.get(x.site_id), x.name]))!.id);
  for (const x of d.rooms) m.room.set(x.id, (await one<{ id: number }>('insert into rooms(location_id,name,whole) values($1,$2,$3) returning id', [m.loc.get(x.location_id), x.name, !!x.whole]))!.id);
  for (const x of d.wts) m.wt.set(x.id, (await one<{ id: number }>('insert into wall_templates(tenant_id,name,data,defaults,site_id,broadcaster_id,demo) values($1,$2,$3,$4,$5,$6,true) returning id',
    [tenant, x.name, JSON.stringify(x.data ?? { assets: [] }), JSON.stringify(x.defaults ?? []), m.site.get(x.site_id) ?? null, x.own ? bid : null]))!.id);
  for (const x of d.rwalls) m.rw.set(x.id, (await one<{ id: number }>('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3) returning id', [m.room.get(x.room_id), m.wt.get(x.wall_template_id), x.name]))!.id);
  for (const x of d.sets) m.set.set(x.id, (await one<{ id: number }>('insert into source_sets(tenant_id,name,sources,categories,cat_names,demo) values($1,$2,$3,$4,$5,true) returning id',
    [tenant, x.name, JSON.stringify(x.sources ?? []), JSON.stringify(x.categories ?? {}), JSON.stringify(x.cat_names ?? [])]))!.id);
  const day = (n: number | null) => n == null ? null : new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  for (const p of d.prods) {
    const pid = (await one<{ id: number }>('insert into productions(broadcaster_id,name) values($1,$2) returning id', [bid, p.name]))!.id;
    for (const j of p.jobs) {
      const jid = (await one<{ id: number }>('insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id) values($1,$2,$3,$4,$5,$6) returning id',
        [pid, j.name, day(j.jd), day(j.fd), day(j.ex), j.ss ? m.set.get(j.ss) ?? null : null]))!.id;
      for (const w of j.walls) { const rw = m.rw.get(w); if (rw) await rows('insert into job_walls(job_id,room_wall_id) values($1,$2) on conflict do nothing', [jid, rw]); }
      for (const [w, data] of Object.entries(j.plans ?? {})) { const rw = m.rw.get(Number(w)); if (rw) await rows('insert into job_wall_plans(job_id,room_wall_id,data) values($1,$2,$3) on conflict do nothing', [jid, rw, JSON.stringify(data)]); }
    }
  }
  await rows('update tenants set demo_given=true where id=$1', [tenant]);
  return {};
}

// On sign-in: a Demo workspace that has never had the example gets it. Never throws, and never brings back one that was deleted on purpose.
export async function giveDemoOnLogin(tenant: number | null) {
  if (!tenant) return;
  try {
    const t = await one<{ plan: string; demo_given: boolean }>('select plan, demo_given from tenants where id=$1', [tenant]);
    if (!t || t.demo_given || t.plan !== 'demo' || !(await demoInfo())) return;
    await installDemo(tenant);
  } catch { /* best effort */ }
}
