import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows, one } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audienceOptions, duplicateMail, deleteDraft } from '@/lib/mailLib';
import { TEST_ADDRESS, CATEGORIES } from '@/lib/mailConst';
import Editor from './Editor';
export const dynamic = 'force-dynamic';
export default async function MailOne({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const id = Number((await params).id) || 0;
  const m = await one('select * from mail_messages where id=$1', [id]); if (!m) redirect('/mail');
  const d = (x: any) => x ? new Date(x).toISOString().slice(0, 16).replace('T', ' ') : '';
  if (m.status === 'sent') {
    const sends = await rows('select email,ok from mail_sends where message_id=$1 order by email', [id]);
    return (<><p><Link href="/mail">← Library</Link></p><h1>{m.subject}</h1>
      <p className="mut">Sent {d(m.sent_at)} · {m.sent_count} of {sends.length} delivered{m.skipped ? ` · ${m.skipped} skipped (unsubscribed)` : ''} · {CATEGORIES[m.category]?.label ?? m.category} · {m.audience}</p>
      <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{m.body}{m.btn_label && <p><b>[{m.btn_label}]</b> {m.btn_url}</p>}</div>
      <details className="card"><summary>Recipients ({sends.length})</summary>{sends.map((s: any) => <div key={s.email}>{s.email}{s.ok ? '' : ' (failed)'}</div>)}</details>
      <form action={duplicateMail}><input type="hidden" name="id" value={id} /><button className="sec">Duplicate as a new draft</button></form></>);
  }
  const opts = m.status === 'signed_off' ? await audienceOptions() : [];
  return (<><p><Link href="/mail">← Library</Link></p><h1>{m.subject || 'New email'}</h1>
    <p className="mut">Status: <b>{m.status === 'signed_off' ? 'Signed off' : m.status === 'tested' ? 'Tested' : 'Draft'}</b>{m.tested_at ? ` · tested ${d(m.tested_at)} to ${TEST_ADDRESS}` : ''}{m.signed_off_at ? ` · signed off ${d(m.signed_off_at)}` : ''}</p>
    <Editor m={{ id: m.id, subject: m.subject, body: m.body, btn_label: m.btn_label, btn_url: m.btn_url, status: m.status, category: m.category }} opts={opts} test={TEST_ADDRESS} />
    <form action={deleteDraft} style={{ marginTop: 16 }}><input type="hidden" name="id" value={id} /><button className="sec">Delete this draft</button></form></>);
}
