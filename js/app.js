// Packrat: a sticker on every Makita pack. Tap it for the pack's health over time (from Cellmate's readings),
// its charge count, and who has it when it's lent out.
import { $, h, mount, toast, sheet, confirmSheet, route, go, dayText, ageText, daysSince, stampText, today, buzz, held, sampleLink, onRoute } from './kit/ui.js';
import { Ledger, watchConnectLinks, refusedLine, STILL_LOADING } from './kit/ledger.js';
import { tagUrl, newId } from './kit/tags.js';
import { nfcPanel } from './kit/panel.js';
import { health, lowCells, lowest, readsFor, lastCells, unpaired, linkChoices, relinkPlan, openLoan, loanAge, loanAgeWords, lentLines, cyclesPerMonth, idleSince, when } from './packs.js';
import { SAMPLE } from './sample.js';

const demo = new URLSearchParams(location.search).has('demo');
watchConnectLinks('packrat', toast);
const ledger = new Ledger('packrat', { demo: demo ? SAMPLE : null });
const app = $('#app');
// A deleted pack is kept as { id, retired: true, gone: [rom] } (see unpaired), out of sight.
const packs = () => ledger.docs('packs').filter(p => !p.retired).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const reads = () => ledger.docs('reads');
const loans = () => ledger.docs('loans');
const pack = id => { const p = ledger.doc('packs', id); return p && !p.retired ? p : null; };
const loose = () => unpaired(ledger.docs('packs'), reads());
const nextNumber = () => String(Math.max(0, ...packs().map(p => parseInt(p.id, 10) || 0)) + 1).padStart(2, '0');
// A new pack waits until this phone has heard from the ledger (before that its copy can't say which numbers are taken,
// and a save would replace the pack another device has under that number, Cellmate link and all), and asks for the
// latest first.
const fresh = then => e => held(e.currentTarget, ledger.catchUp(['packs'])).then(then);

function cells(r) {
  if (!r?.cells?.length) return null;
  const low = lowCells(r.cells), lo = Math.min(...r.cells), v = mv => (mv / 1000).toFixed(2);
  // The low cell says so in words, not only in red (red and green bars are nearly the same lightness), and a screen
  // reader hears the five as one picture: "Cells 1 to 5: 3.70, 3.56 (lowest), 3.71, 3.71, 3.71 volts".
  const said = r.cells.map((mv, i) => v(mv) + (low[i] ? (mv === lo ? ' (lowest)' : ' (low)') : ''));
  return h('div', { class: 'cells', role: 'img', 'aria-label': `Cells 1 to ${r.cells.length}: ${said.join(', ')} volts` }, r.cells.map((mv, i) =>
    h('div', { class: 'cell' + (low[i] ? ' low' : '') }, h('i', {}, h('b', { style: `height:${Math.max(8, Math.min(100, (mv - 3000) / 12))}%` })), h('span', {}, v(mv)), h('small', {}, i + 1),
      low[i] ? h('em', {}, 'low') : null)));
}

// Two moments as days, or with the time when they're the same day.
const apart = (a, b) => { const d = t => dayText(today(new Date(t))); return d(a) === d(b) ? [stampText(a), stampText(b)] : [d(a), d(b)]; };

// A lent pack's row says who has it and for how long, and keeps the health chip beside "out" when the last reading
// says watch it or weak (lending a weak pack mustn't hide that it's weak). The how long stays on one line ("11 days").
const STATE = { ok: 'ok', warn: 'warn', bad: 'bad' };
function packRow(p) {
  const rs = readsFor(p, reads()), r = rs[0];
  const hl = health(lastCells(rs)), loan = openLoan(p, loans());
  return h('li', {}, h('a', { class: 'row', href: '#' + p.id },
    h('span', { class: 'num' }, p.id),
    h('span', { class: 'main' }, h('span', { class: 't' }, p.label || p.model || 'Pack ' + p.id), h('span', { class: 's' }, loan ? [`Out with ${loan.who} · `, h('span', { style: 'white-space:nowrap' }, loanAge(loan))] : r ? `${r.cycles} cycles · read ${dayText(today(new Date(when(r))))}` : p.rom ? 'No readings yet' : 'Not linked to Cellmate')),
    loan ? h('span', { class: 'chip warn' }, 'out') : null,
    !loan || hl.state === 'warn' || hl.state === 'bad' ? h('span', { class: 'chip ' + (STATE[hl.state] || '') }, hl.short) : null));
}

function renderHome() {
  const out = packs().map(p => [p, openLoan(p, loans())]).filter(([, l]) => l), lent = lentLines(out);
  const unlinked = loose(), wait = ledger.notReady('packs');
  return [
    // what's lent out, and what has been out a month or more, by the day it went
    out.length ? h('div', { class: 'notice warn' },
      lent.long.length ? h('p', {}, h('b', {}, 'Out over a month: '), lent.long.join('; ') + '.') : null,
      lent.lent.length ? h('p', {}, h('b', {}, 'Lent out: '), lent.lent.join('; ')) : null) : null,
    h('ul', { class: 'list' }, packs().map(packRow)),
    !packs().length || wait ? h('p', { class: 'empty' }, wait || 'No packs yet. Number each pack with a marker, then add it here.') : null,
    unlinked.length ? h('section', { class: 'card' }, h('h2', {}, 'Read by Cellmate, not linked'),
      h('p', { class: 'muted' }, 'Open a pack and press Link to attach its readings.'),
      h('ul', { class: 'plain' }, unlinked.map(r => h('li', {}, h('code', {}, r.rom), ` ${r.model || ''} ${r.label ? '"' + r.label + '"' : ''} · ${r.cycles} cycles · read ${stampText(when(r))}`)))) : null,
    h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn', disabled: !!wait, onclick: fresh(() => editPack(null)) }, 'Add a pack')),
  ];
}

function renderPack(p) {
  const rs = readsFor(p, reads());
  // the newest reading gives the cycles and the time; the newest one whose voltages read gives the cells and health
  const r = rs[0], c = lastCells(rs), hl = health(c), loan = openLoan(p, loans());
  const cpm = cyclesPerMonth(rs);
  const past = loans().filter(l => l.pack === p.id && l.back).sort((a, b) => String(b.back).localeCompare(String(a.back))).slice(0, 5);
  // what the Edit sheet and Link save about the pack itself
  const ah = p.ah || rs.find(x => x.capAh > 0)?.capAh;
  const mine = [
    p.bought ? [h('dt', {}, 'Bought'), h('dd', {}, dayText(p.bought) + (daysSince(p.bought) >= 1 ? ` · ${ageText(p.bought)}` : ''))] : null,
    ah ? [h('dt', {}, 'Capacity'), h('dd', {}, `${Number(ah).toFixed(1)} Ah`)] : null].filter(Boolean);
  return [
    h('p', { class: 'crumb' }, h('a', { href: '#' }, '‹ All packs')),
    h('div', { class: 'tape-wrap' }, h('span', { class: 'tape-cap' }, `Pack ${p.id}${p.model ? ' · ' + p.model : ''}`), h('div', { class: 'tape' }, p.label || p.model || 'Pack ' + p.id)),
    p.note ? h('p', { class: 'note' }, p.note) : null,
    loan ? h('div', { class: 'notice warn' }, h('p', {}, h('b', {}, `Out with ${loan.who}`), ` since ${dayText(loan.out)} `, h('span', { style: 'white-space:nowrap' }, `(${loanAgeWords(loan)}).`), loan.note ? ' ' + loan.note : '')) : null,
    h('div', { class: 'btns stack' }, loan
      ? h('button', { type: 'button', class: 'btn big', onclick: () => { ledger.put('loans', { ...loan, back: today() }); buzz(50); toast('Back home.'); render(); } }, 'It came back')
      : h('button', { type: 'button', class: 'btn big', onclick: () => lend(p) }, 'Lend it out')),
    r ? h('section', { class: 'card' }, h('h2', {}, 'Last reading'),
      h('p', {}, h('span', { class: 'chip ' + (STATE[hl.state] || '') }, hl.chip), ` ${stampText(when(r))}`),
      c && c !== r ? h('p', { class: 'muted small' }, `Cells didn't read on ${apart(when(r), when(c))[0]}; these are from ${apart(when(r), when(c))[1]}.`) : null,
      cells(c),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Cells'), h('dd', {}, hl.text),
        lowest(c?.cells) ? [h('dt', {}, 'Lowest'), h('dd', {}, `${lowest(c.cells)}, ${(Math.min(...c.cells) / 1000).toFixed(2)} V`)] : null,
        h('dt', {}, 'Charge cycles'), h('dd', {}, String(r.cycles) + (cpm ? ` (about ${cpm} a month)` : cpm === 0 ? ` (none since ${dayText(today(new Date(idleSince(rs))))})` : '')),
        c?.packmV ? [h('dt', {}, 'Pack'), h('dd', {}, (c.packmV / 1000).toFixed(2) + ' V')] : null,
        c?.tempC != null ? [h('dt', {}, 'Temperature'), h('dd', {}, c.tempC + ' °C')] : null,
        h('dt', {}, 'Locked'), h('dd', {}, r.locked ? 'Yes: Cellmate\'s guide covers clearing it' : 'No'),
        r.mfg ? [h('dt', {}, 'Made'), h('dd', {}, r.mfg)] : null, mine))
      : [h('div', { class: 'notice' }, h('p', {}, p.rom ? 'No readings yet. Put it on Cellmate while it\'s on your Wi-Fi.' : 'Not linked to Cellmate yet. Read it on Cellmate, then press Link below.')),
         mine.length ? h('dl', { class: 'facts pack-facts' }, mine) : null],
    rs.length > 1 ? h('section', {}, h('h2', {}, 'History'), h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Cycles'), h('th', {}, 'Spread'))),
      h('tbody', {}, rs.slice(0, 12).map(x => h('tr', {}, h('td', {}, dayText(today(new Date(when(x))))), h('td', { class: 'm' }, x.cycles), h('td', { class: 'm' }, x.spreadmV != null ? x.spreadmV + ' mV' : '—'))))))) : null,
    past.length ? h('section', {}, h('h2', {}, 'Lent before'), h('ul', { class: 'loans' }, past.map(l => h('li', {},
      h('button', { type: 'button', class: 'loan', onclick: () => editLoan(l) }, `${l.who}: ${dayText(l.out)} to ${dayText(l.back)}`))))) : null,
    h('div', { class: 'btns' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => link(p) }, p.rom ? 'Relink to Cellmate' : 'Link to Cellmate'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => editPack(p) }, 'Edit')),
    p.rom ? h('p', { class: 'muted small' }, 'ROM ', h('code', {}, p.rom)) : null,
    nfcPanel(tagUrl('m', p.id), { note: 'On the flat side of the pack, away from the contacts and the release button.',
      sample: !!ledger.demo, tagged: p.tagged, onWritten: () => { ledger.put('packs', { ...(pack(p.id) || p), tagged: today() }); render(); } }),
  ];
}

async function lend(p) {
  const people = [...new Set(loans().map(l => l.who))].sort();
  const dl = h('datalist', { id: 'people' }, people.map(n => h('option', { value: n })));
  const id = newId(6), made = v => ({ id, pack: p.id, who: v.who, note: v.note, out: today(), back: null });
  const v = await sheet({ title: `Lend ${p.label || 'pack ' + p.id}`, ok: 'Lend', body: dl, autofocus: true, check: v => refusedLine(made(v)), fields: [
    { name: 'who', label: 'To', required: true, list: 'people' }, { name: 'note', label: 'Note', placeholder: 'With the impact driver' } ] });
  if (!v || v.__danger || !v.who) return;
  ledger.put('loans', made(v));
  buzz(50); toast(`Lent to ${v.who}.`); render();
}

// A loan from the history, to put right: who, the dates, or gone altogether (lent by mistake).
async function editLoan(l) {
  // Came back cleared: it's out again (a pack marked back by mistake), unless the pack is out on another loan now
  const made = v => ({ ...(ledger.doc('loans', l.id) || l), who: v.who || l.who, out: v.out || l.out, back: v.back || null, note: v.note });
  const check = v => {
    const doc = made(v), other = !doc.back && loans().find(x => x.pack === l.pack && !x.back && x.id !== l.id);
    if (other) return { field: 'back', line: `Pack ${l.pack} is already out with ${other.who}.` };
    if (doc.back && doc.back < doc.out) return { field: 'back', line: 'It can\'t come back before it went out.' };
    return refusedLine(doc);
  };
  const v = await sheet({ title: `Lent to ${l.who}`, danger: 'Delete', check, fields: [
    { name: 'who', label: 'To', value: l.who, required: true },
    { name: 'out', label: 'Went out', type: 'date', value: l.out, required: true },
    { name: 'back', label: 'Came back', type: 'date', value: l.back },
    { name: 'note', label: 'Note', value: l.note } ] });
  if (!v) return;
  if (v.__danger) {
    if (await confirmSheet('Delete this loan?', `${l.who}, ${dayText(l.out)} to ${dayText(l.back)}. It goes from the pack's history.`, 'Delete', { danger: true })) { ledger.del('loans', l.id); toast('Loan deleted.'); render(); }
    return;
  }
  ledger.put('loans', made(v));
  toast('Saved.'); render();
}

// Link to Cellmate: which battery is inside this pack, from every one Cellmate has read. Those no pack has come first;
// one on another pack can be moved here (two packs read before linking can each take the other's reading), and a
// linked pack can be unlinked. The line under the choice says what picking it does.
async function link(p) {
  const choices = linkChoices(ledger.docs('packs'), reads(), p.id);
  if (!choices.length) { toast('Read the pack on Cellmate first (on your Wi-Fi), then try again.', 'bad'); return; }
  const said = c => [c.read ? stampText(when(c.read)) : null, c.read ? `${c.read.cycles} cycles` : null, '…' + c.rom.slice(-4), c.read?.model, c.read?.label,
    c.on === 'here' ? 'linked now' : c.on ? `now on pack ${c.on}: moves here` : null].filter(Boolean).join(' · ');
  const options = choices.map(c => [c.rom, said(c)]);
  if (p.rom) options.push(['', 'None: unlink this pack']);
  const asked = sheet({ title: p.rom ? 'Which battery is in this pack?' : 'Which reading is this pack?', ok: 'Link', fields: [
    { name: 'rom', label: 'Read by Cellmate', type: 'select', value: p.rom || choices[0].rom, options } ],
    body: h('p', { class: 'muted' }, 'The newest is at the top. Read just this pack on Cellmate if you\'re not sure.') });
  const sel = $('dialog[open] #f-rom'), hint = h('small', { class: 'link-hint', 'aria-live': 'polite' });
  const tell = () => {
    const c = choices.find(x => x.rom === sel.value);
    hint.textContent = !c ? 'This pack is left unlinked, and its readings show on the home page as not linked.'
      : c.on === 'here' ? 'Linked to this pack now.' : !c.on ? 'Not linked to any pack yet.'
      : `On pack ${c.on}${pack(c.on)?.label ? ` (${pack(c.on).label})` : ''} now. Linking moves it here, and pack ${c.on} is left unlinked.`;
  };
  sel?.after(hint); sel?.addEventListener('change', tell); if (sel) tell();
  const v = await asked;
  if (!v || v.__danger) return;
  const puts = relinkPlan(ledger.docs('packs'), reads(), p.id, v.rom);
  if (!puts.length) { toast('No change.'); return; }
  for (const d of puts) ledger.put('packs', d);   // the other pack first: it loses the battery, then this one gets it
  const moved = puts.filter(d => d.id !== p.id).map(d => d.id);
  toast(!v.rom ? 'Unlinked.' : moved.length ? `Linked. Pack ${moved.join(' and ')} ${moved.length > 1 ? 'are' : 'is'} unlinked now: open it and link its own reading.` : 'Linked.');
  render();
}

async function editPack(p) {
  // A stub from a sticker's page ({ id } only, no _updated) is a new pack even if that pack has come in since.
  const exists = !!(p?._updated && pack(p.id));
  const number = v => (v.id || nextNumber()).replace(/[^0-9a-z-]/gi, '').toLowerCase() || nextNumber();
  // a Save that can't go keeps the sheet open with everything typed: a number another pack has, or not heard from the ledger yet
  const check = v => {
    const id = number(v);
    if (!pack(id) && !ledger.synced('packs')) return STILL_LOADING;
    if ((!exists || p.id !== id) && pack(id)) return { field: 'id', line: `There's already a pack ${id}.` };
    return refusedLine({ ...(p || {}), id, label: v.label, model: v.model, bought: v.bought, note: v.note });
  };
  const v = await sheet({ title: exists ? 'Pack ' + p.id : 'New pack', danger: exists ? 'Delete' : null, check, fields: [
    { name: 'id', label: 'Number', value: p?.id || nextNumber(), inputmode: 'numeric', hint: exists ? 'The number on its sticker. Changing it needs a new sticker.' : 'Write it on the pack with a paint pen too.' },
    { name: 'label', label: 'Name', value: p?.label, placeholder: '5.0 Ah #1' },
    { name: 'model', label: 'Model', value: p?.model, placeholder: 'BL1850B' },
    { name: 'bought', label: 'Bought', type: 'date', value: p?.bought },
    { name: 'note', label: 'Note', value: p?.note } ] });
  if (!v) return;
  if (v.__danger) {
    if (!await confirmSheet(`Delete pack ${p.id}?`, 'Its loans and link go; Cellmate\'s readings stay in the ledger.', 'Delete', { danger: true })) return;
    // its loans go (a new pack with this number starts with none), and it stays as a retired record so the readings it
    // had aren't offered as "not linked" (a reading taken after now is)
    for (const l of loans().filter(l => l.pack === p.id)) ledger.del('loans', l.id);
    ledger.put('packs', { id: p.id, retired: true, gone: [...new Set([...(p.gone || []), p.rom].filter(Boolean))], goneAt: Date.now() });
    go('#'); return;
  }
  const id = number(v);
  // a pack once deleted under this number keeps its readings out of "not linked" under the new one too
  const was = ledger.doc('packs', id), gone = [...new Set([...(p?.gone || []), ...(was?.retired ? was.gone || [] : [])])];
  const goneAt = Math.max(Number(p?.goneAt) || 0, was?.retired ? Number(was.goneAt) || 0 : 0) || null;
  if (exists && p.id !== id) {                       // renumbered: its loans go with it
    ledger.del('packs', p.id);
    for (const l of loans().filter(l => l.pack === p.id)) ledger.put('loans', { ...l, pack: id });
  }
  // a new number needs a new sticker (the old one still holds the old number): the panel starts as not written
  const { retired, tagged, ...doc } = { ...(p || {}), id, label: v.label, model: v.model, bought: v.bought, note: v.note };
  if (tagged && exists && p.id === id) doc.tagged = tagged;
  if (v.model !== (p?.model || '')) delete doc.modelFrom;          // typed in Edit: it stays through a relink
  ledger.put('packs', gone.length ? { ...doc, gone, goneAt } : doc);
  go('#' + id); render();
}

function render() {
  let r = route();
  // A one-digit number with no pack of its own opens its 0n pack (m/3 is pack 03): a pack typed as 3 on a sheet the
  // 1.0 ledger script wrote is listed as 03 once 1.1 is pasted, and its sticker still holds m/3.
  if (r.view === 'item' && /^[0-9]$/.test(r.id) && !pack(r.id) && pack('0' + r.id)) { history.replaceState(history.state, '', '#0' + r.id); r = route(); }
  if (!ledger.connected) {
    mount(app, h('div', { class: 'card' }, h('h2', {}, 'Connect first'),
      h('p', {}, 'Packrat keeps its packs in your Switchboard ledger. Open Switchboard and press Connect beside Packrat.'),
      h('div', { class: 'btns' }, h('a', { class: 'btn', href: 'https://tag.junkdrawer.works/#apps' }, 'Open Switchboard'), h('a', { class: 'btn ghost', href: '?demo' }, 'Try the sample'))));
    return;
  }
  let body;
  if (r.view === 'item') {
    const p = pack(r.id), wait = ledger.notReady('packs');
    body = p ? renderPack(p) : [h('p', { class: 'crumb' }, h('a', { href: '#' }, '‹ All packs')), h('p', { class: 'empty' }, wait || `No pack ${r.id} yet.`),
      !wait ? h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn', onclick: fresh(() => pack(r.id) ? render() : editPack({ id: r.id })) }, `Add pack ${r.id}`)) : null];
  } else body = renderHome();
  mount(app, body);
  const st = $('#sync'); st.className = 'sync ' + ledger.state; st.textContent = ledger.statusText();
  if (ledger.demo && !$('.sample-out')) st.after(sampleLink());
  document.title = r.view === 'item' && pack(r.id) ? `Pack ${r.id} · Packrat` : 'Packrat';
}
onRoute(render);
ledger.on(() => { const st = $('#sync'); if (st) { st.className = 'sync ' + ledger.state; st.textContent = ledger.statusText(); } });
render();
ledger.keepUp(['packs', 'reads', 'loans'], render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__packrat = { ledger, render };
