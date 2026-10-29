import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { devSite } from '@/lib/devmode';
import { replyNote, setSeverity, markDone, reopen, addBlock, deleteBlock, assignBlock, blockDone, setDevComment, deleteNote } from '@/lib/devfeedback';
export const dynamic = 'force-dynamic';

const COL = ['', '#2ea043', '#e3a008', '#e5352b'], SEVTXT = ['', 'minor', 'medium', 'serious'];
const back = (tab: string) => revalidatePath('/webappdev/markup');
export default async function Markup({ searchParams }: { searchParams: Promise<{ tab?: string; sev?: string; who?: string; dev?: string; blk?: string; pg?: string; q?: string; from?: string; to?: string; st?: string }> }) {
  if (!devSite()) notFound();
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const { tab: t0, sev, who, dev, blk, pg, q, from, to, st } = await searchParams; const tab = ['list', 'blocks', 'archive', 'people'].includes(t0 ?? '') ? t0! : 'list';
  const notes = await rows<any>(`select n.user_id,n.id,n.page,n.kind,n.device,n.subject,coalesce(jsonb_array_length(case when jsonb_typeof(n.drawing->'marks')='array' then n.drawing->'marks' end),0) marks,n.body,n.severity,n.status,n.archived,n.block_id,n.created_at,n.done_at,u.name user_name,u.email,
    (select json_agg(json_build_object('id',r.id,'body',r.body,'at',r.created_at,'by',ru.name) order by r.created_at) from dev_notes r join users ru on ru.id=r.user_id where r.parent_id=n.id) replies
    from dev_notes n join users u on u.id=n.user_id where n.parent_id is null order by n.severity desc, n.created_at desc`);
  const blocks = await rows<any>('select id,name,created_at from dev_blocks order by created_at');
  const peopleRows = tab === 'people' ? await rows<any>('select u.id,u.name,u.email,u.role,u.dev_comment,t.name tenant from users u left join tenants t on t.id=u.tenant_id order by u.dev_comment desc, u.name limit 300') : [];
  const ql = (q ?? '').trim().toLowerCase(), pgl = (pg ?? '').trim().toLowerCase(), f0 = from ? new Date(from + 'T00:00:00').getTime() : 0, t0d = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
  const pass = (n: any) => (!sev || String(n.severity) === sev) && (!who || String(n.user_id) === who) && (!dev || n.device === dev) && (!blk || (blk === 'none' ? !n.block_id : String(n.block_id) === blk))
    && (!pgl || n.page.toLowerCase().includes(pgl)) && (!ql || `${n.body} ${n.subject ?? ''}`.toLowerCase().includes(ql)) && new Date(n.created_at).getTime() >= f0 && new Date(n.created_at).getTime() <= t0d
    && (!st || (st === 'replied' ? (n.replies ?? []).length > 0 : (n.replies ?? []).length === 0));
  const open = notes.filter(n => !n.archived && pass(n)), arch = notes.filter(n => n.archived && pass(n));
  const people = [...new Map(notes.map((n: any) => [n.user_id, n.user_name])).entries()];
  const filtering = !!(sev || who || dev || blk || pg || q || from || to || st);
  const filters = (<form method="get" className="card" style={{ margin: '8px 0', display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}>
    <input type="hidden" name="tab" value={tab} />
    <label>Who commented<select name="who" defaultValue={who ?? ''}><option value="">Everyone</option>{people.map(([id, nm]) => <option key={id as number} value={String(id)}>{nm as string}</option>)}</select></label>
    <label>Severity<select name="sev" defaultValue={sev ?? ''}><option value="">Any</option><option value="3">3 serious</option><option value="2">2 medium</option><option value="1">1 minor</option></select></label>
    <label>Device<select name="dev" defaultValue={dev ?? ''}><option value="">Any</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
    <label>Block<select name="blk" defaultValue={blk ?? ''}><option value="">Any</option><option value="none">Not in a block</option>{blocks.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Replies<select name="st" defaultValue={st ?? ''}><option value="">Any</option><option value="unreplied">Not replied to</option><option value="replied">Replied to</option></select></label>
    <label>Page contains<input name="pg" defaultValue={pg ?? ''} placeholder="/walls" /></label>
    <label>Text contains<input name="q" defaultValue={q ?? ''} placeholder="note or item" /></label>
    <label>From<input type="date" name="from" defaultValue={from ?? ''} /></label><label>To<input type="date" name="to" defaultValue={to ?? ''} /></label>
    <span className="row" style={{ gap: 6 }}><button className="small">Filter</button>{filtering && <Link className="btn small sec" href={`/webappdev/markup?tab=${tab}`}>Clear</Link>}</span></form>);
  const link = (n: any) => `${n.page}${n.page.includes('?') ? '&' : '?'}devnote=${n.id}`;
  const card = (n: any, archived = false) => (<div key={n.id} className="card" style={{ borderLeft: `6px solid ${COL[n.severity]}`, margin: '10px 0' }}>
    <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <span><b style={{ color: COL[n.severity] }}>Severity {n.severity}</b> <span className="mut">({SEVTXT[n.severity]})</span> · {n.device === 'mobile' ? '📱 mobile' : '🖥 desktop'} · {n.kind}{n.marks > 0 ? ` + ${n.marks} drawing/highlight${n.marks === 1 ? '' : 's'}` : ''} · {n.user_name} <span className="mut">{n.email}</span></span>
      <span className="mut">{new Date(n.created_at).toLocaleString('en-GB')}{n.done_at ? ` · done ${new Date(n.done_at).toLocaleString('en-GB')}` : ''}</span></div>
    {n.subject && <p style={{ margin: '6px 0 0' }}><b>On: {n.subject}</b></p>}
    <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>{n.body || <span className="mut">(drawing / highlight only)</span>}</p>
    <p style={{ margin: '4px 0' }}><Link href={link(n)}>Open page: {n.page}</Link></p>
    {(n.replies ?? []).map((r: any) => <div key={r.id} className="mut" style={{ margin: '4px 0', paddingLeft: 10, borderLeft: '3px solid var(--line)' }}><b>{r.by}</b> · {new Date(r.at).toLocaleString('en-GB')}<div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{r.body}</div></div>)}
    {!archived && <form action={async (f: FormData) => { 'use server'; await replyNote(n.id, String(f.get('body') ?? '')); back(tab); }} className="row" style={{ gap: 6, margin: '6px 0' }}><input name="body" placeholder="Reply (shows under the comment on the page)" style={{ flex: 1, minWidth: 180 }} /><button className="small">Reply</button></form>}
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {!archived && [1, 2, 3].map(s => <form key={s} action={async () => { 'use server'; await setSeverity(n.id, s); back(tab); }}><button className={'small' + (n.severity === s ? '' : ' sec')} style={n.severity === s ? { background: COL[s], borderColor: COL[s] } : undefined}>{s}</button></form>)}
      <form action={async (f: FormData) => { 'use server'; await assignBlock(n.id, Number(f.get('block')) || null); back(tab); }} className="row" style={{ gap: 6 }}>
        <select name="block" defaultValue={n.block_id ?? ''} aria-label="Block"><option value="">No block</option>{blocks.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="sec small">Set block</button></form>
      {archived ? <form action={async () => { 'use server'; await reopen(n.id); back(tab); }}><button className="sec small">Reopen</button></form>
        : <form action={async () => { 'use server'; await markDone(n.id); back(tab); }}><button className="small">✓ Done (archive)</button></form>}
      <form action={async () => { 'use server'; await deleteNote(n.id); back(tab); }}><button className="del small">Delete</button></form></div></div>);
  const tabs: [string, string][] = [['list', `Comments (${notes.filter(n => !n.archived).length})`], ['blocks', `Blocks (${blocks.length})`], ['archive', `Archive (${arch.length})`], ['people', 'Who can comment']];
  return (<><h1>Dev comments</h1><p className="mut">Dev site only. Notes, drawings and highlights from people with Dev comment turned on.</p>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>{tabs.map(([k, l]) => <Link key={k} href={`/webappdev/markup?tab=${k}`} className={'btn small' + (tab === k ? '' : ' sec')}>{l}</Link>)}</div>
    {tab === 'list' && <>
      {filters}
      {filtering && <p className="mut">{open.length} match{open.length === 1 ? '' : 'es'}.</p>}
      {open.length === 0 ? <p className="mut">Nothing open.</p> : open.map(n => card(n))}</>}
    {tab === 'blocks' && <>
      <form action={async (f: FormData) => { 'use server'; await addBlock(String(f.get('name') ?? '')); back(tab); }} className="row" style={{ gap: 6 }}><input name="name" placeholder="New block name, e.g. Monitor Plan fixes" required /><button>Add block</button></form>
      {blocks.length === 0 && <p className="mut">No blocks yet. Create one, then assign comments to it from the Comments tab.</p>}
      {blocks.map((b: any) => { const inb = notes.filter(n => n.block_id === b.id), nOpen = inb.filter(n => !n.archived).length; return (<details key={b.id} open={nOpen > 0} className="card" style={{ margin: '12px 0' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '1.1rem' }}>{b.name} <span className="mut" style={{ fontSize: '.9rem', fontWeight: 400 }}>({nOpen} open, {inb.length - nOpen} done)</span></summary>
        <div className="row" style={{ gap: 6, margin: '8px 0' }}><form action={async () => { 'use server'; await blockDone(b.id); back(tab); }}><button className="small">✓ Mark whole block done</button></form><form action={async () => { 'use server'; await deleteBlock(b.id); back(tab); }}><button className="del small">Delete block</button></form></div>
        {inb.length === 0 ? <p className="mut">Empty.</p> : inb.map(n => card(n, n.archived))}</details>); })}
      {(() => { const un = notes.filter(n => !n.block_id && !n.archived); return un.length ? <details className="card" style={{ margin: '12px 0' }}><summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '1.1rem' }}>Not in a block <span className="mut" style={{ fontSize: '.9rem', fontWeight: 400 }}>({un.length})</span></summary>{un.map(n => card(n))}</details> : null; })()}</>}
    {tab === 'archive' && <>{filters}{arch.length === 0 ? <p className="mut">{filtering ? 'Nothing matches.' : 'Nothing archived yet.'}</p> : arch.map(n => card(n, true))}</>}
    {tab === 'people' && <><p className="mut">Turn on Dev comment for a person and they get the floating bar on the dev site. The site admin always has it.</p>
      <table><thead><tr><th>Name</th><th>Email</th><th>Workspace</th><th>Role</th><th>Dev comment</th></tr></thead><tbody>{peopleRows.map((u: any) => (<tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.tenant ?? ''}</td><td>{u.role}</td>
        <td>{u.role === 'webappdev' ? <span className="mut">always</span> : <form action={async () => { 'use server'; await setDevComment(u.id, !u.dev_comment); back(tab); }}><button className={'small' + (u.dev_comment ? '' : ' sec')}>{u.dev_comment ? 'On' : 'Off'}</button></form>}</td></tr>))}</tbody></table></>}
  </>);
}
