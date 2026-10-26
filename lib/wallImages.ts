import { rows } from './db';
export const sameOrigin = (req: Request) => { const o = req.headers.get('origin'); return !o || new URL(o).host === req.headers.get('host'); };
// Which saved Wall Templates (of this tenant) use each image.
export async function usage(tenant: number) {
  return rows(`select i.id image, w.id wall, w.name from wall_images i join wall_templates w on w.tenant_id=i.tenant_id
    where i.tenant_id=$1 and exists (select 1 from jsonb_array_elements(w.data->'assets') a where a->>'type'='img' and a->'props'->>'img' = i.id::text) order by w.name`, [tenant]);
}

