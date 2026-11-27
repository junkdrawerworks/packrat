import { test } from 'node:test';
import assert from 'node:assert/strict';
import { health, lowCells, readsFor, unpaired, openLoan, cyclesPerMonth } from '../js/packs.js';
import { SAMPLE } from '../js/sample.js';
const packs = SAMPLE['packrat.packs'], reads = SAMPLE['packrat.reads'], loans = SAMPLE['packrat.loans'];
test('cell spread says how the pack is', () => {
  assert.equal(health({ spreadmV: 6 }).state, 'ok');
  assert.equal(health({ spreadmV: 81 }).state, 'warn');
  assert.equal(health({ spreadmV: 152 }).state, 'bad');
  assert.equal(health(null).state, 'none');
  assert.equal(health({ spreadmV: 152 }).text, 'weak cell (152 mV apart)', 'the guide quotes this');
});
test("Cellmate's own limits: a cell under 2.5 V or over 4.25 V is bad, whatever the spread", () => {
  const flat = { cells: [2364, 2370, 2364, 2378, 2371], spreadmV: 14 };
  assert.deepEqual([health({ ...flat, verdict: 'bad' }).state, health(flat).state], ['bad', 'bad'], 'a deeply discharged pack read as balanced');
  assert.equal(health(flat).text, 'deeply discharged: lowest cell 2.36 V');
  const high = { cells: [4180, 4190, 4260, 4185, 4188], spreadmV: 80 };
  assert.equal(health(high).state, 'bad');
  assert.equal(health(high).text, 'a cell over 4.25 V: highest cell 4.26 V');
  assert.equal(health({ cells: [2500, 2510, 2505, 2500, 2502], spreadmV: 10 }).state, 'ok', 'exactly 2.5 V is still in');
  assert.equal(health({ cells: [4250, 4240, 4245, 4250, 4248], spreadmV: 10 }).state, 'ok', 'exactly 4.25 V is still in');
  // never better than Cellmate's verdict; stricter is fine (Packrat watches from 30 mV)
  assert.equal(health({ spreadmV: 20, verdict: 'bad' }).state, 'bad');
  assert.equal(health({ spreadmV: 20, verdict: 'watch' }).state, 'warn');
  assert.equal(health({ spreadmV: 40, verdict: 'ok' }).state, 'warn');
  assert.deepEqual(lowCells(flat.cells), [true, true, true, true, true], 'every cell under 2.5 V is marked');
  assert.deepEqual(lowCells([3700, 3560, 3712, 3705, 3709]), [false, true, false, false, false]);
  assert.deepEqual(lowCells([3912, 3915, 3909, 3911, 3914]), [false, false, false, false, false], 'balanced: none');
});
test('readings by pack, newest first, and the ones not linked', () => {
  assert.deepEqual(readsFor(packs[0], reads).map(r => r.cycles), [212, 180]);
  assert.deepEqual(readsFor(packs[3], reads), []);
  assert.deepEqual(unpaired(packs, reads).map(r => r.rom), ['2833D0110C000044']);
});
test('loans and cycles a month', () => {
  assert.equal(openLoan(packs[1], loans).who, 'Neighbor');
  assert.equal(openLoan(packs[0], loans), null);
  assert.equal(cyclesPerMonth(readsFor(packs[0], reads)), 5.7);
  assert.equal(cyclesPerMonth([reads[0]]), null);
});
