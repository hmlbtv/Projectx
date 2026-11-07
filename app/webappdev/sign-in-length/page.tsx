import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { sessionLimits } from '@/lib/session';
import { saveSessionSettings } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const lim = await sessionLimits();
  return (<><div className="crumbs"><Link href="/webappdev" className="btn sec small">← Site admin</Link></div>
    <h1>Site admin · Sign-in length</h1><p className="mut">How long people stay signed in.</p>

      <form action={saveSessionSettings} className="stack"><label className="mut">Sign out after this many hours with no activity (0 = never)<input name="idle" type="number" min="0" max="720" defaultValue={lim.idleHours} /></label>
        <label className="mut">Always sign out after this many days (1 to 90)<input name="days" type="number" min="1" max="90" defaultValue={lim.maxDays} /></label>
        <button className="sec">Save</button>
        <p className="mut">Applies to everyone. Idle time resets whenever a page is used. A new maximum applies to people who sign in after you save; the idle limit applies straight away.</p></form>
  </>);
}
