import { NextResponse } from 'next/server';
import writeExcelFile from 'write-excel-file/node';
import { getMe, isAdmin } from '@/lib/session';
import { rows } from '@/lib/db';
export const dynamic = 'force-dynamic';

// The Excel sheet for one hardware unit: its name, every destination and output with the hardware's own name filled in, and a column for the friendly names to fill in.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe(); if (!me || !me.tenant_id || !isAdmin(me)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const id = Number((await ctx.params).id); const u = (await rows<any>('select * from hw_units where id=$1 and tenant_id=$2', [id, me.tenant_id]))[0]; if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const h = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#e6edf3' });
  const t = (v: string | number) => ({ value: String(v), type: String });
  const n = (v: number) => ({ value: v, type: Number });
  const data: any[][] = [[h('Hardware'), h('Type'), h('Number'), h('Hardware name'), h('Friendly name')]];
  for (let i = 1; i <= u.inputs; i++) data.push([t(u.name), t('Destination'), n(i), t(u.dest_hw?.[i] ?? `Destination ${i}`), t(u.dest_names?.[i] ?? '')]);
  for (let i = 1; i <= u.outputs; i++) data.push([t(u.name), t('Output'), n(i), t(u.out_hw?.[i] ?? `Output ${i}`), t(u.out_names?.[i] ?? '')]);
  const file = writeExcelFile([
    { sheet: 'Names', data, columns: [{ width: 24 }, { width: 14 }, { width: 10 }, { width: 30 }, { width: 36 }] },
    { sheet: 'How to use', data: [
      [t('One row per destination (hardware input) and per output. Do not change the Hardware, Type or Number columns.')],
      [t('Type the name people use in the Friendly name column (for example Camera 1). Leave it empty to clear a name.')],
      [t('The Hardware name column is the unit\'s own name for that destination or output. If your hardware export gives them, paste them in; they are saved too.')],
      [t('Save as .xlsx (or .csv) and use Import names on the unit\'s page. The Hardware column must match the unit\'s name.')]], columns: [{ width: 120 }] },
  ]);
  const buf = await file.toBuffer(); const safe = String(u.name).replace(/[^\w.-]+/g, '-').slice(0, 40) || 'hardware';
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="teleplanner-${safe}-names.xlsx"`, 'Cache-Control': 'no-store' } });
}
