'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMe, isAdmin } from './session';
import { publishDemo, installDemo } from './demoSite';
import { audited } from './audit';

// Site admin: store the current "(DEMO)Tele Planner TV" in the site admin's own workspace as the Demo Site everyone gets.
async function publishDemoSite_() {
  const me = await requireMe(); if (me.role !== 'webappdev') throw new Error('Site admin only');
  const r = await publishDemo(me.tenant_id ?? 1);
  revalidatePath('/webappdev'); redirect('/webappdev?demo=' + encodeURIComponent(r.error ?? r.ok ?? '') + (r.error ? '&demoerr=1' : '') + '#demosite');
}
// Admin of a workspace: put the Demo Site back to the published version (or add it if it was deleted). Their own work outside the Demo Site is not touched.
async function resetDemoSite_() {
  const me = await requireMe(); if (!isAdmin(me) || me.role === 'webappdev') throw new Error('Admin only');
  const r = await installDemo(me.tenant_id ?? 0);
  revalidatePath('/productions'); revalidatePath('/walls'); revalidatePath('/plans');
  redirect('/productions' + (r.error ? '?err=' + encodeURIComponent(r.error) : '?msg=' + encodeURIComponent('The Demo Site is back to the original.')));
}
export async function publishDemoSite(...a: Parameters<typeof publishDemoSite_>) { return audited('publishDemoSite', publishDemoSite_, a); }
export async function resetDemoSite(...a: Parameters<typeof resetDemoSite_>) { return audited('resetDemoSite', resetDemoSite_, a); }
