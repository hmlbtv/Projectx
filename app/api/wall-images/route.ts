import { NextResponse } from 'next/server';
import { getMe, isAdmin } from '@/lib/session';
import { rows, one } from '@/lib/db';
import { sameOrigin, usage } from '@/lib/wallImages';
import { record } from '@/lib/audit';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 3 * 1024 * 1024, MAX_IMAGES = 100;
export async function GET() {
  const me = await getMe(); if (!me || !me.tenant_id || !isAdmin(me)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const imgs = await rows('select id,name,w,h,alpha from wall_images where tenant_id=$1 order by created_at desc, id desc', [me.tenant_id]);
  const use = await usage(me.tenant_id);
  return NextResponse.json({ images: imgs.map((i: any) => ({ ...i, usedIn: use.filter((u: any) => u.image === i.id).map((u: any) => ({ id: u.wall, name: u.name })) })) });
}

// Upload: the browser has already scaled the picture down; PNG, JPEG or SVG only.
export async function POST(req: Request) {
  const me = await getMe(); if (!me || !me.tenant_id || !isAdmin(me) || !sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  // Refuse oversized bodies before reading them (picture is capped at 3 MB; a little extra for the form fields).
  const len = Number(req.headers.get('content-length')); if (!len || len > MAX_BYTES + 65536) return NextResponse.json({ error: 'That image is too big (3 MB maximum after scaling).' }, { status: 413 });
  const f = await req.formData(); const file = f.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That image is too big (3 MB maximum after scaling).' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer()); const mime = file.type;
  const ok = (mime === 'image/png' && buf.subarray(1, 4).toString() === 'PNG') || (mime === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8) || (mime === 'image/svg+xml' && /<svg[\s>]/i.test(buf.subarray(0, 4096).toString('utf8')));
  if (!ok) return NextResponse.json({ error: 'Only PNG, JPEG or SVG pictures can be added.' }, { status: 400 });
  if (((await one('select count(*)::int c from wall_images where tenant_id=$1', [me.tenant_id]))!).c >= MAX_IMAGES) return NextResponse.json({ error: `You can keep up to ${MAX_IMAGES} images. Delete some first.` }, { status: 400 });
  const w = Math.min(Math.max(Math.round(+(f.get('w') as string)) || 1, 1), 20000), h = Math.min(Math.max(Math.round(+(f.get('h') as string)) || 1, 1), 20000);
  const name = String(f.get('name') ?? 'Image').trim().slice(0, 60) || 'Image';
  const r = (await one('insert into wall_images(tenant_id,name,mime,w,h,data,alpha) values($1,$2,$3,$4,$5,$6,$7) returning id', [me.tenant_id, name, mime, w, h, buf, mime !== 'image/jpeg' && f.get('alpha') === '1']))!;
  await record(me.tenant_id, me.id, me.name || me.email, 'imageUpload', `“${name}”`);
  return NextResponse.json({ id: r.id, name, w, h, alpha: mime !== 'image/jpeg' && f.get('alpha') === '1' });
}
