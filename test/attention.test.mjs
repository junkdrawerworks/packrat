import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLLS, look } from '../js/attention.js';
import { SAMPLE } from '../js/sample.js';

// Switchboard's read(coll): the collection's records as the ledger lists them, deleted ones left out.
const reader = data => coll => (data[coll] || []).filter(d => !d._deleted);
const data = Object.fromEntries(COLLS.map(c => [c, SAMPLE['packrat.' + c]]));
const nov = new Date(2026, 10, 26);

test('reads the three collections Packrat keeps', () => {
  assert.deepEqual(COLLS, ['packs', 'reads', 'loans']);
});

test('Needs a look names a weak pack, and opens it when it is the only one', () => {
  assert.deepEqual(look(reader(data), nov), [{ text: 'Packs: 03 weak', href: '#03' }], 'pack 02 is lent 11 days: not yet');
});

test('a pack lent out over a month joins, in the pack page\'s words', () => {
  assert.deepEqual(look(reader(data), new Date(2027, 0, 5)), [{ text: 'Packs: 03 weak; 02 out with Neighbor 7 weeks', href: './' }]);
  assert.deepEqual(look(reader(data), new Date(2026, 11, 16)), [{ text: 'Packs: 03 weak', href: '#03' }], 'day 31 is still under a month');
  assert.deepEqual(look(reader(data), new Date(2026, 11, 17)), [{ text: 'Packs: 03 weak; 02 out with Neighbor 5 weeks', href: './' }], 'day 32 is over a month');
  assert.deepEqual(look(reader(data), new Date(2027, 1, 1)), [{ text: 'Packs: 03 weak; 02 out with Neighbor 2 months', href: './' }]);
});

test("Cellmate's cell limits count as weak too; watch, a loan back and a deleted pack don't", () => {
  const packs = [{ id: '01', rom: 'A' }, { id: '02', rom: 'B' }, { id: '03', rom: 'C' }, { id: '04', retired: true, gone: ['D'] }];
  const reads = [{ rom: 'A', cells: [2400, 3600, 3600, 3600, 3600], at: 1 }, { rom: 'B', cells: [3700, 3640, 3700, 3700, 3700], at: 1 },
    { rom: 'C', cells: [3700, 3700, 3700, 3700, 4300], at: 1 }, { rom: 'D', cells: [3000, 3700, 3700, 3700, 3700], at: 1 }];
  const loans = [{ id: 'l', pack: '02', who: 'Cousin', out: '2026-01-01', back: '2026-02-01' }];
  assert.deepEqual(look(reader({ packs, reads, loans }), nov), [{ text: 'Packs: 01 discharged; 03 too high', href: './' }]);
  assert.deepEqual(look(reader({}), nov), []);
});

test('Find anything: every pack by number, with who has it, found by label, model, note, number or who has it', async () => {
  const { things } = await import('../js/attention.js');
  const { found } = await import('../js/kit/find.js');
  const all = things(reader(data));
  assert.deepEqual(all.map(t => [t.name, t.where, t.href]), [['5.0 Ah #1', 'Pack 01', '#01'], ['5.0 Ah #2', 'Pack 02 · out with Neighbor', '#02'],
    ['3.0 Ah', 'Pack 03', '#03'], ['2.0 Ah compact', 'Pack 04', '#04']]);
  const hits = q => all.filter(t => found(q, ...t.texts)).map(t => t.href);
  assert.deepEqual(hits('neighbor'), ['#02'], 'who has it now (pack 01 came back from the same neighbour)');
  assert.deepEqual(hits('BL1850'), ['#01', '#02']);
  assert.deepEqual(hits('pack 3'), ['#03']);
  assert.deepEqual(hits('5.0 ah 2'), ['#02']);
  assert.deepEqual(things(reader({ packs: [{ id: '07' }, { id: '08', retired: true }] })).map(t => t.name), ['Pack 07'], 'a deleted pack isn\'t one');
});

test('Check a tag: a pack sticker names the pack, and m/3 names pack 03 when there is no pack 3', async () => {
  const { tags } = await import('../js/attention.js');
  const t = tags(reader(data));
  assert.deepEqual(t['03'], { name: '3.0 Ah', where: 'Pack 03' });
  assert.deepEqual(t['3'], t['03']);
  assert.equal(tags(reader({ packs: [{ id: '05', retired: true }] }))['05'], undefined, 'a deleted pack');
  assert.deepEqual(tags(reader({})), {});
});
