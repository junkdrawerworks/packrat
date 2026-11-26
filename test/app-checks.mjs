// Packrat's own checks, run by test/e2e.mjs on a phone-sized page.
const fakeNfc = () => { window.__nfc = { writes: [] }; window.NDEFReader = class { async write(m) { window.__nfc.writes.push(m.records[0].data); } async scan() {} }; };
export async function appChecks({ page, base, assert }) {
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
  await page.click('text=Lend it out');
  await page.fill('#f-who', 'Brother');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('.notice.warn >> text=Out with Brother');
  await page.click('text=It came back');
  await page.waitForSelector('text=Lend it out');
  await page.goto(base + '?demo#04');
  await page.click('text=Link to Cellmate');
  await page.click('dialog >> button[type=submit]');
  await page.waitForSelector('code >> text=2833D0110C000044');
  await page.click('text=Write sticker');
  await page.waitForFunction(() => window.__nfc.writes[0] === 'https://tag.junkdrawer.works/m/04');
}
