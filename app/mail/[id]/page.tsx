import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows, one } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audienceOptions, duplicateMail, deleteDraft } from '@/lib/mailLib';
import { TEST_ADDRESS, CATEGORIES } from '@/lib/mailConst';
import Editor from './Editor';
import { renderBrandedHtml } from '@/lib/brandMail';
import { mailTemplates as T } from '@/lib/mailTemplates';
import { unsubUrl } from '@/lib/unsub';
export const dynamic = 'force-dynamic';
// The email as people saw it. Emails sent before copies were kept are rebuilt from the saved text.
const shown = (m: any) => m.sent_html || renderBrandedHtml(T.announcement(m.subject || '(no subject)', m.body, m.btn_label && m.btn_url ? { label: m.btn_label, url: m.btn_url } : undefined, m.category === 'important' ? 'important' : 'marketing', unsubUrl('recipient@example.com', m.category === 'important' ? 'important' : 'marketing')).b);
const Frame = ({ html }: { html: string }) => <iframe title="Email as sent" sandbox="" srcDoc={html} style={{ width: '100%', height: 640, border: '1px solid #8884', borderRadius: 10, background: '#f3f5f8' }} />;
export default async function MailOne({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const id = Number((await params).id) || 0;
  const m = await one('select * from mail_messages where id=$1', [id]); if (!m) redirect('/mail');
  const d = (x: any) => x ? new Date(x).toISOString().slice(0, 16).replace('T', ' ') : '';
  if (m.status === 'sent') {
    const sends = await rows('select email,ok from mail_sends where message_id=$1 order by email', [id]);
    return (<><p><Link href="/mail">← Library</Link></p><h1>{m.subject}</h1>
      <p className="mut">Sent {d(m.sent_at)} · {m.sent_count} of {sends.length} delivered{m.skipped ? ` · ${m.skipped} skipped (unsubscribed)` : ''} · {CATEGORIES[m.category]?.label ?? m.category} · {m.audience}</p>
      <Frame html={shown(m)} />{!m.sent_html && <p className="mut">Sent before copies were kept, so this is rebuilt from the saved text and may differ slightly.</p>}
      <details className="card"><summary>Recipients ({sends.length})</summary>{sends.map((s: any) => <div key={s.email}>{s.email}{s.ok ? '' : ' (failed)'}</div>)}</details>
      <form action={duplicateMail}><input type="hidden" name="id" value={id} /><button className="sec">Duplicate as a new draft</button></form></>);
  }
  const opts = m.status === 'signed_off' ? await audienceOptions() : [];
  return (<><p><Link href="/mail">← Library</Link></p><h1>{m.subject || 'New email'}</h1>
    <p className="mut">Status: <b>{m.status === 'signed_off' ? 'Signed off' : m.status === 'tested' ? 'Tested' : 'Draft'}</b>{m.tested_at ? ` · tested ${d(m.tested_at)} to ${TEST_ADDRESS}` : ''}{m.signed_off_at ? ` · signed off ${d(m.signed_off_at)}` : ''}</p>
    <Editor m={{ id: m.id, subject: m.subject, body: m.body, btn_label: m.btn_label, btn_url: m.btn_url, status: m.status, category: m.category }} opts={opts} test={TEST_ADDRESS} />
    <h2>Preview</h2><Frame html={shown(m)} />
    <form action={deleteDraft} style={{ marginTop: 16 }}><input type="hidden" name="id" value={id} /><button className="sec">Delete this draft</button></form></>);
}
