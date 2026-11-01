import { rows } from './db';

// One shared Monitor Plan per wall in a Job: everyone with access to the Job (and everyone invited to that wall) sees and changes the same plan.
export type WallPlanData = Record<string, any>;
export async function loadJobPlans(job: number, walls?: number[]): Promise<Record<string, WallPlanData>> {
  const r = await rows<{ room_wall_id: number; data: WallPlanData }>('select room_wall_id, data from job_wall_plans where job_id=$1' + (walls ? ' and room_wall_id = any($2::int[])' : ''), walls ? [job, walls] : [job]);
  return Object.fromEntries(r.map(x => [String(x.room_wall_id), x.data]));
}
// Saves only the walls sent (the client sends just the ones that person changed), limited to walls that belong to the Job.
export async function saveJobPlans(job: number, data: Record<string, any>, userId: number, only?: number) {
  if (JSON.stringify(data ?? {}).length > 100_000) throw new Error('Too large');
  const ids = Object.keys(data ?? {}).map(Number).filter(n => Number.isInteger(n) && n > 0 && (only == null || n === only));
  if (!ids.length) return;
  const ok = new Set((await rows<{ room_wall_id: number }>('select room_wall_id from job_walls where job_id=$1 and room_wall_id = any($2::int[])', [job, ids])).map(x => x.room_wall_id));
  const keep = ids.filter(i => ok.has(i)); if (!keep.length) return;
  // Who changed what: each window's source and each monitor's layout remembers the person who last changed it; every real change bumps the plan's version.
  const old = new Map((await rows<{ room_wall_id: number; data: WallPlanData; who: Record<string, number>; version: number }>('select room_wall_id, data, who, version from job_wall_plans where job_id=$1 and room_wall_id = any($2::int[])', [job, keep])).map(r => [r.room_wall_id, r]));
  for (const id of keep) {
    const nd = data[String(id)] ?? {}, o = old.get(id), od = o?.data ?? {}, who: Record<string, number> = { ...(o?.who ?? {}) };
    if (o && JSON.stringify(od) === JSON.stringify(nd)) continue; // nothing changed: no new version
    const mk = new Set([...Object.keys(od.mons ?? {}), ...Object.keys(nd.mons ?? {})]); for (const k of mk) if ((od.mons ?? {})[k] !== (nd.mons ?? {})[k]) who[`m:${k}`] = userId;
    const ak = new Set([...Object.keys(od.srcs ?? {}), ...Object.keys(nd.srcs ?? {})]);
    for (const k of ak) { const a = od.srcs?.[k] ?? {}, b = nd.srcs?.[k] ?? {}; for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[t] !== b[t]) { if (b[t]) who[`s:${k}:${t}`] = userId; else delete who[`s:${k}:${t}`]; } }
    await rows(`insert into job_wall_plans(job_id,room_wall_id,data,updated_by,who,version) values($1,$2,$3,$4,$5,$6)
      on conflict (job_id,room_wall_id) do update set data=excluded.data, updated_at=now(), updated_by=excluded.updated_by, who=excluded.who, version=job_wall_plans.version+1`, [job, id, JSON.stringify(nd), userId, JSON.stringify(who), 1]);
  }
}
// What the printout needs besides the plan itself: version, last save, and the names behind each change.
export async function planMeta(job: number, wall: number) {
  const r = (await rows<any>('select p.version, p.updated_at, p.who, u.name updater, u.email uemail from job_wall_plans p left join users u on u.id=p.updated_by where p.job_id=$1 and p.room_wall_id=$2', [job, wall]))[0];
  const who: Record<string, number> = r?.who ?? {}, ids = Array.from(new Set(Object.values(who).map(Number))), names = ids.length ? await rows<{ id: number; name: string; email: string }>('select id, name, email from users where id = any($1::int[])', [ids]) : [];
  return { version: r?.version ?? 0, updatedAt: r?.updated_at ? new Date(r.updated_at).toISOString() : null, updatedBy: r ? (r.updater || r.uemail || '') : '', who: Object.fromEntries(Object.entries(who).map(([k, v]) => { const u = names.find(n => n.id === Number(v)); return [k, u ? (u.name || u.email) : 'Unknown']; })) as Record<string, string> };
}
