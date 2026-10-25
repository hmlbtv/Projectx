import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';
import { emailOn, mailFrom, baseUrl } from '@/lib/mail';
import TestEmail from './TestEmail';
export const dynamic = 'force-dynamic';

export default async function Settings() {
  const me = await requireMe(); if (me.role !== 'webappdev' && me.role !== 'master_admin') redirect('/');
  const rows: [string, string, boolean][] = [
    ['Email key (RESEND_API_KEY)', emailOn() ? 'Set' : 'Not set - no emails can be sent', emailOn()],
    ['Sender (MAIL_FROM)', process.env.MAIL_FROM ? mailFrom() : `${mailFrom()} (default test sender)`, !!process.env.MAIL_FROM],
    ['Site address in emails (APP_URL)', process.env.APP_URL ? await baseUrl() : `${await baseUrl()} (not set, using fallback)`, !!process.env.APP_URL],
  ];
  return (<><h1>Settings</h1>
    <div className="card"><h2 style={{ marginTop: 0 }}>Email</h2>
      <p className="mut">Verification, password reset and invitation emails are sent through Resend. Values are read from this deployment's environment variables; the key itself is never shown.</p>
      <div className="stats" style={{ gridTemplateColumns: '1fr' }}>{rows.map(([k, v, ok]) => (<div key={k} className="stat"><b>{v}</b><span>{k} {ok ? '✓' : '⚠'}</span></div>))}</div>
      <TestEmail defaultTo={me.email} /></div></>);
}
