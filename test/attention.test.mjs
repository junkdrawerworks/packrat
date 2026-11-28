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
