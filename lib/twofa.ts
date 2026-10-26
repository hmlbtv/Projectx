'use server';
import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import { one, rows } from './db';
import { requireMe, isAdmin } from './session';
import { allow } from './security';
import { verifyPassword, sha256 } from './password';
import { newSecret, otpUri, seal, unseal, checkCode, newRecoveryCodes } from './totp';

export type TfState = { error?: string; secret?: string; qr?: string; codes?: string[]; ok?: string } | undefined;

// Step 1: make a secret and show it as a QR code. Nothing is switched on until a code from the app is entered.
export async function begin2fa(): Promise<TfState> {
  const me = await requireMe(); const secret = newSecret();
  await rows('update users set totp_pending=$1 where id=$2', [seal(secret), me.id]);
  return { secret, qr: await QRCode.toDataURL(otpUri(secret, me.email), { margin: 1, width: 220 }) };
}
// Step 2: the person types the code their app shows; if it matches, 2FA is on and they get recovery codes (shown once).
export async function confirm2fa(_: TfState, f: FormData): Promise<TfState> {
  const me = await requireMe(); if (!(await allow('2fa-setup', String(me.id), 10, 10))) return { error: 'Too many tries. Wait a few minutes.' };
  const u = await one('select totp_pending from users where id=$1', [me.id]); const secret = u?.totp_pending ? unseal(u.totp_pending) : null;
  if (!secret) return { error: 'Start again: press "Set up 2FA".' };
  const step = checkCode(secret, String(f.get('code') ?? ''));
  if (!step) return { error: 'That code is not right. Check the time on your phone and try the next code.', secret, qr: await QRCode.toDataURL(otpUri(secret, me.email), { margin: 1, width: 220 }) };
  const codes = newRecoveryCodes();
  await rows('update users set totp_secret=$1, totp_enabled=true, totp_pending=null, totp_last=$2, totp_recovery=$3 where id=$4', [seal(secret), step, JSON.stringify(codes.map(c => sha256(c.toLowerCase()))), me.id]);
  revalidatePath('/account'); return { ok: 'Two-step sign-in is on.', codes };
}
export async function disable2fa(_: TfState, f: FormData): Promise<TfState> {
  const me = await requireMe(); if (!(await allow('2fa-off', String(me.id), 10, 10))) return { error: 'Too many tries. Wait a few minutes.' };
  const u = await one('select password_hash,totp_secret,totp_last,totp_recovery from users where id=$1', [me.id]);
  if (!(await verifyPassword(String(f.get('password') ?? ''), u?.password_hash))) return { error: 'Password is incorrect.' };
  const code = String(f.get('code') ?? ''), secret = u?.totp_secret ? unseal(u.totp_secret) : null;
  const okCode = secret && checkCode(secret, code, Number(u.totp_last)), okRec = (u?.totp_recovery as string[] ?? []).includes(sha256(code.toLowerCase().replace(/\s/g, '')));
  if (!okCode && !okRec) return { error: 'That code is not right.' };
  await rows("update users set totp_enabled=false, totp_secret=null, totp_pending=null, totp_recovery='[]' where id=$1", [me.id]);
  revalidatePath('/account'); return { ok: 'Two-step sign-in is off.' };
}
// An Admin (or the site admin) can switch it off for a team member who lost their phone and codes.
export async function reset2fa(f: FormData) {
  const me = await requireMe(); if (!isAdmin(me)) throw new Error('Admin only');
  const id = Number(f.get('id')); const t = await one('select role,tenant_id from users where id=$1', [id]);
  if (!t || t.role === 'webappdev' || id === me.id || (t.tenant_id !== me.tenant_id && me.role !== 'webappdev')) return;
  if ((t.role === 'admin' || t.role === 'master_admin') && me.role === 'admin') return;
  await rows("update users set totp_enabled=false, totp_secret=null, totp_pending=null, totp_recovery='[]' where id=$1", [id]);
  await rows('delete from sessions where user_id=$1', [id]); revalidatePath('/team');
}
