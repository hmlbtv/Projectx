import { NextResponse } from 'next/server';
import writeExcelFile from 'write-excel-file/node';
import { getMe, canManage } from '@/lib/session';
export const dynamic = 'force-dynamic';

// A blank Excel sheet in the layout the Source Set importer expects.
export async function GET() {
  const me = await getMe(); if (!me || !me.tenant_id || !canManage(me)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const h = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#e6edf3' });
  const t = (v: string) => ({ value: v, type: String });
  const file = writeExcelFile([
    { sheet: 'Sources', data: [[h('Source Set'), h('Category'), h('Source')], [t('Studio Sources'), t('Cameras'), t('Camera 1')], [t('Studio Sources'), t('Cameras'), t('Camera 2')], [t('Studio Sources'), t('EVS'), t('EVS 1')], [t('Studio Sources'), t('EVS'), t('EVS 2')]], columns: [{ width: 30 }, { width: 24 }, { width: 36 }] },
    { sheet: 'How to use', data: [
      [t('One source per row. First column: the Source Set name. Second column: the Category (for example Cameras or EVS). Third column: the source name. Keep the header row.')],
      [t('Rows with the same Source Set name go into the same set. Sources are shown grouped by Category when assigning them to a tile; leave Category empty for none. Replace the example rows with your own.')],
      [t('A Source Set that already exists is added to: sources it does not have yet are appended, nothing is removed.')],
      [t('Up to 5000 rows, 200 Source Sets and 500 sources per set. Save as .xlsx (or .csv) and use Import in Source Sets.')]], columns: [{ width: 120 }] },
  ]);
  const buf = await file.toBuffer();
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="teleplanner-source-sets-template.xlsx"', 'Cache-Control': 'no-store' } });
}
