import { NextResponse } from 'next/server';
import { readSheet } from 'read-excel-file/node';
import { revalidatePath } from 'next/cache';
import { getMe, isAdmin } from '@/lib/session';
import { rows } from '@/lib/db';
import { sameOrigin } from '@/lib/wallImages';
import { record } from '@/lib/audit';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
function csv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); out.push(row); } return out;
}
const str = (v: unknown) => (v == null ? '' : String(v)).trim();
// Applies the names in an exported sheet back onto the same unit. Rows are matched by Type and Number; the Hardware column must be this unit's name.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe(); if (!me || !me.tenant_id || !isAdmin(me) || !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const id = Number((await ctx.params).id); const u = (await rows<any>('select * from hw_units where id=$1 and tenant_id=$2', [id, me.tenant_id]))[0]; if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const len = Number(req.headers.get('content-length')); if (!len || len > MAX_BYTES + 65536) return NextResponse.json({ error: 'That file is too big (2 MB maximum).' }, { status: 413 });
  const f = await req.formData(); const file = f.get('file');
  if (!(file instanceof File) || file.size > MAX_BYTES) return NextResponse.json({ error: 'Choose an Excel (.xlsx) or CSV file up to 2 MB.' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer()); let grid: unknown[][];
  try {
    if (buf[0] === 0x50 && buf[1] === 0x4b) grid = (await readSheet(buf)) as unknown[][];
    else if (/\.csv$/i.test(file.name)) grid = csv(buf.toString('utf8').replace(/^\uFEFF/, ''));
    else return NextResponse.json({ error: 'Only Excel (.xlsx) or CSV files can be imported.' }, { status: 400 });
  } catch { return NextResponse.json({ error: 'Could not read that file. Is it a valid .xlsx or .csv?' }, { status: 400 }); }
  const hi = grid.findIndex(r => r.some(c => /^type$/i.test(str(c)))); if (hi < 0) return NextResponse.json({ error: 'Use the sheet exported from this unit: Hardware, Type, Number, Hardware name, Friendly name.' }, { status: 400 });
  const H = grid[hi].map(c => str(c).toLowerCase()), ci = (re: RegExp) => H.findIndex(x => re.test(x));
  const cHw = ci(/^hardware$/), cT = ci(/^type$/), cN = ci(/^number|^no\.?$/), cH = ci(/^hardware name/), cF = ci(/^friendly/);
  if (cT < 0 || cN < 0 || cF < 0) return NextResponse.json({ error: 'Columns needed: Type, Number and Friendly name (as in the exported sheet).' }, { status: 400 });
  const dn: Record<string, string> = { ...(u.dest_names ?? {}) }, dh: Record<string, string> = { ...(u.dest_hw ?? {}) }, on: Record<string, string> = { ...(u.out_names ?? {}) }, oh: Record<string, string> = { ...(u.out_hw ?? {}) };
  let applied = 0, skipped = 0; const problems: string[] = []; const bad = (m: string) => { if (problems.length < 40) problems.push(m); };
  const seen = new Set<string>(); let rowNo = hi + 1;
  for (const r of grid.slice(hi + 1, hi + 1 + 5000)) {
    rowNo++;
    const type = str(r[cT]).toLowerCase(), num = Math.round(Number(str(r[cN]))); if (!type && !str(r[cN])) continue;
    if (cHw >= 0 && str(r[cHw]) && str(r[cHw]).toLowerCase() !== String(u.name).toLowerCase()) return NextResponse.json({ error: `This file is for “${str(r[cHw])}”, but this unit is “${u.name}”. Nothing was imported.` }, { status: 400 });
    const dest = /^dest/.test(type), out = /^out/.test(type), max = dest ? u.inputs : u.outputs;
    if (!dest && !out) { skipped++; bad(`Row ${rowNo}: Type “${str(r[cT])}” is not recognised. Use Destination or Output.`); continue; }
    if (!Number.isFinite(num) || !str(r[cN])) { skipped++; bad(`Row ${rowNo}: the Number is missing or is not a number.`); continue; }
    if (!(num >= 1 && num <= max)) { skipped++; bad(`Row ${rowNo}: ${dest ? 'Destination' : 'Output'} ${num} does not exist on this unit (it has ${max} ${dest ? 'inputs' : 'outputs'}, so use 1 to ${max}).`); continue; }
    const key = (dest ? 'd' : 'o') + num; if (seen.has(key)) bad(`Row ${rowNo}: ${dest ? 'Destination' : 'Output'} ${num} appears more than once. The last row is used.`); seen.add(key);
    if (str(r[cF]).length > 60) bad(`Row ${rowNo}: the friendly name for ${dest ? 'destination' : 'output'} ${num} is longer than 60 characters and was shortened.`);
    const friendly = str(r[cF]).slice(0, 60), hwn = cH >= 0 ? str(r[cH]).slice(0, 60) : '', generic = new RegExp(`^(destination|output)\\s*${num}$`, 'i').test(hwn);
    const [names, hws] = dest ? [dn, dh] : [on, oh];
    if (friendly) names[num] = friendly; else delete names[num];
    if (cH >= 0) { if (hwn && !generic) hws[num] = hwn; else delete hws[num]; }
    applied++;
  }
  if (!applied) return NextResponse.json({ error: 'No destination or output rows could be imported from that file. Nothing was changed.', problems }, { status: 400 });
  await rows('update hw_units set dest_names=$2, dest_hw=$3, out_names=$4, out_hw=$5 where id=$1 and tenant_id=$6', [id, JSON.stringify(dn), JSON.stringify(dh), JSON.stringify(on), JSON.stringify(oh), me.tenant_id]);
  await record(me.tenant_id, me.id, me.name, 'importHwNames', `${u.name}: ${applied} names`);
  revalidatePath('/hardware'); revalidatePath('/plans');
  return NextResponse.json({ applied, skipped, problems });
}
