// Packrat's arithmetic: which readings belong to which pack, and what the cell spread says. No DOM: unit-tested.
// A pack's five cells should sit within a few hundredths of a volt of each other; Cellmate calls a spread over
// 100 mV unsafe to clear, which is where Packrat says "weak".
export const SPREAD = { watch: 30, weak: 100 };   // mV

export function health(read) {
  if (!read || read.spreadmV == null) return { state: 'none', text: 'no cell reading' };
  const s = read.spreadmV;
  return s > SPREAD.weak ? { state: 'bad', text: `weak cell (${s} mV apart)` }
    : s > SPREAD.watch ? { state: 'warn', text: `watch it (${s} mV apart)` }
    : { state: 'ok', text: `balanced (${s} mV apart)` };
}

export const when = r => r.at || r._updated || 0;

// Readings for one pack, newest first.
export function readsFor(pack, reads) {
  if (!pack.rom) return [];
  return reads.filter(r => r.rom === pack.rom).sort((a, b) => when(b) - when(a));
}

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
