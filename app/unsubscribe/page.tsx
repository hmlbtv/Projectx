import { rows } from '@/lib/db';
import { unsubValid } from '@/lib/unsub';
import { CATEGORIES } from '@/lib/mailConst';
import { setOptOut } from '@/lib/unsubActions';
import { Logo } from '../Logo';
export const dynamic = 'force-dynamic';
export default async function Unsub({ searchParams }: { searchParams: Promise<{ e?: string; c?: string; t?: string }> }) {
  const { e = '', c = '', t = '' } = await searchParams; const cat = CATEGORIES[c];
  const good = !!cat && unsubValid(e, c, t);
  const out = good ? (await rows('select 1 from mail_optout where email=$1 and category=$2', [e.toLowerCase(), c])).length > 0 : false;
  const hid = <><input type="hidden" name="e" value={e} /><input type="hidden" name="c" value={c} /><input type="hidden" name="t" value={t} /></>;
  return (<div className="auth"><div className="logo"><Logo size={36} /></div><div className="card">
    {!good ? <><h1>Link not valid</h1><p className="mut">This unsubscribe link is not valid. Please use the link in the email you received.</p></>
      : out ? <><h1>You are unsubscribed</h1><p className="mut">{e} will no longer receive {cat.noun} from TelePlanner.</p>
          <form action={setOptOut}>{hid}<input type="hidden" name="out" value="0" /><button className="sec">I changed my mind, subscribe me again</button></form></>
      : <><h1>Unsubscribe</h1><p className="mut">Stop {cat.noun} from TelePlanner to {e}?</p>
          <form action={setOptOut}>{hid}<input type="hidden" name="out" value="1" /><button>Unsubscribe</button></form></>}
  </div></div>);
}
