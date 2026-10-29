import { NextResponse } from 'next/server';
import writeExcelFile from 'write-excel-file/node';
import { getMe, canManage } from '@/lib/session';
export const dynamic = 'force-dynamic';

// A blank Excel sheet in the layout the importer expects.
export async function GET() {
  const me = await getMe(); if (!me || !me.tenant_id || !canManage(me)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const h = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#e6edf3' });
  const t = (v: string) => ({ value: v, type: String });
  const file = writeExcelFile([
    { sheet: 'Contacts', data: [[h('Name'), h('Email'), h('Company')]], columns: [{ width: 28 }, { width: 36 }, { width: 28 }] },
    { sheet: 'How to use', data: [
      [t('Fill in the Contacts sheet, one person per row. Keep the header row.')],
      [t('Name and Email are required. Company is optional.')],
      [t('People whose email is already in your contact list are skipped, not changed.')],
      [t('Up to 2000 rows. Save as .xlsx (or .csv) and use Import in Contacts.')]], columns: [{ width: 120 }] },
  ]);
  const buf = await file.toBuffer();
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="teleplanner-contacts-template.xlsx"', 'Cache-Control': 'no-store' } });
}
