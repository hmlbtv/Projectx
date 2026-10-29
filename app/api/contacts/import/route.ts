import { NextResponse } from 'next/server';
import { readSheet } from 'read-excel-file/node';
import { revalidatePath } from 'next/cache';
import { getMe, canManage } from '@/lib/session';
import { rows, one } from '@/lib/db';
import { sameOrigin } from '@/lib/wallImages';
import { record } from '@/lib/audit';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 2000, MAX_CONTACTS = 2000, EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function csv(text: string): string[][] { // small CSV reader: quotes, commas and line breaks inside quotes
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
  // Find the header row (the one with an Email column) and which column is which.
  const hi = grid.findIndex(r => r.some(c => /^e-?mail/i.test(str(c)))); if (hi < 0) return NextResponse.json({ error: 'No "Email" column found. Use the template: Name, Email, Company.' }, { status: 400 });
  const col = (re: RegExp) => grid[hi].findIndex(c => re.test(str(c)));
  const cn = col(/^(full\s*)?name|^contact/i), ce = col(/^e-?mail/i), cc = col(/^(company|organi[sz]ation|business)/i);
  if (cn < 0) return NextResponse.json({ error: 'No "Name" column found. Use the template: Name, Email, Company.' }, { status: 400 });
  const t = me.tenant_id;
  const have = new Set((await rows<{ email: string }>('select email from contacts where tenant_id=$1', [t])).map(r => r.email));
  let room = MAX_CONTACTS - have.size;
  const seen = new Set<string>(), add: { name: string; email: string; company: string }[] = [], bad: { row: number; why: string }[] = []; let dup = 0, full = 0;
  grid.slice(hi + 1, hi + 1 + MAX_ROWS).forEach((r, i) => {
    const name = str(r[cn]).slice(0, 200), email = str(r[ce]).toLowerCase().slice(0, 200), company = cc >= 0 ? str(r[cc]).slice(0, 200) : '';
    if (!name && !email && !company) return; const rowNo = hi + 2 + i;
    if (!name) return void bad.push({ row: rowNo, why: 'no name' }); if (!EMAIL.test(email)) return void bad.push({ row: rowNo, why: 'not a valid email' });
    if (have.has(email) || seen.has(email)) { dup++; return; } if (room <= 0) { full++; return; } room--; seen.add(email);
    add.push({ name, email, company });
  });
  let added = 0;
  if (add.length) {
    const ins = await rows<{ id: number; email: string }>('insert into contacts(tenant_id,name,email,company) select $1, n, e, c from unnest($2::text[],$3::text[],$4::text[]) as u(n,e,c) on conflict do nothing returning id,email', [t, add.map(a => a.name), add.map(a => a.email), add.map(a => a.company)]);
    added = ins.length;
  }
  await record(t, me.id, me.name, 'importContacts', `${added} added, ${dup} already there, ${bad.length} skipped`);
  revalidatePath('/contacts'); revalidatePath('/productions');
  return NextResponse.json({ added, duplicates: dup, invalid: bad.length, problems: bad.slice(0, 10), notAdded: full });
}
