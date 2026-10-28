import { rows, one } from './db';
import { getMe } from './session';

// Audit trail: who changed what, and when, per workspace (tenant). Written after a change succeeds; never stores passwords, tokens or file contents.
const LABEL: Record<string, string> = {
  inviteUser: 'Invited a person', inviteTeam: 'Invited a person', resendInvite: 'Re-sent an invite', removeMember: 'Removed a team member', setUserRole: 'Changed a role', setUserSuspended: 'Suspended / restored a person', setUserMaxJobs: 'Changed a Job limit for a person', removeJobUser: 'Removed a person from a Job', saveSessionSettings: 'Changed sign-in length settings',
  changePassword: 'Changed own password', reset2fa: 'Reset someone’s two-step sign-in', disable2fa: 'Turned off two-step sign-in',
  addSite: 'Added a Site', addLocation: 'Added a Location', addRoom: 'Added a Room', renameNode: 'Renamed a Site, Location or Room', deleteNode: 'Deleted a Site, Location or Room',
  addRoomWall: 'Added a Wall Template to a Room', renameRoomWall: 'Renamed a wall in a Room', removeRoomWall: 'Removed a Wall Template from a Room', setWallRooms: 'Applied a Wall Template to Rooms', wallToRoom: 'Added a Wall Template to a Room', wallFromRoom: 'Removed a Wall Template from a Room',
  saveWall: 'Saved a Wall Template', deleteWall: 'Deleted a Wall Template',
  saveTile: 'Saved an MV Tile', copyTile: 'Copied an MV Tile', renameTile: 'Renamed an MV Tile', setTileStandard: 'Changed an MV Tile Standard setting', deleteTile: 'Deleted an MV Tile',
  saveLayout: 'Created an MV Layout', saveLayoutTiles: 'Saved an MV Layout', copyLayout: 'Copied an MV Layout', setLayoutStandard: 'Changed an MV Layout Standard setting', deleteLayout: 'Deleted an MV Layout',
  addBroadcaster: 'Added a Broadcaster', addProduction: 'Added a Production', addDestSet: 'Added a Destination Set', updateDestSet: 'Edited a Destination Set', deleteDestSet: 'Deleted a Destination Set', addSourceSet: 'Added a Source Set', updateSourceSet: 'Edited a Source Set', deleteSourceSet: 'Deleted a Source Set',
  addJob: 'Added a Job', updateBroadcaster: 'Edited a Broadcaster', updateProduction: 'Edited a Production', updateJob: 'Edited a Job', deleteProduction: 'Deleted a Production', deleteBroadcaster: 'Deleted a Broadcaster', deleteJob: 'Deleted a Job',
  assignWall: 'Assigned a wall to a Job', unassignWall: 'Removed a wall from a Job', savePlan: 'Saved a Monitor Plan', copyPlan: 'Copied a Monitor Plan from another Job', addComment: 'Added a comment',
  addContact: 'Added a Contact', deleteContact: 'Deleted a Contact', assignContact: 'Assigned a Contact', unassignContact: 'Unassigned a Contact', updateContact: 'Edited a Contact',
  createWallLink: 'Shared a wall with a guest', revokeWallLink: 'Revoked a guest link', reassignWallLink: 'Changed a guest link',
  imageUpload: 'Uploaded an image', imageRename: 'Renamed an image', imageDelete: 'Deleted an image', loadDemoData: 'Loaded sample data',
};
export const actionLabel = (a: string) => LABEL[a] ?? a;
export const AUDITED = Object.keys(LABEL).filter(k => !k.startsWith('image'));

// What each delete looks up first, so the name is still known afterwards.
const NAME_OF: Record<string, [string, string]> = { deleteWall: ['wall_templates', 'name'], deleteLayout: ['mv_layouts', 'name'], deleteTile: ['mv_tiles', 'name'], deleteJob: ['jobs', 'name'], deleteProduction: ['productions', 'name'], deleteBroadcaster: ['broadcasters', 'name'],
  removeMember: ['users', 'email'], deleteSourceSet: ['source_sets', 'name'], deleteDestSet: ['destination_sets', 'name'], removeRoomWall: ['room_walls', 'name'], deleteContact: ['contacts', 'name'], renameTile: ['mv_tiles', 'name'] };
const SHOW = ['name', 'email', 'role', 'plan', 'table', 'date', 'final', 'expires', 'suspend', 'max'];

async function detail(name: string, args: any[], pre: string | null): Promise<string> {
  const parts: string[] = []; const f = args.find(a => a instanceof FormData) as FormData | undefined;
  if (name === 'saveWall' || name === 'saveTile') { if (typeof args[1] === 'string') parts.push(`“${args[1].slice(0, 80)}”`); if (Array.isArray(args[2])) parts.push(`${args[2].length} items`); }
  else if (name === 'saveLayoutTiles' || name === 'saveLayout') { const nm = typeof args[1] === 'string' ? args[1] : f?.get('name'); if (nm) parts.push(`“${String(nm).slice(0, 80)}”`); }
  if (pre) parts.push(`“${pre.slice(0, 80)}”`);
  if (f && ['setWallRooms', 'wallToRoom', 'wallFromRoom', 'addRoomWall'].includes(name)) {
    const w = await one('select name from wall_templates where id=$1', [Number(f.get('wall'))]); if (w) parts.push(`wall “${w.name}”`);
    const ids = f.getAll('room').map(Number).filter(Boolean); if (name === 'setWallRooms') parts.push(`${ids.length} Room${ids.length === 1 ? '' : 's'}`);
    else if (ids[0]) { const r = await one('select name from rooms where id=$1', [ids[0]]); if (r) parts.push(`Room “${r.name}”`); } }
  if (f) for (const k of SHOW) { const v = f.get(k); if (typeof v === 'string' && v.trim()) parts.push(`${k}: ${v.slice(0, 80)}`); }
  return parts.join(' · ');
}

async function verified(name: string, args: any[]): Promise<boolean> {
  const f = args.find(a => a instanceof FormData) as FormData | undefined; if (!f) return true; const id = Number(f.get('id'));
  if (name === 'removeMember') return !(await one('select 1 from users where id=$1', [id]));
  if (name === 'setUserRole') return (await one('select role from users where id=$1', [id]))?.role === f.get('role');
  if (name === 'setUserSuspended') return !!(await one('select suspended from users where id=$1', [id]))?.suspended === (f.get('suspend') === '1');
  return true;
}

export async function record(tenant: number | null, userId: number | null, who: string, action: string, detailText: string) {
  try { await rows('insert into audit_log(tenant_id,user_id,who,action,detail) values($1,$2,$3,$4,$5)', [tenant, userId, who.slice(0, 120), action, detailText.slice(0, 400)]); } catch { /* the trail must never break the change itself */ }
}

// Wraps a server action: runs it, and if it worked records who did it.
export async function audited<A extends any[], R>(name: string, fn: (...a: A) => Promise<R>, args: A): Promise<R> {
  let pre: string | null = null;
  try { const f = args.find(a => a instanceof FormData) as FormData | undefined; const ref = NAME_OF[name];
    if (ref) { const id = Number(f?.get('id') ?? args[0]); if (id) pre = (await one(`select ${ref[1]} v from ${ref[0]} where id=$1`, [id]))?.v ?? null; }
    if (name === 'deleteNode' && f) { const t = String(f.get('table')); if (['sites', 'locations', 'rooms'].includes(t)) pre = (await one(`select name v from ${t} where id=$1`, [Number(f.get('id'))]))?.v ?? null; }
  } catch { /* lookup only */ }
  let failed: any = null, res: any;
  try { res = await fn(...args); return res; } catch (e) { failed = e; throw e; }
  finally {
    const redirected = failed && String((failed as any).digest ?? '').startsWith('NEXT_REDIRECT');
    const bad = (!failed && res && typeof res === 'object' && 'error' in res && (res as any).error);
    if ((!failed || redirected) && !bad) { try { const me = await getMe(); if (me && me.tenant_id && await verified(name, args)) await record(me.tenant_id, me.id, me.name || me.email, name, await detail(name, args, pre)); } catch { /* ignore */ } }
  }
}
