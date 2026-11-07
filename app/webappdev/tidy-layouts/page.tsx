import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { tidyStandardLayouts } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const { tidied } = sp;
  return (<><div className="crumbs"><Link href="/webappdev" className="btn sec small">← Site admin</Link></div>
    <h1>Site admin · Tidy Standard MV Layouts</h1><p className="mut">Neat 16:9 versions of the Standard MV Layouts.</p>

      {tidied !== undefined && <p><b>{tidied}</b> layout{tidied === '1' ? '' : 's'} updated.</p>}
      <form action={tidyStandardLayouts} className="stack"><p className="mut">Replaces the shapes of the Standard MV Layouts (the built-in grids, 1 + 5 and the Kaleido ones) so every window is exactly 16:9, small windows around a big one are the same size, edges line up and the layout is centred. Tiles already on a window stay with it. Six layouts with unusual shapes (9-WAY-PGM-PRV, the 9-WAY-SMALL ones and PROD STCK MIMIC) are left as they are. Tenants' own layouts are not touched.</p><button className="sec">Tidy Standard MV Layouts</button></form>
  </>);
}
