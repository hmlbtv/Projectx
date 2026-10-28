'use server';
import { rows, one } from './db';
import { getMe, type Me } from './session';
import { devSite } from './devmode';

// Dev comments: notes, drawings and highlights left on any page of the dev site. Never reachable on production (every call checks devSite()).
export type DevNote = { id: number; user_id: number; user_name: string; page: string; kind: string; body: string; severity: number; x: number | null; y: number | null; vw: number | null; drawing: any; status: string; archived: boolean; block_id: number | null; parent_id: number | null; created_at: string; mine: boolean };

async function access(): Promise<Me | null> {
  if (!devSite()) return null;
  const me = await getMe(); if (!me) return null;
  if (me.role === 'webappdev') return me;
  const r = await one<{ dev_comment: boolean }>('select dev_comment from users where id=$1', [me.id]);
  return r?.dev_comment ? me : null;
}
export async function devAccess(): Promise<{ on: boolean; owner: boolean; me?: number }> { const me = await access(); return me ? { on: true, owner: me.role === 'webappdev', me: me.id } : { on: false, owner: false }; }

const SEL = `select n.id,n.user_id,u.name user_name,n.page,n.kind,n.body,n.severity,n.x,n.y,n.vw,n.drawing,n.status,n.archived,n.block_id,n.parent_id,n.created_at from dev_notes n join users u on u.id=n.user_id`;
const clean = (page: string) => String(page ?? '/').split('#')[0].replace(/([?&])devnote=\d+&?/, '$1').replace(/[?&]$/, '').slice(0, 500);

// Notes on one page (a person sees their own and the replies to them; the site admin sees everyone's).
export async function pageNotes(page: string): Promise<DevNote[]> {
  const me = await access(); if (!me) return [];
  const pg = clean(page).split('?')[0];
  const list = await rows<DevNote>(`${SEL} where split_part(n.page,'?',1)=$1 and not n.archived ${me.role === 'webappdev' ? '' : 'and (n.user_id=$2 or n.parent_id in (select id from dev_notes where user_id=$2))'} order by n.created_at`, me.role === 'webappdev' ? [pg] : [pg, me.id]);
  return list.map(n => ({ ...n, mine: n.user_id === me.id }));
}
export async function addNote(p: { page: string; kind: 'note' | 'draw' | 'highlight'; body: string; severity: number; x?: number; y?: number; vw?: number; drawing?: any }): Promise<{ error?: string }> {
  const me = await access(); if (!me) return { error: 'Not available' };
  const body = String(p.body ?? '').trim().slice(0, 2000); if (p.kind === 'note' && !body) return { error: 'Write something first' };
  const drawing = p.drawing ? JSON.stringify(p.drawing).slice(0, 200000) : null;
  await rows('insert into dev_notes(user_id,page,kind,body,severity,x,y,vw,drawing) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [me.id, clean(p.page), ['note', 'draw', 'highlight'].includes(p.kind) ? p.kind : 'note', body, [1, 2, 3].includes(p.severity) ? p.severity : 2, Math.round(p.x ?? 0), Math.round(p.y ?? 0), Math.round(p.vw ?? 0), drawing]);
  return {};
}
export async function replyNote(parent: number, body: string): Promise<{ error?: string }> {
  const me = await access(); if (!me || me.role !== 'webappdev') return { error: 'Not available' };
  const t = String(body ?? '').trim().slice(0, 2000); if (!t) return { error: 'Write something first' };
  const n = await one<{ page: string; id: number }>('select id,page from dev_notes where id=$1 and parent_id is null', [parent]); if (!n) return { error: 'Not found' };
  await rows("insert into dev_notes(user_id,page,kind,body,parent_id) values($1,$2,'reply',$3,$4)", [me.id, n.page, t, n.id]); return {};
}
async function owner() { const me = await access(); return me && me.role === 'webappdev' ? me : null; }
export async function setSeverity(id: number, severity: number) { if (!(await owner()) || ![1, 2, 3].includes(severity)) return; await rows('update dev_notes set severity=$1 where id=$2 and parent_id is null', [severity, id]); }
export async function markDone(id: number) { if (!(await owner())) return; await rows("update dev_notes set status='done', archived=true, done_at=now() where id=$1 and parent_id is null", [id]); }
export async function reopen(id: number) { if (!(await owner())) return; await rows("update dev_notes set status='open', archived=false, done_at=null where id=$1 and parent_id is null", [id]); }
export async function addBlock(name: string) { if (!(await owner())) return; const n = String(name ?? '').trim().slice(0, 100); if (n) await rows('insert into dev_blocks(name) values($1)', [n]); }
export async function deleteBlock(id: number) { if (!(await owner())) return; await rows('delete from dev_blocks where id=$1', [id]); }
export async function assignBlock(id: number, block: number | null) { if (!(await owner())) return; await rows('update dev_notes set block_id=$1 where id=$2 and parent_id is null', [block || null, id]); }
export async function blockDone(block: number) { if (!(await owner())) return; await rows("update dev_notes set status='done', archived=true, done_at=now() where block_id=$1 and parent_id is null and status<>'done'", [block]); }
export async function setDevComment(userId: number, on: boolean) { if (!(await owner())) return; await rows('update users set dev_comment=$1 where id=$2', [!!on, userId]); }
export async function deleteNote(id: number) { if (!(await owner())) return; await rows('delete from dev_notes where id=$1', [id]); }
