import { test } from 'node:test';
import assert from 'node:assert/strict';
import { health, readsFor, unpaired, openLoan, cyclesPerMonth } from '../js/packs.js';
import { SAMPLE } from '../js/sample.js';
const packs = SAMPLE['packrat.packs'], reads = SAMPLE['packrat.reads'], loans = SAMPLE['packrat.loans'];
test('cell spread says how the pack is', () => {
  assert.equal(health({ spreadmV: 6 }).state, 'ok');
  assert.equal(health({ spreadmV: 81 }).state, 'warn');
  assert.equal(health({ spreadmV: 152 }).state, 'bad');
  assert.equal(health(null).state, 'none');
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
