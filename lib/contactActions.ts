'use server';
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
export async function addContact(_: FormState, f: FormData): Promise<FormState> {
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
export async function deleteContact(f: FormData) {
  const me = await mgr(); await rows('delete from contacts where id=$1 and tenant_id=$2', [Number(s(f, 'id')), me.t]); refresh();
}
export async function assignContact(f: FormData) {
  const me = await mgr(); const c = Number(s(f, 'contact')), p = Number(s(f, 'production'));
  if (!(await ownContact(c, me.t)) || !(await ownProduction(p, me.t))) throw new Error('Not found');
  await rows('insert into production_contacts(production_id,contact_id) values($1,$2) on conflict do nothing', [p, c]); refresh();
}
export async function unassignContact(f: FormData) {
  const me = await mgr(); const c = Number(s(f, 'contact')), p = Number(s(f, 'production'));
  if (!(await ownContact(c, me.t)) || !(await ownProduction(p, me.t))) throw new Error('Not found');
  await rows('delete from production_contacts where production_id=$1 and contact_id=$2', [p, c]); refresh();
}
