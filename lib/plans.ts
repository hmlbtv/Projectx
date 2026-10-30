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
  for (const id of ids) if (ok.has(id)) await rows('insert into job_wall_plans(job_id,room_wall_id,data,updated_by) values($1,$2,$3,$4) on conflict (job_id,room_wall_id) do update set data=excluded.data, updated_at=now(), updated_by=excluded.updated_by', [job, id, JSON.stringify(data[String(id)]), userId]);
}
