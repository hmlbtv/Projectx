import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { newMail } from '@/lib/mailLib';
export const dynamic = 'force-dynamic';
const ST: Record<string, string> = { draft: 'Draft', tested: 'Tested', signed_off: 'Signed off', sending: 'Sending', sent: 'Sent' };
type SP = { edit?: string; q?: string; status?: string; cat?: string; from?: string; to?: string };
export default async function MailLibrary({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const q = (sp.q ?? '').trim().slice(0, 200).toLowerCase().replace(/[%_\\]/g, '');
  const status = ['draft', 'tested', 'signed_off', 'sent'].includes(sp.status ?? '') ? sp.status! : '', cat = ['marketing', 'important'].includes(sp.cat ?? '') ? sp.cat! : '';
  const day = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? '') ? x! : '', from = day(sp.from), to = day(sp.to);
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  // Search looks in the subject, message, who it went to (the audience note) and the recipients' addresses.
  const list = await rows(`select id,subject,status,category,updated_at,sent_at,audience,sent_count from mail_messages m
    where ($1='' or lower(m.subject) like '%'||$1||'%' or lower(m.body) like '%'||$1||'%' or lower(m.audience) like '%'||$1||'%' or exists(select 1 from mail_sends s where s.message_id=m.id and lower(s.email) like '%'||$1||'%'))
      and ($2='' or m.status=$2) and ($3='' or m.category=$3)
      and ($4='' or coalesce(m.sent_at,m.updated_at) >= $4::date) and ($5='' or coalesce(m.sent_at,m.updated_at) < $5::date + 1)
    order by coalesce(m.sent_at,m.updated_at) desc limit 300`, [q, status, cat, from, to]);
  const filtered = !!(q || status || cat || from || to);
  const d = (x: any) => new Date(x).toISOString().slice(0, 16).replace('T', ' ');
  return (<><div className="crumbs"><Link href="/mail" className="btn sec small">← Email</Link><a className="btn sec small" href="/webappdev/export?kind=campaigns">Export CSV</a></div>
    <h1>Email · Library</h1>
    <p className="mut">Every email is kept here with who it went to.</p>
    <form action={newMail}><button>New email</button></form>
    <form method="get" className="card" style={{ display: 'grid', gap: 8 }}>
      <input name="q" defaultValue={q} placeholder="Search subject, message, audience or recipient address" style={{ width: '100%' }} />
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
        <label>Status<select name="status" defaultValue={status} style={{ width: '100%' }}><option value="">All</option><option value="draft">Draft</option><option value="tested">Tested</option><option value="signed_off">Signed off</option><option value="sent">Sent</option></select></label>
        <label>Type<select name="cat" defaultValue={cat} style={{ width: '100%' }}><option value="">All</option><option value="marketing">Marketing</option><option value="important">Important update</option></select></label>
        <label>From<input type="date" name="from" defaultValue={from} style={{ width: '100%' }} /></label>
        <label>To<input type="date" name="to" defaultValue={to} style={{ width: '100%' }} /></label></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="sec">Search</button>{filtered && <Link href="/mail/library">Clear search</Link>}<span className="mut">{list.length} {list.length === 1 ? 'email' : 'emails'}{filtered ? ' match' : ''}</span></div></form>
    {list.length === 0 && <p className="mut">{filtered ? 'No emails match.' : 'No emails yet.'}</p>}
    {list.map((m: any) => (<Link key={m.id} href={`/mail/${m.id}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      <b>{m.subject || '(no subject)'}</b> <span className="tag">{ST[m.status] ?? m.status}</span> <span className="tag">{m.category === 'important' ? 'Important update' : 'Marketing'}</span>
      <div className="mut">{m.status === 'sent' ? `Sent ${d(m.sent_at)} to ${m.sent_count} · ${m.audience}` : `Edited ${d(m.updated_at)}`}</div></Link>))}</>);
}
