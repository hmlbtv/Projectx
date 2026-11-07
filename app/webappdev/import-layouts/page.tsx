import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { importFromManufacturer } from '@/lib/actions';
import { MANUFACTURERS } from '@/lib/manufacturers';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const { imported, of, mfr, mfrerr } = sp;
  return (<><div className="crumbs"><Link href="/webappdev" className="btn sec small">← Site admin</Link></div>
    <h1>Site admin · Import from manufacturer</h1><p className="mut">Add multiviewer layouts from a manufacturer to the MV Layouts page.</p>

      {mfrerr && <p role="alert" style={{ color: 'var(--bad)' }}>{mfrerr}</p>}
      {imported !== undefined && <p role="status"><b>{imported}</b> new Standard MV Layout{imported === '1' ? '' : 's'} added{mfr ? ` from ${MANUFACTURERS.find(x => x.id === mfr)?.name ?? mfr}` : ''}{of ? ` (${of} found${Number(imported) < Number(of) ? ', the rest were already there' : ''})` : ''}.</p>}
      <form action={importFromManufacturer} className="stack"><label className="mut">Manufacturer<select name="manufacturer" defaultValue={mfr ?? MANUFACTURERS[0].id}>{MANUFACTURERS.map(m => <option key={m.id} value={m.id}>{m.name}{m.file ? ' (upload a file)' : ''}</option>)}</select></label>
        {MANUFACTURERS.map(m => <p key={m.id} className="mut" style={{ margin: 0 }}><b>{m.name}:</b> {m.about}{m.file ? ` Upload: ${m.file.hint}.` : ''}</p>)}
        {MANUFACTURERS.some(m => m.file) && <label className="mut">Layout or config file (only for manufacturers marked &quot;upload a file&quot;)<input type="file" name="file" accept={MANUFACTURERS.filter(m => m.file).map(m => m.file!.accept).join(',')} /></label>}
        <p className="mut" style={{ margin: 0 }}>Imported layouts become Standard MV Layouts that every workspace can use. Safe to press again: layouts already added are skipped. More manufacturers will be added here as they are built and tested.</p>
        <button className="sec">Import layouts</button></form>
  </>);
}
