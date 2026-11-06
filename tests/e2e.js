// End-to-end checks against a throw-away local database.  Run: npm run build && npm test
// It starts the production server on a spare port, signs in, seeds a Site / Wall Template / Job, then drives the pages in Chromium.
const { spawn } = require('child_process'); const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PORT = process.env.TEST_PORT || 3951, DIR = path.join(require('os').tmpdir(), 'teleplanner-e2e'), B = `http://localhost:${PORT}`;
const env = { ...process.env, ADMIN_EMAIL: 'a@test.com', ADMIN_PASSWORD: 'Testpass#12345', PGLITE_DIR: DIR, DEV_FEEDBACK: '1', PORT: String(PORT) };
let srv; const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const start = async () => { srv = spawn('npx', ['next', 'start', '-p', String(PORT)], { env, stdio: 'ignore', detached: true }); for (let i = 0; i < 60; i++) { try { await fetch(B + '/signin'); return; } catch { await new Promise(r => setTimeout(r, 500)); } } throw new Error('server did not start'); };
const stop = async () => { try { process.kill(-srv.pid); } catch {} await new Promise(r => setTimeout(r, 1500)); };
const openAll = async p => { for (const d of await p.$$('details:not(.head details)')) await d.evaluate(e => { e.open = true; }); };
(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); await start();
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 500) errs.push(r.status() + ' ' + r.url()); });
  const signin = async () => { await p.goto(B + '/signin'); if (!(await p.$('input[name=email]'))) return; await p.fill('input[name=email]', env.ADMIN_EMAIL); await p.fill('input[name=password]', env.ADMIN_PASSWORD); await p.click('form button'); await p.waitForTimeout(2500); };
  await signin(); await stop();
  const { PGlite } = require('@electric-sql/pglite'); const db = new PGlite(DIR); const q = async (s, a) => (await db.query(s, a)).rows;
  const s = (await q("insert into sites(tenant_id,name) values(1,'S') returning id"))[0].id, l = (await q("insert into locations(site_id,name) values($1,'L') returning id", [s]))[0].id, r = (await q("insert into rooms(location_id,name) values($1,'R') returning id", [l]))[0].id;
  const wt = (await q("insert into wall_templates(name,defaults) values('WT',$1) returning id", [JSON.stringify([{ id: 'd1', name: 'Layout A', mons: { m1: 1 }, active: true }, { id: 'd2', name: 'Layout B', mons: { m1: 2 }, active: false }])]))[0].id;
  for (const n of ['W1', 'W2']) await q('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [r, wt, n]);
  const bc = (await q("insert into broadcasters(tenant_id,name) values(1,'B') returning id"))[0].id, pr = (await q("insert into productions(broadcaster_id,name) values($1,'P') returning id", [bc]))[0].id;
  await q("insert into jobs(production_id,name) values($1,'J')", [pr]); await db.close(); await start(); await signin();

  for (const u of ['/', '/productions', '/layouts', '/tiles', '/walls', '/hardware', '/sources', '/plans', '/team', '/tenant']) { const res = await p.goto(B + u); ok(res.status() === 200, `page ${u} loads (got ${res.status()} ${res.url()})`); }

  await p.goto(B + '/productions?j=1'); await openAll(p);
  await p.locator('button', { hasText: 'Use in this Job' }).first().click(); await p.waitForTimeout(1500); await openAll(p);
  const pick = p.locator('select[aria-label^="Default layout"]');
  ok(await pick.count() === 1 && await pick.first().inputValue() === 'd1', 'adding a wall applies the active default layout');
  await pick.first().selectOption('d2'); await p.waitForTimeout(1500); await p.reload(); await openAll(p);
  ok(await pick.first().inputValue() === 'd2', 'changing the starting layout is saved');
  await p.locator('button', { hasText: /^Add all/ }).first().click(); await p.waitForTimeout(1500); await openAll(p);
  ok((await pick.evaluateAll(a => a.map(x => x.value))).join() === 'd2,d1', 'Add all seeds the default for walls that have no plan, and keeps the existing one');
  await p.locator('button', { hasText: 'Remove' }).first().click(); await p.waitForTimeout(500);
  ok(await p.locator('text=Are you sure').count() + await p.locator('dialog[open]').count() >= 1, 'removing asks for confirmation');
  ok(errs.length === 0, 'no server or page errors: ' + errs.join(' | '));
  await b.close(); await stop(); fs.rmSync(DIR, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.error(e); await stop(); process.exit(1); });
