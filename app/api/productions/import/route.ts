import { NextResponse } from 'next/server';
import readXlsxFile from 'read-excel-file/node';
import { revalidatePath } from 'next/cache';
import { getMe, canManage } from '@/lib/session';
import { sameOrigin } from '@/lib/wallImages';
import { importJobs, type Rec } from '@/lib/jobImport';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 2 * 1024 * 1024, str = (v: unknown) => (v == null ? '' : String(v)).trim();
const SKIP = /^(lists|how to use)$/i;
const isDate = (v: unknown) => v instanceof Date ? v : str(v);

export async function POST(req: Request) {
  const me = await getMe(); if (!me || !me.tenant_id || !canManage(me) || !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const len = Number(req.headers.get('content-length')); if (!len || len > MAX_BYTES + 65536) return NextResponse.json({ error: 'That file is too big (2 MB maximum).' }, { status: 413 });
  const file = (await req.formData()).get('file'); if (!(file instanceof File) || file.size > MAX_BYTES) return NextResponse.json({ error: 'Choose an Excel (.xlsx) file up to 2 MB.' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer()); if (!(buf[0] === 0x50 && buf[1] === 0x4b)) return NextResponse.json({ error: 'Only Excel (.xlsx) files can be imported. Use the template.' }, { status: 400 });
  let sheets: { sheet: string; data: unknown[][] }[]; try { sheets = (await readXlsxFile(buf)) as any; } catch { return NextResponse.json({ error: 'Could not read that file. Is it a valid .xlsx?' }, { status: 400 }); }
  const recs: Rec[] = [];
  for (const sh of sheets) { if (SKIP.test(sh.sheet.trim())) continue;
    const hi = sh.data.findIndex(r => r.some(c => /^production$/i.test(str(c)))); if (hi < 0) continue; const hd = sh.data[hi].map(c => str(c).toLowerCase());
    const ix = (re: RegExp) => hd.findIndex(c => re.test(c)), P = ix(/^production/), J = ix(/^job\s*name|^job$|^name/), D = ix(/^job\s*date|^date/), F = ix(/^final/), E = ix(/^expire/), S = ix(/^source/);
    if (P < 0 || J < 0) continue;
    for (const r of sh.data.slice(hi + 1)) recs.push({ broadcaster: sh.sheet, production: str(r[P]), job: str(r[J]), date: D >= 0 ? isDate(r[D]) as any : null, final: F >= 0 ? isDate(r[F]) as any : null, expires: E >= 0 ? isDate(r[E]) as any : null, sourceSet: S >= 0 ? str(r[S]) : null }); }
  if (!recs.some(r => r.job)) return NextResponse.json({ error: 'No Jobs found. Use the template: a tab per Broadcaster with Production and Job name columns.' }, { status: 400 });
  const res = await importJobs(me, recs, 'Excel import'); revalidatePath('/productions'); revalidatePath('/plans');
  return NextResponse.json(res);
}
