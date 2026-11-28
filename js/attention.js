// What Switchboard's front page says about Packrat. Switchboard imports this file from packrat.junkdrawer.works and
// hands it the records it has read from the ledger (read only, with the key it holds), so its lines follow Packrat's
// own rules in packs.js, and names its packs as it does. No DOM and no ledger here: unit-tested in
// test/attention.test.mjs.
// read(coll): that collection's records, deleted ones left out. A link is relative to Packrat's address.
import { health, readsFor, lastCells, openLoan, loanDays, loanAgeWords, LONG_LOAN } from './packs.js';

export const COLLS = ['packs', 'reads', 'loans'];
// The packs as Packrat lists them: a deleted pack's record ({ retired: true }) isn't one.
const packsOf = read => read('packs').filter(p => !p.retired).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

// Needs a look: [{ text, href }], [] when nothing does. Each pack Packrat calls weak, discharged or too high from its
// newest reading whose cells read, then each lent out over a month (Packrat's "Out over a month"), by number:
// 'Packs: 03 weak; 02 out with Neighbor 8 weeks'. The link opens the pack when the line names only one.
export function look(read, now = new Date()) {
  const packs = packsOf(read), reads = read('reads'), loans = read('loans'), named = new Set(), parts = [];
  for (const p of packs) {
    const hl = health(lastCells(readsFor(p, reads)));
    if (hl.state === 'bad') { parts.push(`${p.id} ${hl.short}`); named.add(p.id); }
  }
  for (const p of packs) {
    const l = openLoan(p, loans);
    if (l && loanDays(l, now) >= LONG_LOAN) { parts.push(`${p.id} out with ${l.who} ${loanAgeWords(l, now)}`); named.add(p.id); }
  }
  return parts.length ? [{ text: 'Packs: ' + parts.join('; '), href: named.size === 1 ? '#' + [...named][0] : './' }] : [];
}

// Find anything: every pack, by number, as Packrat's home page lists them: its label (or model), its number and who has
// it when it's lent out ('Pack 02 · out with Neighbor'), opening the pack. texts: its label, model, note, number and
// who has it, which Switchboard matches with the kit's find.js.
const nameOf = p => p.label || p.model || `Pack ${p.id}`;
export function things(read) {
  const loans = read('loans');
  return packsOf(read).map(p => {
    const l = openLoan(p, loans);
    return { name: String(nameOf(p)), where: [`Pack ${p.id}`, l ? `out with ${l.who}` : ''].filter(Boolean).join(' · '), href: '#' + p.id,
      texts: [p.label, p.model, p.note, `pack ${p.id}`, l?.who] };
  });
}

// Check a tag: what each sticker is for, { id: { name, where } }. A pack's sticker: the pack by its label and number, and
// a one-digit sticker with no pack of its own names its 0n pack, as Packrat opens it.
export function tags(read) {
  const packs = packsOf(read), out = Object.fromEntries(packs.map(p => [p.id, { name: String(nameOf(p)), where: `Pack ${p.id}` }]));
  for (const p of packs) if (/^0[0-9]$/.test(p.id) && !out[p.id.slice(1)]) out[p.id.slice(1)] = out[p.id];
  return out;
}
