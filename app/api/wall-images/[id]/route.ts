import { NextResponse } from 'next/server';
import { getMe, canManage } from '@/lib/session';
import { rows, one } from '@/lib/db';
import { sameOrigin, usage } from '@/lib/wallImages';
import { record } from '@/lib/audit';
export const dynamic = 'force-dynamic';

// Pictures are served only to signed-in members of the owning workspace, never as a page: sandboxed, no sniffing.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe(); const { id } = await params;
  if (!me || !me.tenant_id) return new NextResponse('Not found', { status: 404 });
  const r = await one('select mime,data from wall_images where id=$1 and tenant_id=$2', [Number(id) || 0, me.tenant_id]);
  if (!r) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(r.data), { headers: { 'Content-Type': r.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe(); const { id } = await params;
  if (!me || !me.tenant_id || !canManage(me) || !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const name = String((await req.json().catch(() => ({}))).name ?? '').trim().slice(0, 60); if (!name) return NextResponse.json({ error: 'Give it a name.' }, { status: 400 });
  const old = await one('select name from wall_images where id=$1 and tenant_id=$2', [Number(id) || 0, me.tenant_id]);
  await rows('update wall_images set name=$1 where id=$2 and tenant_id=$3', [name, Number(id) || 0, me.tenant_id]);
  if (old) await record(me.tenant_id, me.id, me.name || me.email, 'imageRename', `“${old.name}” → “${name}”`);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe(); const { id } = await params;
  if (!me || !me.tenant_id || !canManage(me) || !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const n = Number(id) || 0, used = (await usage(me.tenant_id)).filter((u: any) => u.image === n);
  const old = await one('select name from wall_images where id=$1 and tenant_id=$2', [n, me.tenant_id]);
  await rows('delete from wall_images where id=$1 and tenant_id=$2', [n, me.tenant_id]);
  if (old) await record(me.tenant_id, me.id, me.name || me.email, 'imageDelete', `“${old.name}”${used.length ? ` (was on ${used.length} Wall Template${used.length === 1 ? '' : 's'})` : ''}`);
  return NextResponse.json({ ok: true, wasUsedIn: used.length });
}
