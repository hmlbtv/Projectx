import Link from 'next/link';
import { Logo } from '../Logo';
export const dynamic = 'force-dynamic';
export default async function Suspended({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams; const archived = r === 'archived';
  return (<div className="auth"><div className="logo"><Logo size={40} tagline /></div>
    <div className="card"><h1>{archived ? 'This account is archived' : 'Your account is suspended'}</h1>
      <p>{archived ? 'This workspace has been archived, so you cannot sign in or see its content right now.' : 'Access to this workspace has been paused, so you cannot sign in or see its content right now.'}</p>
      <p className="mut">Nothing has been lost. If you think this is a mistake, or you would like access restored, please contact your account owner or the TelePlanner team.</p>
      <Link href="/signin"><button type="button" className="sec">Back to sign in</button></Link></div></div>);
}
