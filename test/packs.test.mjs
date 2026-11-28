import { test } from 'node:test';
import assert from 'node:assert/strict';
import { health, lowCells, lowest, readsFor, lastCells, unpaired, linkChoices, relinkPlan, openLoan, cyclesPerMonth, idleSince, LONG_LOAN, loanDays, loanAge, loanAgeWords, lentLines } from '../js/packs.js';
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
test("a reading whose voltages didn't read doesn't hide the last one that did", () => {
  const nov22 = { rom: 'X', cycles: 298, cells: [3800, 3810, 3683, 3805, 3802], spreadmV: 127, verdict: 'bad', at: Date.parse('2026-11-22T17:00:00Z') };
  const nov27 = { rom: 'X', cycles: 300, locked: false, at: Date.parse('2026-11-27T17:00:00Z') };   // info read, no cells
  const rs = readsFor({ rom: 'X' }, [nov22, nov27]);
  assert.equal(rs[0], nov27, 'the newest reading still gives the cycles');
  assert.equal(lastCells(rs), nov22);
  assert.deepEqual([health(lastCells(rs)).state, health(lastCells(rs)).text], ['bad', 'weak cell (127 mV apart)']);
  assert.equal(lastCells([nov27]), null, 'never a cell reading: still none');
  assert.equal(health(lastCells([nov27])).state, 'none');
});
test('the lowest cell by number, when one is marked low', () => {
  assert.equal(lowest([3700, 3560, 3712, 3705, 3709]), 'cell 2');
  assert.equal(lowest([2364, 2370, 2364, 2378, 2371]), 'cells 1 and 3');
  assert.equal(lowest([3912, 3915, 3909, 3911, 3914]), '', 'balanced: no lowest named');
  assert.equal(lowest(undefined), '');
});
test('since when the cycles have stood still', () => {
  const t = s => Date.parse(s);
  const rs = [{ cycles: 212, at: t('2026-11-20') }, { cycles: 212, at: t('2026-08-01') }, { cycles: 212, at: t('2026-06-02') }, { cycles: 180, at: t('2026-01-02') }];
  assert.equal(cyclesPerMonth(rs), 3);
  assert.equal(idleSince(rs), t('2026-06-02'));
  assert.equal(cyclesPerMonth(rs.slice(0, 3)), 0, 'none in five months');
  assert.equal(idleSince(rs.slice(0, 1)), t('2026-11-20'));
  assert.equal(idleSince([]), null);
});
test("a deleted pack's readings aren't offered for linking again, under a new pack with its number either", () => {
  const retired = { id: '01', retired: true, gone: ['28F1A20C1A0000E3'] };
  assert.deepEqual(unpaired([retired, ...packs.slice(1)], reads).map(r => r.rom), ['2833D0110C000044']);
  assert.deepEqual(unpaired([{ id: '01', label: 'New', gone: ['28F1A20C1A0000E3'] }, ...packs.slice(1)], reads).map(r => r.rom), ['2833D0110C000044']);
  assert.deepEqual(unpaired([{ id: '01', retired: true, rom: '28F1A20C1A0000E3' }, ...packs.slice(1)], reads).map(r => r.rom), ['2833D0110C000044', '28F1A20C1A0000E3'], 'a retired record links nothing by its rom');
});
test("a deleted pack's battery read again after the delete can be linked again", () => {
  const goneAt = Date.parse('2026-11-25T12:00:00Z'), again = { id: 'r20', rom: '28F1A20C1A0000E3', model: 'BL1850B', cycles: 213, at: Date.parse('2026-11-26T09:00:00Z') };
  const retired = { id: '01', retired: true, gone: ['28F1A20C1A0000E3'], goneAt };
  assert.deepEqual(unpaired([retired, ...packs.slice(1)], reads).map(r => r.rom), ['2833D0110C000044'], 'the readings from before the delete are offered');
  assert.deepEqual(unpaired([retired, ...packs.slice(1)], [...reads, again]).map(r => r.id), ['r20', 'r5'], 'a reading taken after the delete is never offered');
  assert.deepEqual(unpaired([{ id: '01', label: 'New', gone: ['28F1A20C1A0000E3'], goneAt }, ...packs.slice(1)], [...reads, again]).map(r => r.id), ['r20', 'r5'],
    'nor under a new pack 01 that kept the delete');
  assert.deepEqual(unpaired([{ ...retired, goneAt: again.at }, ...packs.slice(1)], [...reads, again]).map(r => r.rom), ['2833D0110C000044'], 'a reading at the moment of the delete is the old one');
  assert.deepEqual(unpaired([{ id: '01', retired: true, gone: ['28F1A20C1A0000E3'] }, ...packs.slice(1)], [...reads, again]).map(r => r.rom), ['2833D0110C000044'],
    'a delete with no time keeps them all out, as before');
});

// Two batteries read before either pack was linked, and each pack linked to the other's reading (the newest is at the
// top of the sheet, and it was the second pack's): each can be put right from its own page, with no delete.
const E = '28EEEE0C1A0000E5', F = '28FFFF0C1B0000F6';
const crossReads = [...reads, { id: 'r30', rom: E, model: 'BL1850B', cycles: 12, capAh: 5, at: Date.parse('2026-11-27T09:30:00Z') },
  { id: 'r31', rom: F, model: 'BL1860B', cycles: 45, capAh: 6, at: Date.parse('2026-11-27T09:31:00Z') }];
const apply = (ps, puts) => ps.map(p => puts.find(q => q.id === p.id) || p);
test('two packs linked to each other\'s readings are put right in two relinks', () => {
  let ps = [...packs, { id: '05', label: 'Pack five', rom: F, model: 'BL1860B', modelFrom: 'link', ah: 6, ahFrom: 'link' },
    { id: '06', label: 'Pack six', rom: E, model: 'BL1850B', modelFrom: 'link', ah: 5, ahFrom: 'link' }];
  // pack 05's choices: nothing it already has twice, the one no pack has first, its own battery on 06 offered to move
  const c = linkChoices(ps, crossReads, '05');
  assert.deepEqual(c.map(x => [x.rom, x.on]), [['2833D0110C000044', null], [E, '06'], ['2833C1990C0000F0', '03'], ['28F1A20C1B0000A1', '02'], ['28F1A20C1A0000E3', '01'], [F, 'here']]);
  assert.equal(c.find(x => x.rom === E).read.id, 'r30', 'each battery by its newest reading');
  const one = relinkPlan(ps, crossReads, '05', E);
  assert.deepEqual(one.map(p => p.id), ['06', '05'], 'two puts: the other pack loses it, this one gets it');
  assert.deepEqual(one[0], { id: '06', label: 'Pack six' }, 'pack 06 kept the battery, or the model and capacity that came with it');
  assert.deepEqual(one[1], { id: '05', label: 'Pack five', rom: E, model: 'BL1850B', modelFrom: 'link', ah: 5, ahFrom: 'link' }, 'the model from the old link stayed');
  ps = apply(ps, one);
  assert.deepEqual(linkChoices(ps, crossReads, '06').map(x => [x.rom, x.on]).slice(0, 2), [[F, null], ['2833D0110C000044', null]], 'the battery left over is first for pack 06');
  ps = apply(ps, relinkPlan(ps, crossReads, '06', F));
  assert.deepEqual([ps.find(p => p.id === '05').rom, ps.find(p => p.id === '06').rom, ps.find(p => p.id === '06').model], [E, F, 'BL1860B']);
  assert.deepEqual(relinkPlan(ps, crossReads, '06', F), [], 'the same battery again changes nothing');
});
test('None unlinks a pack, and a model typed in Edit stays through any link', () => {
  const typed = { ...packs[3], rom: '2833D0110C000044' };   // pack 04, model BL1820B typed in Edit
  const [off] = relinkPlan([...packs.slice(0, 3), typed], reads, '04', '');
  assert.deepEqual(off, { id: '04', label: '2.0 Ah compact', model: 'BL1820B' }, 'unlinked');
  assert.equal(relinkPlan(packs, reads, '04', '2833D0110C000044')[0].model, 'BL1820B', 'a typed model was replaced by the reading\'s');
  assert.equal(relinkPlan(packs, reads, '04', '2833D0110C000044')[0].modelFrom, undefined);
  const fromLink = { id: '07', rom: E, model: 'BL1850B', modelFrom: 'link' };
  assert.deepEqual(relinkPlan([fromLink], crossReads, '07', ''), [{ id: '07' }], 'unlinked, the battery\'s model went with it');
  assert.deepEqual(relinkPlan([{ id: '07' }], crossReads, '07', F), [{ id: '07', rom: F, model: 'BL1860B', modelFrom: 'link', ah: 6, ahFrom: 'link' }]);
  assert.deepEqual(relinkPlan([{ id: '07' }], crossReads, '07', ''), [], 'nothing to unlink');
});
test('what Link offers: nothing when Cellmate has read nothing; deleted packs out, and their batteries only once read again', () => {
  assert.deepEqual(linkChoices([{ id: '01' }], [], '01'), [], 'the toast is for this alone');
  assert.deepEqual(linkChoices([{ id: '01', rom: E }], [], '01').map(x => [x.rom, x.on]), [[E, 'here']], 'a linked pack can still be unlinked');
  const goneAt = Date.parse('2026-11-25T12:00:00Z');
  const ps = [{ id: '01', retired: true, rom: '28F1A20C1A0000E3', gone: ['28F1A20C1A0000E3'], goneAt }, ...packs.slice(1)];
  assert.deepEqual(linkChoices(ps, reads, '04').map(x => x.on), [null, '03', '02'], 'a retired pack offered as another pack');
  assert.equal(linkChoices(ps, reads, '04').some(x => x.rom === '28F1A20C1A0000E3'), false, 'a deleted pack\'s battery offered from a reading before the delete');
  const again = { id: 'r20', rom: '28F1A20C1A0000E3', model: 'BL1850B', cycles: 213, at: Date.parse('2026-11-26T09:00:00Z') };
  assert.deepEqual(linkChoices(ps, [...reads, again], '04').slice(0, 2).map(x => x.read.id), ['r20', 'r5'], 'read again after the delete: offered, by that reading');
  assert.deepEqual(relinkPlan(ps, [...reads, again], '01', 'x'), [], 'a retired pack is never relinked');
});

// A loan out two months reads differently from one out a day: how long it's been out, and from 32 days, since when
test('how long a loan has been out, and from a month on, since when', () => {
  const l1 = loans[0], p02 = packs[1], at = (y, m, d) => new Date(y, m - 1, d, 10);   // pack 02 to Neighbor on Nov 15, 2026
  assert.equal(LONG_LOAN, 32);
  assert.deepEqual([loanDays(l1, at(2026, 11, 15)), loanDays(l1, at(2026, 11, 27)), loanDays(l1, at(2026, 12, 15)), loanDays(l1, at(2027, 1, 20))], [0, 12, 30, 66]);
  assert.deepEqual([loanAge(l1, at(2026, 11, 15)), loanAge(l1, at(2026, 11, 16)), loanAge(l1, at(2026, 11, 27)), loanAge(l1, at(2027, 1, 10)), loanAge(l1, at(2027, 1, 20))],
    ['today', '1 day', '12 days', '8 wk', '2 mo'], 'the kit\'s words, today on the first day');
  assert.deepEqual([loanAgeWords(l1, at(2027, 1, 10)), loanAgeWords(l1, at(2027, 1, 20)), loanAgeWords(l1, at(2026, 11, 27)), loanAgeWords(l1, at(2029, 6, 1))], ['8 weeks', '2 months', '12 days', '2.5 years']);
  assert.deepEqual(lentLines([[p02, l1]], at(2026, 11, 27)), { long: [], lent: ['5.0 Ah #2 to Neighbor, 12 days'] });
  assert.deepEqual(lentLines([[p02, l1]], at(2026, 12, 14)), { long: [], lent: ['5.0 Ah #2 to Neighbor, 4 wk'] }, 'day 29 is not yet a month');
  assert.deepEqual(lentLines([[p02, l1]], at(2026, 12, 15)), { long: [], lent: ['5.0 Ah #2 to Neighbor, 4 wk'] }, 'day 30 is 4 weeks, not over a month');
  assert.deepEqual(lentLines([[p02, l1]], at(2026, 12, 16)), { long: [], lent: ['5.0 Ah #2 to Neighbor, 4 wk'] }, 'day 31 is not over a month either');
  assert.deepEqual(lentLines([[p02, l1]], at(2026, 12, 17)), { long: ['5.0 Ah #2 with Neighbor since Nov 15'], lent: [] }, 'from day 32 (5 wk), since when, without this year');
  assert.deepEqual(lentLines([[p02, l1], [packs[3], { pack: '04', who: 'Cousin', out: '2027-01-20' }]], at(2027, 1, 20)),
    { long: ['5.0 Ah #2 with Neighbor since Nov 15, 2026'], lent: ['2.0 Ah compact to Cousin, today'] }, 'last year\'s day says its year');
  assert.deepEqual(lentLines([[{ id: '09' }, { who: 'Brother', out: '2026-11-25' }]], at(2026, 11, 27)).lent, ['pack 09 to Brother, 2 days'], 'a pack with no name');
});
