// Packrat's arithmetic: which readings belong to which pack, and what the cells say. No DOM: unit-tested.
import { daysSince, ageText, dayText, parseDay } from './kit/ui.js';
// A pack's five cells should sit within a few hundredths of a volt of each other. Cellmate (lxt_decode.h) calls a pack
// bad, and won't clear its lock, when a cell is under 2.5 V (deeply discharged: the cells' rated end voltage) or over
// 4.25 V, or the spread is over 100 mV; Packrat says "weak" for the same, so it never reads better than Cellmate does.
// Balanced up to 50 mV and "watch it" from there to 100, as Cellmate's own page says (DIFF_WATCH_MV: "drifting apart,
// 50-100 mV"), so a pack reads the same on both.
export const SPREAD = { watch: 50, weak: 100 };   // mV
export const CELL = { low: 2500, high: 4250 };    // mV: Cellmate's CELL_LOW_MV and CELL_HIGH_MV
const volts = mv => (mv / 1000).toFixed(2);

// { state: ok|warn|bad|none, text (the Cells line), chip (the pack page's), short (the home list's) }
export function health(read) {
  const cs = read?.cells?.length ? read.cells : null;
  if (!read || (read.spreadmV == null && !cs)) return { state: 'none', text: 'no cell reading', chip: 'no cells', short: '—' };
  const lo = cs ? Math.min(...cs) : null, hi = cs ? Math.max(...cs) : null;
  const s = read.spreadmV ?? hi - lo;
  if (cs && lo < CELL.low) return { state: 'bad', text: `deeply discharged: lowest cell ${volts(lo)} V`, chip: 'discharged', short: 'discharged' };
  if (cs && hi > CELL.high) return { state: 'bad', text: `a cell over 4.25 V: highest cell ${volts(hi)} V`, chip: 'cell too high', short: 'too high' };
  if (s > SPREAD.weak) return { state: 'bad', text: `weak cell (${s} mV apart)`, chip: 'weak cell', short: 'weak' };
  if (read.verdict === 'bad') return { state: 'bad', text: `Cellmate calls it bad (${s} mV apart)`, chip: 'weak cell', short: 'weak' };
  if (s > SPREAD.watch || read.verdict === 'watch') return { state: 'warn', text: `watch it (${s} mV apart)`, chip: 'watch', short: 'watch' };
  return { state: 'ok', text: `balanced (${s} mV apart)`, chip: 'balanced', short: 'ok' };
}

// Which cells to mark low: the lowest, when the spread is past balanced, and any under 2.5 V.
export function lowCells(cells) {
  if (!cells?.length) return [];
  const lo = Math.min(...cells), hi = Math.max(...cells);
  return cells.map(mv => (mv === lo && hi - lo > SPREAD.watch) || mv < CELL.low);
}

// The lowest cell or cells by number, when any cell is marked low: 'cell 2', 'cells 1 and 3'.
export function lowest(cells) {
  if (!lowCells(cells).some(Boolean)) return '';
  const lo = Math.min(...cells), n = cells.map((mv, i) => mv === lo ? i + 1 : 0).filter(Boolean);
  return n.length === 1 ? `cell ${n[0]}` : `cells ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

export const when = r => r.at || r._updated || 0;

// Readings for one pack, newest first.
export function readsFor(pack, reads) {
  if (!pack.rom) return [];
  return reads.filter(r => r.rom === pack.rom).sort((a, b) => when(b) - when(a));
}

// The newest reading whose cell voltages read. Cellmate posts a reading even when the voltages don't read cleanly twice
// in a row (cycles and lock state, no cells), and one of those mustn't hide what the last good one said.
export const hasCells = r => !!r?.cells?.length || r?.spreadmV != null;
export const lastCells = rs => rs.find(hasCells) || null;

// ROM ids Cellmate has read that no pack is linked to yet, newest reading of each. A deleted pack stays in the ledger
// as { id, retired: true, gone: [its rom], goneAt: when } (and a new pack given that number keeps `gone` and `goneAt`),
// so the readings it had aren't offered for linking again; one Cellmate takes after the delete is (the battery
// re-added, or deleted to start over). A `gone` without a time keeps them all out.
export function unpaired(packs, reads) {
  const linked = new Set(packs.map(p => (p.retired ? null : p.rom)).filter(Boolean)), goneAt = {};
  for (const p of packs) for (const rom of p.gone || []) goneAt[rom] = Math.max(goneAt[rom] ?? -Infinity, Number(p.goneAt) || Infinity);
  const out = {};
  for (const r of reads) if (r.rom && !linked.has(r.rom) && !(when(r) <= (goneAt[r.rom] ?? -Infinity)) && (!out[r.rom] || when(r) > when(out[r.rom]))) out[r.rom] = r;
  return Object.values(out).sort((a, b) => when(b) - when(a));
}

// ---- linking a pack to the battery inside it (its ROM id)
const live = packs => packs.filter(p => !p.retired);
const newestOf = reads => { const out = {}; for (const r of reads) if (r.rom && (!out[r.rom] || when(r) > when(out[r.rom]))) out[r.rom] = r; return out; };

// What Link to Cellmate offers a pack, each battery by its newest reading: those no pack is linked to first, newest
// first (unpaired's rule, so a deleted pack's battery is offered only from a reading taken after the delete), then
// those on another pack (picking one moves it here), then this pack's own. A retired pack is never "another pack".
// [{ rom, read, on: null (no pack) | 'here' | the other pack's id }]; [] when Cellmate has read nothing.
export function linkChoices(packs, reads, packId) {
  const all = live(packs), me = all.find(p => p.id === packId), latest = newestOf(reads), seen = new Set();
  const free = unpaired(packs, reads).map(r => ({ rom: r.rom, read: r, on: null }));
  const taken = all.filter(p => p.id !== packId && p.rom && latest[p.rom] && p.rom !== me?.rom)
    .map(p => ({ rom: p.rom, read: latest[p.rom], on: p.id })).sort((a, b) => when(b.read) - when(a.read))
    .filter(c => !seen.has(c.rom) && seen.add(c.rom));
  return [...free, ...taken, ...(me?.rom ? [{ rom: me.rom, read: latest[me.rom] || null, on: 'here' }] : [])];
}

// What picking one does: the packs to save, [] when nothing changes. This pack gets the ROM (none: it's unlinked), and
// any other pack that had it loses it. A model or capacity that came from a link (modelFrom / ahFrom 'link') follows
// the battery: the new reading's, or none once unlinked; one typed in Edit stays.
export function relinkPlan(packs, reads, packId, rom) {
  const all = live(packs), me = all.find(p => p.id === packId);
  if (!me) return [];
  rom = rom || null;
  const others = rom ? all.filter(p => p.id !== packId && p.rom === rom) : [];
  if ((me.rom || null) === rom && !others.length) return [];
  const follow = (p, r) => {
    const { rom: _, ...d } = p;
    if (d.modelFrom === 'link' || !d.model) { delete d.model; delete d.modelFrom; if (r?.model) Object.assign(d, { model: r.model, modelFrom: 'link' }); }
    if (d.ahFrom === 'link' || !(d.ah > 0)) { delete d.ah; delete d.ahFrom; if (r?.capAh > 0) Object.assign(d, { ah: r.capAh, ahFrom: 'link' }); }
    return d;
  };
  return [...others.map(p => follow(p, null)), { ...follow(me, rom ? newestOf(reads)[rom] : null), ...(rom ? { rom } : {}) }];
}

// The open loan for a pack, if it's out.
export const openLoan = (pack, loans) => loans.filter(l => l.pack === pack.id && !l.back).sort((a, b) => String(b.out).localeCompare(String(a.out)))[0] || null;

// How long a loan has been out, in whole days on the calendar, and in the kit's words: 'today', '3 days', '9 wk',
// '2 mo' (spelled out on the pack's page: '9 weeks', '2 months'). From LONG_LOAN days it's out over a month: day 32, the
// first the kit says '5 wk', and past any month's length (at 30 and 31 days the row still says '4 wk').
export const LONG_LOAN = 32;
export const loanDays = (loan, now = new Date()) => daysSince(loan.out, now);
export const loanAge = (loan, now = new Date()) => ageText(loan.out, now);
export const loanAgeWords = (loan, now = new Date()) => loanAge(loan, now).replace(/ wk$/, ' weeks').replace(/ mo$/, ' months').replace(/ yr$/, ' years');
// The home page's line about what's lent out: those out over a month, by the day they went ('since Nov 15', with the
// year when it isn't this one), and the rest by how long. { long: ['5.0 Ah #2 with Neighbor since Nov 15'],
// lent: ['3.0 Ah to Cousin, 12 days'] }; out: [[pack, its open loan]].
export function lentLines(out, now = new Date()) {
  const name = p => p.label || 'pack ' + p.id;
  const since = day => { const t = dayText(day); return parseDay(day).getFullYear() === now.getFullYear() ? t.replace(/, \d+$/, '') : t; };
  const long = out.filter(([, l]) => loanDays(l, now) >= LONG_LOAN), lent = out.filter(([, l]) => !(loanDays(l, now) >= LONG_LOAN));
  return { long: long.map(([p, l]) => `${name(p)} with ${l.who} since ${since(l.out)}`), lent: lent.map(([p, l]) => `${name(p)} to ${l.who}, ${loanAge(l, now)}`) };
}

// Since when the cycle count has stood where it is now: the oldest of the newest readings with that count.
export function idleSince(rs) {
  let i = 0;
  while (i + 1 < rs.length && rs[i + 1].cycles === rs[0].cycles) i++;
  return rs.length ? when(rs[i]) : null;
}

// Charge cycles per month between the oldest and newest reading (null with under a month of history).
export function cyclesPerMonth(rs) {
  if (rs.length < 2) return null;
  const a = rs[rs.length - 1], b = rs[0];
  const months = (when(b) - when(a)) / (30.44 * 86400000);
  return months >= 1 ? Math.round(((b.cycles - a.cycles) / months) * 10) / 10 : null;
}
