import { NextResponse } from 'next/server';
import writeExcelFile from 'write-excel-file/node';
import { getMe, canManage } from '@/lib/session';
import { rows } from '@/lib/db';
export const dynamic = 'force-dynamic';

// A blank Excel sheet in the layout the Source Set importer expects.
export async function GET(req: Request) {
  const me = await getMe(); if (!me || !me.tenant_id || !canManage(me)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const h = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#e6edf3' });
  const t = (v: string) => ({ value: v, type: String });
  // One Source Set: its own sheet (Category, Source), with the sources it already has filled in.
  const setId = Number(new URL(req.url).searchParams.get('set'));
  if (setId) {
    const st = (await rows<any>('select name, sources, categories from source_sets where id=$1 and tenant_id=$2', [setId, me.tenant_id]))[0]; if (!st) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const list: string[] = Array.isArray(st.sources) ? st.sources : [];
    const one = writeExcelFile([
      { sheet: 'Sources', data: [[h('Category'), h('Source')], ...(list.length ? list.map(n => [t(st.categories?.[n] ?? ''), t(n)]) : [[t('Cameras'), t('Camera 1')]])], columns: [{ width: 24 }, { width: 36 }] },
      { sheet: 'How to use', data: [
        [t(`This sheet is for the Source Set “${st.name}” only. One source per row: Category (for example Cameras or EVS, or leave empty) then the source name. Keep the header row.`)],
        [t('Importing adds to this set: sources it does not have yet are appended, and a Category you give is applied. Nothing is removed.')],
        [t('Up to 500 sources per set. Save as .xlsx (or .csv) and use Import from Excel on this Source Set\'s card.')]], columns: [{ width: 120 }] },
    ]);
    const b = await one.toBuffer(); const safe = String(st.name).replace(/[^\w.-]+/g, '-').slice(0, 40) || 'source-set';
    return new NextResponse(new Uint8Array(b), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="teleplanner-${safe}-sources.xlsx"`, 'Cache-Control': 'no-store' } });
  }
  const file = writeExcelFile([
    { sheet: 'Sources', data: [[h('Source Set'), h('Category'), h('Source')], [t('Studio Sources'), t('Cameras'), t('Camera 1')], [t('Studio Sources'), t('Cameras'), t('Camera 2')], [t('Studio Sources'), t('EVS'), t('EVS 1')], [t('Studio Sources'), t('EVS'), t('EVS 2')]], columns: [{ width: 30 }, { width: 24 }, { width: 36 }] },
    { sheet: 'How to use', data: [
      [t('One source per row. First column: the Source Set name. Second column: the Category (for example Cameras or EVS). Third column: the source name. Keep the header row.')],
      [t('Rows with the same Source Set name go into the same set. Sources are shown grouped by Category when assigning them to a tile; leave Category empty for none. Replace the example rows with your own.')],
      [t('A Source Set that already exists is added to: sources it does not have yet are appended, nothing is removed.')],
      [t('The word Blank (which clears a name) is only used on the hardware names sheet; here an empty cell just means no value.')],
      [t('Up to 5000 rows, 200 Source Sets and 500 sources per set. Save as .xlsx (or .csv) and use Import in Source Sets.')]], columns: [{ width: 120 }] },
  ]);
  const buf = await file.toBuffer();
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="teleplanner-source-sets-template.xlsx"', 'Cache-Control': 'no-store' } });
}
