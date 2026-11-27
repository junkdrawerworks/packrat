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
  // that was a mistake: the loan in Lent before opens, and Delete takes it out of the history
  await page.click('button.loan >> text=Brother');
  await page.waitForSelector('dialog >> text=Lent to Brother');
  await page.click('dialog >> text=Delete');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.toast.show >> text=Loan deleted.');
  assert.equal(await page.locator('text=Lent before').count(), 0, 'a mistaken loan stays in the history');
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
  // pack 02 is out with the neighbour and gets a new number: it's still out, under the new one
  await page.goto('about:blank');
  await page.goto(base + '?demo#02');
  await page.waitForSelector('.nfc');
  await page.evaluate(() => { const { ledger, render } = window.__packrat; ledger.put('packs', { ...ledger.doc('packs', '02'), tagged: '2026-11-20' }); render(); });
  await page.waitForSelector('.nfc .state >> text=Written Nov 20, 2026.');
  await page.click('#app >> text=Edit');
  assert.equal(await page.locator('label[for=f-id] small').textContent(), 'The number on its sticker. Changing it needs a new sticker.');
  // a number another pack has: the sheet stays open with what was typed, and says so
  await page.fill('#f-note', 'Runs warm on the circular saw');
  await page.fill('#f-id', '03');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector("dialog[open] .sheet-msg >> text=There's already a pack 03.");
  assert.equal(await page.inputValue('#f-note'), 'Runs warm on the circular saw', 'the refused Save lost what was typed');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'f-id');
  await page.fill('#f-id', '08');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.tape-cap >> text=Pack 08');
  assert.match(await page.locator('.notice.warn').innerText(), /Out with Neighbor/, 'renumbering lost who has it');
  assert.equal(await page.locator('.nfc .state', { hasText: /^Written/ }).count(), 0, 'pack 08 says its sticker is written, but the sticker holds m/02');
  assert.equal(await page.evaluate(() => window.__packrat.ledger.doc('packs', '08').tagged), undefined);
  await page.click('text=‹ All packs');
  await page.waitForSelector('.notice.warn >> text=Lent out:');
  assert.match(await page.locator('.notice.warn').innerText(), /Lent out: 5\.0 Ah #2 \(Neighbor\)/);
  // pack 01 is deleted: its loan goes with it, its readings aren't offered as not linked, and a new pack 01 starts clean
  await page.click('a.row >> text=5.0 Ah #1');
  await page.click('#app >> text=Edit');
  await page.click('dialog >> text=Delete');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.row >> text=3.0 Ah');
  assert.equal(await page.locator('a.row[href="#01"]').count(), 0);
  const notLinked = () => page.locator('.card li code').allTextContents();
  assert.deepEqual(await notLinked(), ['2833D0110C000044'], "a deleted pack's readings are offered as not linked");
  await page.click('text=Add a pack');
  await page.fill('#f-id', '01');
  await page.fill('#f-label', 'New 5.0 Ah');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.tape >> text=New 5.0 Ah');
  assert.equal(await page.locator('text=Lent before').count(), 0, 'the new pack 01 inherited the old one\'s loans');
  await page.click('text=‹ All packs');
  await page.waitForSelector('a.row[href="#01"]');
  assert.deepEqual(await notLinked(), ['2833D0110C000044']);
  // it was the same battery after all: read on Cellmate after the delete, it can be linked to the new pack 01
  await addRead({ id: 'r20', cycles: 215, cells: [3901, 3903, 3899, 3902, 3900], spreadmV: 4, at: Date.now() + 1000 });
  await page.waitForFunction(() => document.querySelectorAll('.card li code').length === 2, null, { timeout: 3000 }).catch(() => {});
  assert.deepEqual(await notLinked(), ['28F1A20C1A0000E3', '2833D0110C000044'], "a deleted pack's battery read again can't be linked");
  await page.click('a.row[href="#01"]');
  await page.click('#app >> text=Link to Cellmate');
  const offered = await page.locator('dialog[open] #f-rom option').evaluateAll(os => os.map(o => o.value));
  assert.deepEqual(offered, ['28F1A20C1A0000E3', '2833D0110C000044']);
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.cells');
  assert.equal(await page.evaluate(() => window.__packrat.ledger.doc('packs', '01').rom), '28F1A20C1A0000E3');
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
  await stickerPage({ ctx, base, assert });
  await loanChecks({ page, base, assert });
  // Back from a pack 40 rows down lands where the list was
  const { backKeepsPlace } = await import('./kit-checks.mjs');
  await backKeepsPlace({ browser: ctx.browser(), base, assert, app: 'packrat', colls: { reads: [], loans: [],
    packs: Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1).padStart(2, '0'), label: `5.0 Ah #${i + 1}`, model: 'BL1850B' })) } });
}

// A loan marked back by mistake: clearing Came back in its sheet puts the pack out again, unless it's out on another
// loan now, which is said instead.
async function loanChecks({ page, base, assert }) {
  const l2 = () => page.evaluate(() => window.__packrat.ledger.doc('loans', 'l2'));
  await page.goto('about:blank');
  await page.goto(base + '?demo#01');
  await page.click('text=Lend it out');
  await page.fill('#f-who', 'Cousin');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.notice.warn >> text=Out with Cousin');
  await page.click('button.loan >> text=Neighbor');
  await page.fill('dialog[open] #f-note', 'Borrowed the 5.0 too');
  await page.fill('dialog[open] #f-back', '');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('dialog[open] .sheet-msg >> text=Pack 01 is already out with Cousin.');
  assert.equal(await page.inputValue('dialog[open] #f-note'), 'Borrowed the 5.0 too', 'the refused Save lost what was typed');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'f-back');
  assert.equal((await l2()).back, '2026-09-09', 'an old loan was put back out while the pack is out on another');
  await page.click('dialog[open] >> text=Cancel');
  await page.click('text=It came back');
  await page.waitForSelector('text=Lend it out');
  await page.click('button.loan >> text=Neighbor');
  await page.fill('dialog[open] #f-back', '');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.notice.warn >> text=Out with Neighbor', { timeout: 5000 }).catch(() => {});
  assert.equal((await l2()).back, null, 'clearing Came back was ignored');
  assert.equal(await page.locator('#app button', { hasText: 'It came back' }).count(), 1);
}

// A phone that synced earlier, so Add pack N shows at once from its copy, opens pack 03's sticker while the ledger
// takes a second to answer; meanwhile another device has added pack 03 and linked it to Cellmate. Add pack 03 then
// opens that pack's page, and the sheet's pack 03 keeps its link.
async function stickerPage({ ctx, base, assert }) {
  const { DemoLedger } = await import(new URL('../js/kit/ledger.js', import.meta.url));
  const p01 = { id: '01', label: '5.0 Ah #1', model: 'BL1850B' };
  const p03 = { id: '03', label: '5.0 Ah #3', model: 'BL1850B', rom: '28CCCC0C1B0000A3', ah: 5 };
  const google = new DemoLedger({ 'packrat.packs': [p01, p03] });
  const phone = await ctx.browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
  const errors = [];
  phone.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  try {
    await phone.route('https://script.google.com/**', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.op === 'list') await new Promise(r => setTimeout(r, 1000));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(google.handle(body)) });
    });
    await phone.addInitScript(p01 => { try { if (!localStorage.getItem('packrat.ledger')) {
      localStorage.setItem('packrat.ledger', JSON.stringify({ url: 'https://script.google.com/macros/s/AKfyTEST/exec', key: 'k'.repeat(40) }));
      localStorage.setItem('packrat.m.packs', JSON.stringify({ docs: { '01': { ...p01, _updated: 1001 } }, since: 0, listed: true })); } } catch {} }, p01);
    const p = await phone.newPage();
    await p.goto(base + '#03');
    await p.waitForSelector('text=No pack 03 yet.');
    await p.click('text=Add pack 03');
    await p.waitForSelector('dialog[open], .tape >> text=5.0 Ah #3');
    if (await p.locator('dialog[open]').count()) {           // the sheet came up over the pack that arrived
      await p.fill('#f-label', 'Typed on the phone');
      await p.click('dialog >> button[type=submit]');
    }
    await p.waitForSelector('.tape >> text=5.0 Ah #3', { timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => !/Saving/.test(document.querySelector('#sync').textContent));
    const { _updated, ...now } = google.store['packrat.packs']['03'];
    assert.deepEqual(now, p03, 'Add pack 03 replaced the pack another device made, Cellmate link and all');
    assert.equal(await p.locator('.tape').textContent(), '5.0 Ah #3');
    assert.deepEqual(errors, [], 'errors on the phone');
  } finally { await phone.close(); }
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
    await p.fill('#f-note', 'Runs warm on the circular saw');
    await p.click('dialog >> button[type=submit]');
    await p.waitForSelector('dialog[open] .sheet-msg >> text=Still loading from the ledger. Try again in a moment.');
    assert.equal(await p.inputValue('dialog[open] #f-note'), 'Runs warm on the circular saw', 'the refused Save lost what was typed');
    assert.equal(google.store['packrat.packs']['03'], undefined, 'saved over the sheet before the ledger answered');
    assert.deepEqual(errors, [], 'errors on the laptop');
  } finally { await laptop.close(); }
}
