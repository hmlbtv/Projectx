import { NextResponse } from 'next/server';
import { readSheet } from 'read-excel-file/node';
import { revalidatePath } from 'next/cache';
import { getMe, canManage } from '@/lib/session';
import { rows } from '@/lib/db';
import { sameOrigin } from '@/lib/wallImages';
import { record } from '@/lib/audit';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 5000, MAX_SETS = 200, MAX_PER_SET = 500;
function csv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); out.push(row); } return out;
}
const str = (v: unknown) => (v == null ? '' : String(v)).trim();
export async function POST(req: Request) {
  const me = await getMe(); if (!me || !me.tenant_id || !canManage(me) || !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const len = Number(req.headers.get('content-length')); if (!len || len > MAX_BYTES + 65536) return NextResponse.json({ error: 'That file is too big (2 MB maximum).' }, { status: 413 });
  const f = await req.formData(); const file = f.get('file');
  if (!(file instanceof File) || file.size > MAX_BYTES) return NextResponse.json({ error: 'Choose an Excel (.xlsx) or CSV file up to 2 MB.' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer()); let grid: unknown[][];
  try {
    if (buf[0] === 0x50 && buf[1] === 0x4b) grid = (await readSheet(buf)) as unknown[][];
    else if (/\.csv$/i.test(file.name)) grid = csv(buf.toString('utf8').replace(/^﻿/, ''));
    else return NextResponse.json({ error: 'Only Excel (.xlsx) or CSV files can be imported. Older .xls files: open and Save As .xlsx first.' }, { status: 400 });
  } catch { return NextResponse.json({ error: 'Could not read that file. Is it a valid .xlsx or .csv?' }, { status: 400 }); }
  const hi = grid.findIndex(r => r.some(c => /^(source\s*set|set)/i.test(str(c)))); if (hi < 0) return NextResponse.json({ error: 'No "Source Set" column found. Use the template: Source Set, Source.' }, { status: 400 });
  const cs = grid[hi].findIndex(c => /^(source\s*set|set)/i.test(str(c))), cr = grid[hi].findIndex((c, i) => i !== cs && /^(source|name|input)/i.test(str(c)));
  if (cr < 0) return NextResponse.json({ error: 'No "Source" column found. Use the template: Source Set, Source.' }, { status: 400 });
  const t = me.tenant_id;
  const want = new Map<string, { name: string; list: string[] }>(); let skipped = 0;
  grid.slice(hi + 1, hi + 1 + MAX_ROWS).forEach(r => {
    const set = str(r[cs]).slice(0, 120), src = str(r[cr]).slice(0, 120); if (!set && !src) return; if (!set || !src) { skipped++; return; }
    const k = set.toLowerCase(); const e = want.get(k) ?? { name: set, list: [] }; want.set(k, e); if (!e.list.some(x => x.toLowerCase() === src.toLowerCase())) e.list.push(src);
  });
  if (want.size === 0) return NextResponse.json({ error: 'No sources found in that file.' }, { status: 400 });
  const have = await rows<{ id: number; name: string; sources: string[] }>('select id, name, sources from source_sets where tenant_id=$1', [t]);
  let created = 0, updated = 0, addedSources = 0, notAdded = 0;
  for (const [k, e] of want) {
    const ex = have.find(h => h.name.toLowerCase() === k);
    if (ex) {
      const cur = Array.isArray(ex.sources) ? ex.sources : [], fresh = e.list.filter(x => !cur.some(c => c.toLowerCase() === x.toLowerCase())).slice(0, Math.max(0, MAX_PER_SET - cur.length));
      notAdded += e.list.length - fresh.length - e.list.filter(x => cur.some(c => c.toLowerCase() === x.toLowerCase())).length;
      if (fresh.length) { await rows('update source_sets set sources=$1 where id=$2 and tenant_id=$3', [JSON.stringify([...cur, ...fresh]), ex.id, t]); updated++; addedSources += fresh.length; }
    } else {
      if (have.length + created >= MAX_SETS) { notAdded += e.list.length; continue; }
      const list = e.list.slice(0, MAX_PER_SET); notAdded += e.list.length - list.length;
      await rows('insert into source_sets(tenant_id,name,sources) values($1,$2,$3)', [t, e.name, JSON.stringify(list)]); created++; addedSources += list.length;
    }
  }
  await record(t, me.id, me.name, 'importSources', `${created} Source Sets created, ${updated} extended, ${addedSources} sources added`);
  revalidatePath('/sources'); revalidatePath('/productions');
  return NextResponse.json({ created, updated, addedSources, skipped, notAdded });
}
