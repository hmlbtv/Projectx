import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireMe } from '@/lib/session';
import { rows } from '@/lib/db';
import { emailOn, mailFrom, baseUrl } from '@/lib/mail';
import TestEmail from '../TestEmail';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const mails = await rows(`select l.at, l.subject, l.ok, l.error,
    case when exists(select 1 from users u where lower(u.email)=lower(l.to_email)) then l.to_email
      else left(l.to_email,1)||'***'||substring(l.to_email from '@.*$') end as who from email_log l order by l.at desc limit 50`);
  const mailCount = (await rows(`select count(*) filter (where ok)::int sent, count(*) filter (where not ok)::int failed from email_log where at > now() - interval '24 hours'`))[0];
  const ago = (d: any) => { if (!d) return 'never'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };
  const mailRows: [string, string, boolean][] = [
    ['Email key (RESEND_API_KEY)', emailOn() ? 'Set' : 'Not set - no emails can be sent', emailOn()],
    ['Sender (MAIL_FROM)', process.env.MAIL_FROM ? mailFrom() : `${mailFrom()} (default test sender)`, !!process.env.MAIL_FROM],
    ['Site address in emails (APP_URL)', process.env.APP_URL ? await baseUrl() : `${await baseUrl()} (not set, using fallback)`, !!process.env.APP_URL],
  ];
  return (<><div className="crumbs"><Link href="/mail" className="btn sec small">← Email</Link></div>
    <h1>Email · Log</h1><p className="mut">Sending, test email and the email log.</p>
    <details className="card"><summary><b>Test email</b> <span className="mut">· {emailOn() ? 'sending is set up' : 'sending is not set up'}</span></summary>
    <p className="mut">Verification, password reset and invitation emails are sent through Resend. Values come from this deployment's environment variables; the key itself is never shown.</p>
      <div className="stats" style={{ gridTemplateColumns: '1fr' }}>{mailRows.map(([k, v, ok]) => (<div key={k} className="stat"><b>{v}</b><span>{k} {ok ? '✓' : '⚠'}</span></div>))}</div>
      <TestEmail defaultTo={me.email} />
    </details>
    <details className="card"><summary><b>Email log</b> <span className="mut">· last 24 hours: {mailCount.sent} sent, {mailCount.failed} failed</span></summary>
      <div style={{ margin: '0 0 8px' }}><a className="btn sec small" href="/webappdev/export?kind=email">Export CSV</a></div>
      <p className="mut" style={{ margin: '0 0 8px' }}>Last 24 hours: {mailCount.sent} sent, {mailCount.failed} failed. Newest 50 attempts, kept 30 days. Addresses of people without an account (such as client contacts) are partly hidden, and email content is never stored.</p>
      {mails.length === 0 ? <p className="mut">Nothing sent yet.</p> : (<div className="tablewrap"><table className="mlog"><thead><tr><th>Time</th><th>To</th><th>Email</th><th>Result</th></tr></thead><tbody>
        {mails.map((m: any, i: number) => (<tr key={i}><td title={new Date(m.at).toISOString()}>{ago(m.at)}</td><td>{m.who}</td><td>{m.subject}</td>
          <td style={{ color: m.ok ? 'inherit' : 'var(--bad)' }}>{m.ok ? 'Sent ✓' : 'Failed: ' + (m.error ?? '')}</td></tr>))}</tbody></table></div>)}
    </details>
  </>);
}
