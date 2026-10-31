import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getMe, canManage } from '@/lib/session';
import { sameOrigin } from '@/lib/wallImages';
import { record } from '@/lib/audit';
import { importJobs } from '@/lib/jobImport';
import { loadConfig, saveConfig, secretOf, pull, records, fieldsOf, flat, mapRecords, TARGETS, type Mapping } from '@/lib/integration';
export const dynamic = 'force-dynamic';
const bad = (e: string, s = 400) => NextResponse.json({ error: e }, { status: s });

// action: save | test (fetch a sample) | import. The saved key never leaves the server.
export async function POST(req: Request) {
  const me = await getMe(); if (!me || !me.tenant_id || !canManage(me) || !sameOrigin(req)) return bad('Not allowed', 403);
  const b = await req.json().catch(() => null); if (!b || typeof b !== 'object') return bad('Bad request');
  const t = me.tenant_id, str = (v: unknown, n = 500) => String(v ?? '').trim().slice(0, n);
  try {
    if (b.action === 'save') {
      await saveConfig(t, { name: str(b.name, 80), url: str(b.url), auth_header: str(b.auth_header, 60), auth_value: str(b.auth_value, 500), records_path: str(b.records_path, 200), mapping: (b.mapping ?? {}) as Mapping });
      await record(t, me.id, me.name, 'saveIntegration', `Saved the scheduling integration "${str(b.name, 80)}"`); revalidatePath('/integrations'); return NextResponse.json({ ok: true });
    }
    const c = await loadConfig(t); if (!c?.url) return bad('Save the connection first.');
    const data = await pull(c.url, c.auth_header, secretOf(c)), recs = records(data, c.records_path);
    if (b.action === 'test') return NextResponse.json({ total: recs.length, fields: fieldsOf(recs), sample: recs.slice(0, 5).map(r => flat(r)) });
    if (b.action === 'import') {
      const m: Mapping = c.mapping ?? {}; const miss = TARGETS.filter(x => x.required && !m[x.key]).map(x => x.label);
      if (miss.length) return bad(`Map these first: ${miss.join(', ')}.`);
      if (b.preview) return NextResponse.json({ rows: mapRecords(recs, m).slice(0, 10), total: recs.length });
      const res = await importJobs(me, mapRecords(recs, m), `Scheduling system "${c.name || c.url}"`); revalidatePath('/productions'); revalidatePath('/plans'); return NextResponse.json(res);
    }
    return bad('Unknown action');
  } catch (e: any) { return bad(e?.message ?? 'Failed'); }
}
