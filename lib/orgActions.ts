'use server';
import { redirect } from 'next/navigation';
import { setActiveOrg } from './session';
export async function switchOrg(f: FormData) { await setActiveOrg(String(f.get('org') ?? '')); redirect('/'); }
