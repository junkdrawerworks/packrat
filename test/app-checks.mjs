// Packrat's own checks, run by test/e2e.mjs on a phone-sized page.
const fakeNfc = () => { window.__nfc = { writes: [] }; window.NDEFReader = class { async write(m) { window.__nfc.writes.push(m.records[0].data); } async scan() {} }; };
export async function appChecks({ page, ctx, base, assert }) {
  assert.match(await page.locator('#app').innerText(), /connect first/i);
  await page.addInitScript(fakeNfc);
  await page.goto(base + '?demo');
  await page.waitForSelector('.row .num');
  assert.equal(await page.locator('.list .row').count(), 4);
  assert.match(await page.locator('.notice.warn').innerText(), /Neighbor/);
  await page.click('a.row >> text=3.0 Ah');
  await page.waitForSelector('.cells');
  assert.equal(await page.locator('.cell').count(), 5);
  assert.match(await page.locator('.facts').innerText(), /weak cell \(152 mV apart\)/);
  // which cell is low, in words as well as red, and for a screen reader
  assert.deepEqual(await page.locator('.cell').evaluateAll(cs => cs.map(c => c.querySelector('em')?.textContent || '')), ['', 'low', '', '', ''], 'the low cell is marked by colour alone');
  assert.equal(await page.getByRole('img', { name: 'Cells 1 to 5: 3.70, 3.56 (lowest), 3.71, 3.71, 3.71 volts' }).count(), 1);
  assert.match(await page.locator('.facts').innerText(), /Lowest\s+cell 2, 3\.56 V/);
  await page.click('text=Lend it out');
  await page.fill('#f-who', 'Brother');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.notice.warn >> text=Out with Brother');
  await page.click('text=It came back');
  await page.waitForSelector('text=Lend it out');
  // a deeply discharged pack: balanced cells, but every one under 2.5 V, as Cellmate posts it (verdict bad)
  await page.goto(base + '?demo#01');
  await page.waitForSelector('.cells');
  const addRead = r => page.evaluate(r => { const { ledger, render } = window.__packrat; ledger.put('reads', { rom: '28F1A20C1A0000E3', model: 'BL1850B', ...r }); render(); }, r);
  await addRead({ id: 'r9', cycles: 214, cells: [2364, 2370, 2364, 2378, 2371], spreadmV: 14, packmV: 11847, verdict: 'bad', at: Date.now() - 60000 });
  await page.waitForSelector('.facts >> text=deeply discharged: lowest cell 2.36 V');
  assert.equal(await page.locator('section.card .chip').first().textContent(), 'discharged', 'a deeply discharged pack read as balanced');
  assert.equal(await page.locator('.cell.low').count(), 5);
  await page.click('text=‹ All packs');
  assert.equal(await page.locator('a.row[href="#01"] .chip').textContent(), 'discharged');
  // a weak pack read again, and this time its voltages didn't read: it stays weak, with the last cells that did read
  await page.click('a.row >> text=3.0 Ah');
  await page.waitForSelector('.cells');
  await page.evaluate(() => { const { ledger, render } = window.__packrat; ledger.put('reads', { id: 'r10', rom: '2833C1990C0000F0', model: 'BL1830B', cycles: 411, locked: true, at: Date.parse('2026-11-27T17:00:00Z') }); render(); });
  await page.waitForSelector('section.card >> text=411');
  assert.equal(await page.locator('section.card .chip').first().textContent(), 'weak cell', 'a reading with no cells hid the weak one');
  assert.equal(await page.locator('section.card p.muted').textContent(), "Cells didn't read on Nov 27, 2026; these are from Nov 21, 2026.");
  assert.equal(await page.locator('.cell').count(), 5);
  assert.match(await page.locator('.facts').innerText(), /weak cell \(152 mV apart\)/);
  await page.click('text=‹ All packs');
  assert.equal(await page.locator('a.row[href="#03"] .chip').textContent(), 'weak');
  // what Edit saves about a pack shows on its page: the note under the name, when it was bought, its capacity
  await page.goto('about:blank');
  await page.goto(base + '?demo#04');
  await page.click('#app >> text=Edit');
  await page.fill('#f-bought', '2021-05-02');
  await page.fill('#f-note', 'Came with the drill kit. Keep it for the blower.');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('p.note >> text=Came with the drill kit. Keep it for the blower.');
  assert.match(await page.locator('.facts').innerText(), /Bought\s+May 2, 2021 · \d\.\d yr/, 'the bought date is saved but shown nowhere');
  // its capacity from Cellmate's reading, and an idle pack's cycles: not "about 0 a month"
  await page.evaluate(() => { const { ledger } = window.__packrat; ledger.put('reads', { ...ledger.doc('reads', 'r1'), capAh: 5 }); ledger.put('reads', { ...ledger.doc('reads', 'r2'), cycles: 212 }); location.hash = '#01'; });
  await page.waitForSelector('.tape >> text=5.0 Ah #1');
  assert.match(await page.locator('.facts').innerText(), /Capacity\s+5\.0 Ah/);
  assert.match(await page.locator('.facts').innerText(), /Charge cycles\s+212 \(none since Jun 2, 2026\)/, 'about 0 a month');
  await page.goto(base + '?demo#04');
  await page.click('text=Link to Cellmate');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('code >> text=2833D0110C000044');
  await page.click('text=Write sticker');
  await page.waitForFunction(() => window.__nfc.writes[0] === 'https://tag.junkdrawer.works/m/04');
  await page.waitForFunction(() => /^Written [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/.test(document.querySelector('.nfc .state')?.textContent || ''));
  assert.equal(await page.locator('.nfc > .msg:last-child').textContent(), 'Written. Tap it with the phone to check it opens this page.');
  await secondDevice({ ctx, base, assert });
}

// The laptop, connected while Google takes 3 s to answer its first list (a cold start), with the phone's pack 01 linked
// to Cellmate on the sheet: Add a pack waits for the list, then offers 02, and pack 01 keeps its link.
async function secondDevice({ ctx, base, assert }) {
  const { DemoLedger } = await import(new URL('../js/kit/ledger.js', import.meta.url));
  const p01 = { id: '01', label: '5.0 Ah #1', model: 'BL1860B', rom: '28BBBB0C1B0000A1', ah: 5 };
  const google = new DemoLedger({ 'packrat.packs': [p01] });
  const laptop = await ctx.browser().newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const errors = [];
  laptop.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  try {
    await laptop.route('https://script.google.com/**', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.op === 'list') await new Promise(r => setTimeout(r, 3000));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(google.handle(body)) });
    });
    await laptop.addInitScript(() => { try { localStorage.getItem('packrat.ledger') || localStorage.setItem('packrat.ledger',
      JSON.stringify({ url: 'https://script.google.com/macros/s/AKfyTEST/exec', key: 'k'.repeat(40) })); } catch {} });
    const p = await laptop.newPage();
    await p.goto(base);
    await p.waitForSelector('.empty >> text=Loading…');
    const add = p.locator('button', { hasText: 'Add a pack' });
    assert.equal(await add.isDisabled(), true, 'Add a pack offered before the ledger answered');
    await p.waitForSelector('.row >> text=5.0 Ah #1', { timeout: 10000 });
    assert.equal(await add.isDisabled(), false);
    await add.click();
    assert.equal(await p.inputValue('#f-id'), '02', 'Add a pack offered a number the sheet already has');
    await p.fill('#f-label', '2.0 Ah compact');
    await p.fill('#f-model', 'BL1820B');
    await p.click('dialog >> button[type=submit]');
    await p.waitForSelector('.tape >> text=2.0 Ah compact');
    await p.waitForFunction(() => !/Saving/.test(document.querySelector('#sync').textContent));
    const { _updated, ...was } = google.store['packrat.packs']['01'];
    assert.deepEqual(was, p01, "the phone's pack 01 lost its Cellmate link");
    assert.equal(google.store['packrat.packs']['02'].model, 'BL1820B');
    // a sheet opened, then the copy forgotten before Save: it isn't saved from nothing
    await p.goto(base);
    await add.click();
    await p.waitForSelector('dialog[open]');
    await p.evaluate(() => { const m = window.__packrat.ledger.m('packs'); m.since = 0; m.listed = false; });
    await p.click('dialog >> button[type=submit]');
    await p.waitForSelector('.toast.show >> text=Still loading from the ledger. Try again in a moment.');
    assert.equal(google.store['packrat.packs']['03'], undefined, 'saved over the sheet before the ledger answered');
    assert.deepEqual(errors, [], 'errors on the laptop');
  } finally { await laptop.close(); }
}
