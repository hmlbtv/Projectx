// End-to-end checks against a throw-away local database.  Run: npm run build && npm test
// It starts the production server on a spare port, signs in, seeds a Site / Wall Template / Job, then drives the pages in Chromium.
const { spawn } = require('child_process'); const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PORT = process.env.TEST_PORT || 3951, DIR = path.join(require('os').tmpdir(), 'teleplanner-e2e'), B = `http://localhost:${PORT}`;
const env = { ...process.env, ADMIN_EMAIL: 'a@test.com', ADMIN_PASSWORD: 'Testpass#12345', PGLITE_DIR: DIR, DEV_FEEDBACK: '1', PORT: String(PORT) };
let srv; const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const start = async () => { srv = spawn('npx', ['next', 'start', '-p', String(PORT)], { env, stdio: ['ignore', fs.openSync(path.join(require('os').tmpdir(), 'e2e-server.log'), 'a'), fs.openSync(path.join(require('os').tmpdir(), 'e2e-server.log'), 'a')], detached: true }); for (let i = 0; i < 60; i++) { try { await fetch(B + '/signin'); return; } catch { await new Promise(r => setTimeout(r, 500)); } } throw new Error('server did not start'); };
const alive = async () => { try { await fetch(B + '/signin'); return true; } catch { return false; } };
const stop = async () => { // ask nicely first (the database flushes to disk on exit), then force
  try { if (srv && srv.pid) process.kill(-srv.pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 20 && await alive(); i++) await new Promise(r => setTimeout(r, 500));
  if (await alive()) { try { require('child_process').execSync(`fuser -k ${PORT}/tcp || true`, { stdio: 'ignore' }); } catch {} await new Promise(r => setTimeout(r, 1000)); }
};
const openAll = async p => { await p.waitForLoadState('networkidle'); for (let k = 0; k < 6; k++) { await p.waitForTimeout(300); const closed = await p.evaluate(() => { let n = 0; document.querySelectorAll('details:not(.head details)').forEach(e => { if (!e.open) { e.open = true; n++; } }); return n; }); if (!closed && k > 0) return; } };
const click = async (p, loc, o = {}) => { for (let k = 0; k < 4; k++) { await openAll(p); try { await loc.click({ timeout: 4000, ...o }); return; } catch (e) { if (k === 3) throw e; } } };
(async () => {
  await stop(); fs.rmSync(DIR, { recursive: true, force: true }); await start();
  const b = await chromium.launch(); const p = await b.newPage(); globalThis.PAGE = p; const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 500) errs.push(r.status() + ' ' + r.url()); });
  const signin = async () => { await p.goto(B + '/signin'); if (!(await p.$('input[name=email]'))) return; await p.fill('input[name=email]', env.ADMIN_EMAIL); await p.fill('input[name=password]', env.ADMIN_PASSWORD); await p.click('form button'); await p.waitForTimeout(2500); };
  await signin(); await stop();
  const { PGlite } = require('@electric-sql/pglite'); const db = new PGlite(DIR); const q = async (s, a) => (await db.query(s, a)).rows;
  const s = (await q("insert into sites(tenant_id,name) values(1,'S') returning id"))[0].id, l = (await q("insert into locations(site_id,name) values($1,'L') returning id", [s]))[0].id, r = (await q("insert into rooms(location_id,name) values($1,'R') returning id", [l]))[0].id;
  const wt = (await q("insert into wall_templates(name,defaults) values('WT',$1) returning id", [JSON.stringify([{ id: 'd1', name: 'Layout A', mons: { m1: 1 }, active: true }, { id: 'd2', name: 'Layout B', mons: { m1: 2 }, active: false }])]))[0].id;
  for (const n of ['W1', 'W2']) await q('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [r, wt, n]);
  const bc = (await q("insert into broadcasters(tenant_id,name) values(1,'B') returning id"))[0].id, pr = (await q("insert into productions(broadcaster_id,name) values($1,'P') returning id", [bc]))[0].id;
  const jobId = (await q("insert into jobs(production_id,name) values($1,'J') returning id", [pr]))[0].id;
  const mvId = (await q("insert into mv_layouts(tenant_id,name,tiles) values(1,'TESTMV',$1) returning id", [JSON.stringify([1, 2, 3].map(n => ({ n, x: (n - 1) * 600, y: 100, w: 580, h: 400 })))]))[0].id; await db.close(); await start(); await signin();

  for (const u of ['/', '/productions', '/layouts', '/tiles', '/walls', '/hardware', '/sources', '/plans', '/team', '/tenant']) { const res = await p.goto(B + u); ok(res.status() === 200, `page ${u} loads (got ${res.status()} ${res.url()})`); }

  await p.goto(B + '/productions?j=' + jobId); await openAll(p); if (process.env.DBG) console.log(p.url(), (await p.locator('details').evaluateAll(a => a.map(d => d.open + ':' + d.innerText.slice(0, 40).replace(/\n/g, '|')))));
  await click(p, p.locator('button', { hasText: 'Use in this Job' }).first()); await p.waitForTimeout(1500); await openAll(p);
  const pick = p.locator('select[aria-label^="Default configuration"]');
  ok(await pick.count() === 1 && await pick.first().inputValue() === 'd1', 'adding a wall applies the active default layout');
  await pick.first().selectOption('d2'); await p.waitForTimeout(1500); await p.reload(); await openAll(p);
  ok(await pick.first().inputValue() === 'd2', 'changing the starting layout is saved');
  await click(p, p.locator('button', { hasText: /^Add all/ }).first()); await p.waitForTimeout(1500); await openAll(p);
  ok((await pick.evaluateAll(a => a.map(x => x.value))).join() === 'd2,d1', 'Add all seeds the default for walls that have no plan, and keeps the existing one');
  await click(p, p.locator('button', { hasText: 'Remove' }).first()); await p.waitForTimeout(500);
  ok(await p.locator('text=Are you sure').count() + await p.locator('dialog[open]').count() >= 1, 'removing asks for confirmation');

  // ---- MV Designer: window numbers and undo ----
  await p.goto(B + '/layouts?id=' + mvId); await p.locator('svg text', { hasText: /^3$/ }).first().waitFor({ timeout: 15000 });
  const nums = async () => (await p.locator('svg text').allTextContents()).filter(t => /^(\d+|\+)$/.test(t.trim())).join();
  ok(await nums() === '1,2,3', 'MV Designer shows windows numbered 1,2,3 (got ' + await nums() + ')');
  await p.locator('svg text', { hasText: /^3$/ }).first().click({ force: true });
  const num = p.locator('label.dz-row', { hasText: 'Number' }).locator('input');
  ok(await num.count() === 1 && await num.inputValue() === '3', 'selecting a window shows its Number');
  await num.fill('1'); await p.waitForTimeout(300);
  ok(await nums() === '3,2,1' || await nums() === '3,2,1'.split(',').join(','), 'typing a taken number swaps the two windows (got ' + await nums() + ')');
  await p.locator('button', { hasText: 'Swap numbers' }).click();
  await p.locator('svg text', { hasText: /^2$/ }).first().click({ force: true }); await p.locator('svg text', { hasText: /^3$/ }).first().click({ force: true });
  ok(await nums() === '2,3,1', 'Swap numbers trades two windows (got ' + await nums() + ')');
  await p.locator('button', { hasText: 'Done swapping' }).click();
  const undoBtn = p.locator('.dz-tools button[aria-label=Undo]'), redoBtn = p.locator('.dz-tools button[aria-label=Redo]');
  ok(await undoBtn.count() === 1 && await redoBtn.count() === 1, 'undo and redo buttons are in the alignment toolbar');
  const winCount = async () => (await nums()).split(',').filter(Boolean).length;
  await p.locator('svg text', { hasText: /^1$/ }).first().click({ force: true }); await p.keyboard.press('Delete'); await p.waitForTimeout(300);
  ok(await winCount() === 2, 'Delete removes the selected window (got ' + await winCount() + ')');
  await undoBtn.click(); await p.waitForTimeout(300); ok(await winCount() === 3, 'Undo brings the window back');
  await redoBtn.click(); await p.waitForTimeout(300); ok(await winCount() === 2, 'Redo removes it again');
  await undoBtn.click(); await p.waitForTimeout(300);
  await p.locator('button', { hasText: /^Save$/ }).first().click(); await p.waitForTimeout(1500);
  await p.reload(); await p.waitForTimeout(1000);
  ok(await nums() === '1,2,3', 'saved layout reopens numbered 1,2,3 in the new order (got ' + await nums() + ')');
  ok(errs.length === 0, 'no server or page errors: ' + errs.join(' | '));
  await b.close(); await stop(); fs.rmSync(DIR, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.error(e); try { await globalThis.PAGE.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-fail.png') }); console.log(await globalThis.PAGE.url()); } catch {} await stop(); process.exit(1); });
