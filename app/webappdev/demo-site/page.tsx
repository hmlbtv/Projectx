import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { demoInfo, DEMO_NAME } from '@/lib/demoSite';
import { publishDemoSite } from '@/lib/demoActions';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const demo = await demoInfo(); const demoMsg = sp.demo, demoerr = sp.demoerr;
  return (<><div className="crumbs"><Link href="/webappdev" className="btn sec small">← Site admin</Link></div>
    <h1>Site admin · Demo Site</h1><p className="mut">The example every Demo workspace starts with.</p>

      {demoMsg && <p role="status" style={{ color: demoerr ? 'var(--bad)' : undefined }}>{demoMsg}</p>}
      <p className="mut">Build it in your own workspace: add a Broadcaster called <b>{DEMO_NAME}</b> with Productions, Jobs, Wall Templates, walls, a Source Set and Monitor Plans, exactly as a customer would. Then press Publish. Every Demo workspace gets its own copy the first time someone signs in (anyone already signed up gets it at their next sign-in), can change it freely, and can reset it to what you published. Publishing again does not change copies people already have until they reset. The example does not count against plan limits.</p>
      {demo && <p className="mut">Published: {demo.prods} Production{demo.prods === 1 ? '' : 's'}, {demo.jobs} Job{demo.jobs === 1 ? '' : 's'}, {demo.walls} wall{demo.walls === 1 ? '' : 's'}.</p>}
      <form action={publishDemoSite}><button>{demo ? 'Publish the current version' : 'Publish the Demo Site'}</button> <Link href="/productions" className="btn sec small">Open my Productions</Link></form>
  </>);
}
