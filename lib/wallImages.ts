import { rows } from './db';
// Browser changes must say where they came from (Origin) and it must be this site; a request with no Origin is refused.
export const sameOrigin = (req: Request) => {
  const o = req.headers.get('origin'); if (!o) return false;
  let host: string; try { host = new URL(o).host; } catch { return false; }
  const ok = new Set<string>([req.headers.get('host') ?? '']);
  for (const u of [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) if (u) { try { ok.add(new URL(u.startsWith('http') ? u : 'https://' + u).host); } catch {} }
  return ok.has(host);
};
// Which saved Wall Templates (of this tenant) use each image.
export async function usage(tenant: number) {
  return rows(`select i.id image, w.id wall, w.name from wall_images i join wall_templates w on w.tenant_id=i.tenant_id
    where i.tenant_id=$1 and exists (select 1 from jsonb_array_elements(w.data->'assets') a where a->>'type'='img' and a->'props'->>'img' = i.id::text) order by w.name`, [tenant]);
}

