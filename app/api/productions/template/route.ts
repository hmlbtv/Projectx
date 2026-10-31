import { NextResponse } from 'next/server';
import writeExcelFile from 'write-excel-file/node';
import dataValidation from '@onparallel/write-excel-file-data-validation';
import { getMe, canManage } from '@/lib/session';
import { rows } from '@/lib/db';
export const dynamic = 'force-dynamic';

const colL = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
// One workbook tab per Broadcaster. Each tab has a Production drop-down and a row per Job (name, dates, Source Set).
export async function GET() {
  const me = await getMe(); if (!me || !me.tenant_id || !canManage(me)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const t = me.tenant_id;
  const bs = await rows<{ id: number; name: string }>('select id, name from broadcasters where tenant_id=$1 order by name', [t]);
  const ps = await rows<{ broadcaster_id: number; name: string }>('select p.broadcaster_id, p.name from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by p.name', [t]);
  const sets = await rows<{ name: string }>('select name from source_sets where tenant_id=$1 order by name', [t]);
  const list = bs.length ? bs : [{ id: 0, name: 'Example Broadcaster' }];
  const used = new Set<string>(['Lists', 'How to use']), tabName = (n: string) => { let b = n.replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 28) || 'Broadcaster', x = b, i = 2; while (used.has(x.toLowerCase())) x = `${b.slice(0, 26)} ${i++}`; used.add(x.toLowerCase()); return x; };
  const h = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#e6edf3' }), tx = (v: string) => ({ value: v, type: String });
  const prodsOf = (id: number) => { const l = ps.filter(p => p.broadcaster_id === id).map(p => p.name); return id === 0 ? ['Example Production'] : l; };
  const maxRows = 300, listLen = Math.max(...list.map(b => prodsOf(b.id).length), sets.length, 1);
  const tabs = list.map(b => ({ b, tab: tabName(b.name) }));
  const sheets: any[] = tabs.map(({ b, tab }, bi) => ({ sheet: tab,
    data: [[h('Production'), h('Job name'), h('Job date'), h('Final date'), h('Expires (optional)'), h('Source Set (optional)')],
      ...(bs.length ? [] : [[tx('Example Production'), tx('Example Job'), tx('2026-11-02'), tx('2026-11-04'), tx(''), tx('')]])],
    columns: [{ width: 30 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 28 }],
    dataValidation: [
      { cellRange: { from: { row: 2, column: 1 }, to: { row: maxRows, column: 1 } }, validation: { type: 'list', valuesRange: `Lists!$${colL(bi)}$2:$${colL(bi)}$${prodsOf(b.id).length + 1}`, errorStyle: 'warning', error: 'Not an existing Production. Press Yes to add it as a new Production, or pick one from the list.' } },
      { cellRange: { from: { row: 2, column: 6 }, to: { row: maxRows, column: 6 } }, validation: { type: 'list', valuesRange: `Lists!$${colL(list.length)}$2:$${colL(list.length)}$${Math.max(sets.length, 1) + 1}`, errorStyle: 'warning', error: 'Not an existing Source Set.' } }] }));
  const lists = { sheet: 'Lists', data: Array.from({ length: listLen + 1 }, (_, r) => [...tabs.map(({ b, tab }) => (r === 0 ? h(`${tab} Productions`) : tx(prodsOf(b.id)[r - 1] ?? ''))), r === 0 ? h('Source Sets') : tx(sets[r - 1]?.name ?? '')]), columns: [...tabs.map(() => ({ width: 30 })), { width: 30 }] };
  const how = { sheet: 'How to use', data: [
    [tx('Each Broadcaster has its own tab. Fill in one row per Job. Keep the header row.')],
    [tx('Production: pick from the drop-down, or type a new name and it is created for you.')],
    [tx('Job name is required. Dates are YYYY-MM-DD (or DD/MM/YYYY). If Final date is empty the Job date is used. If Expires is empty it is 5 days after the Final date.')],
    [tx('A Job that already exists (same Production, name and Job date) is skipped. Nothing is ever deleted.')],
    [tx('To add a new Broadcaster, add a tab and name it after the Broadcaster. The Lists tab feeds the drop-downs: leave it in the file.')],
    [tx('Save as .xlsx and use Import in Productions.')]], columns: [{ width: 130 }] };
  const buf = await writeExcelFile([...sheets, lists, how] as any, { features: [dataValidation] } as any).toBuffer();
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="teleplanner-productions-template.xlsx"', 'Cache-Control': 'no-store' } });
}
