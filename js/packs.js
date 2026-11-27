// Packrat's arithmetic: which readings belong to which pack, and what the cells say. No DOM: unit-tested.
// A pack's five cells should sit within a few hundredths of a volt of each other. Cellmate (lxt_decode.h) calls a pack
// bad, and won't clear its lock, when a cell is under 2.5 V (deeply discharged: the cells' rated end voltage) or over
// 4.25 V, or the spread is over 100 mV; Packrat says "weak" for the same, so it never reads better than Cellmate does.
export const SPREAD = { watch: 30, weak: 100 };   // mV
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

// ROM ids Cellmate has read that no pack is linked to yet, newest reading of each.
export function unpaired(packs, reads) {
  const linked = new Set(packs.map(p => p.rom).filter(Boolean));
  const out = {};
  for (const r of reads) if (r.rom && !linked.has(r.rom) && (!out[r.rom] || when(r) > when(out[r.rom]))) out[r.rom] = r;
  return Object.values(out).sort((a, b) => when(b) - when(a));
}

// The open loan for a pack, if it's out.
export const openLoan = (pack, loans) => loans.filter(l => l.pack === pack.id && !l.back).sort((a, b) => String(b.out).localeCompare(String(a.out)))[0] || null;

// Charge cycles per month between the oldest and newest reading (null with under a month of history).
export function cyclesPerMonth(rs) {
  if (rs.length < 2) return null;
  const a = rs[rs.length - 1], b = rs[0];
  const months = (when(b) - when(a)) / (30.44 * 86400000);
  return months >= 1 ? Math.round(((b.cycles - a.cycles) / months) * 10) / 10 : null;
}
