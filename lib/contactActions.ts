'use server';
import { audited } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { one, rows } from './db';
import { requireMe, canManage, type Me } from './session';
import type { FormState } from './actions';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim().slice(0, 200);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
async function mgr(): Promise<Me & { t: number }> { const me = await requireMe(); if (!canManage(me)) throw new Error('Admin or Manager only'); return { ...me, t: me.tenant_id ?? 0 }; }
const ownContact = (id: number, t: number) => one('select 1 from contacts where id=$1 and tenant_id=$2', [id, t]);
const ownProduction = (id: number, t: number) => one('select 1 from productions p join broadcasters b on b.id=p.broadcaster_id where p.id=$1 and b.tenant_id=$2', [id, t]);
function refresh() { revalidatePath('/contacts'); revalidatePath('/productions'); }

// Each tenant has one contact list. Guests are chosen from it when sharing a wall.
async function addContact_(_: FormState, f: FormData): Promise<FormState> {
  const me = await mgr(); const name = s(f, 'name'), email = s(f, 'email').toLowerCase(), company = s(f, 'company');
  if (!name) return { error: 'Enter a name.' };
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  if (await one('select 1 from contacts where tenant_id=$1 and email=$2', [me.t, email])) return { error: 'That email is already in your contact list.' };
  if (((await one('select count(*)::int c from contacts where tenant_id=$1', [me.t]))!).c >= 2000) return { error: 'Contact list is full.' };
  const c = (await one('insert into contacts(tenant_id,name,email,company) values($1,$2,$3,$4) returning id', [me.t, name, email, company]))!;
  const prod = Number(s(f, 'production')); // optional: assign straight away
  if (prod && (await ownProduction(prod, me.t))) await rows('insert into production_contacts(production_id,contact_id) values($1,$2) on conflict do nothing', [prod, c.id]);
  refresh(); return { ok: `${name} added.` };
}
async function deleteContact_(f: FormData) {
  const me = await mgr(); await rows('delete from contacts where id=$1 and tenant_id=$2', [Number(s(f, 'id')), me.t]); refresh();
}
async function assignContact_(f: FormData) {
  const me = await mgr(); const c = Number(s(f, 'contact')), p = Number(s(f, 'production'));
  if (!(await ownContact(c, me.t)) || !(await ownProduction(p, me.t))) throw new Error('Not found');
  await rows('insert into production_contacts(production_id,contact_id) values($1,$2) on conflict do nothing', [p, c]); refresh();
}
async function unassignContact_(f: FormData) {
  const me = await mgr(); const c = Number(s(f, 'contact')), p = Number(s(f, 'production'));
  if (!(await ownContact(c, me.t)) || !(await ownProduction(p, me.t))) throw new Error('Not found');
  await rows('delete from production_contacts where production_id=$1 and contact_id=$2', [p, c]); refresh();
}

async function updateContact_(f: FormData) {
  const me = await mgr(); const id = Number(s(f, 'id')), name = s(f, 'name'), email = s(f, 'email').toLowerCase(), company = s(f, 'company');
  if (!name || !EMAIL.test(email)) return;
  if (await one('select 1 from contacts where tenant_id=$1 and email=$2 and id<>$3', [me.t, email, id])) return;
  await rows('update contacts set name=$1,email=$2,company=$3 where id=$4 and tenant_id=$5', [name, email, company, id, me.t]); refresh();
}

// Audit trail: each of these is recorded (who, what, when) once it succeeds.
export async function addContact(...a: Parameters<typeof addContact_>) { return audited('addContact', addContact_, a) as ReturnType<typeof addContact_>; }
export async function deleteContact(...a: Parameters<typeof deleteContact_>) { return audited('deleteContact', deleteContact_, a) as ReturnType<typeof deleteContact_>; }
export async function assignContact(...a: Parameters<typeof assignContact_>) { return audited('assignContact', assignContact_, a) as ReturnType<typeof assignContact_>; }
export async function unassignContact(...a: Parameters<typeof unassignContact_>) { return audited('unassignContact', unassignContact_, a) as ReturnType<typeof unassignContact_>; }
export async function updateContact(...a: Parameters<typeof updateContact_>) { return audited('updateContact', updateContact_, a) as ReturnType<typeof updateContact_>; }
