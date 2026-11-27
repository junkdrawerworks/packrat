// Packrat: a sticker on every Makita pack. Tap it for the pack's health over time (from Cellmate's readings),
// its charge count, and who has it when it's lent out.
import { $, h, mount, toast, sheet, confirmSheet, route, go, dayText, stampText, today, buzz } from './kit/ui.js';
import { Ledger, watchConnectLinks } from './kit/ledger.js';
import { tagUrl, newId } from './kit/tags.js';
import { nfcPanel } from './kit/panel.js';
import { health, readsFor, unpaired, openLoan, cyclesPerMonth, when } from './packs.js';
import { SAMPLE } from './sample.js';

const demo = new URLSearchParams(location.search).has('demo');
watchConnectLinks('packrat', toast);
const ledger = new Ledger('packrat', { demo: demo ? SAMPLE : null });
const app = $('#app');
const packs = () => ledger.docs('packs').sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const reads = () => ledger.docs('reads');
const loans = () => ledger.docs('loans');
const pack = id => ledger.doc('packs', id);
const nextNumber = () => String(Math.max(0, ...packs().map(p => parseInt(p.id, 10) || 0)) + 1).padStart(2, '0');

function cells(r) {
  if (!r?.cells?.length) return null;
  const lo = Math.min(...r.cells), hi = Math.max(...r.cells);
  return h('div', { class: 'cells', 'aria-label': 'Cell voltages' }, r.cells.map((mv, i) =>
    h('div', { class: 'cell' + (mv === lo && hi - lo > 30 ? ' low' : '') }, h('i', {}, h('b', { style: `height:${Math.max(8, Math.min(100, (mv - 3000) / 12))}%` })), h('span', {}, (mv / 1000).toFixed(2)), h('small', {}, i + 1))));
}

function packRow(p) {
  const r = readsFor(p, reads())[0];
  const hl = health(r), loan = openLoan(p, loans());
  return h('li', {}, h('a', { class: 'row', href: '#' + p.id },
    h('span', { class: 'num' }, p.id),
    h('span', { class: 'main' }, h('span', { class: 't' }, p.label || p.model || 'Pack ' + p.id), h('span', { class: 's' }, loan ? `Out with ${loan.who} since ${dayText(loan.out)}` : r ? `${r.cycles} cycles · read ${dayText(today(new Date(when(r))))}` : p.rom ? 'No readings yet' : 'Not linked to Cellmate')),
    h('span', { class: 'chip ' + ({ ok: 'ok', warn: 'warn', bad: 'bad' }[hl.state] || '') }, loan ? 'out' : hl.state === 'none' ? '—' : hl.state === 'ok' ? 'ok' : hl.state === 'warn' ? 'watch' : 'weak')));
}

function renderHome() {
  const out = packs().filter(p => openLoan(p, loans()));
  const loose = unpaired(packs(), reads());
  return [
    out.length ? h('div', { class: 'notice warn' }, h('p', {}, h('b', {}, 'Lent out: '), out.map(p => `${p.label || p.id} (${openLoan(p, loans()).who})`).join(', '))) : null,
    h('ul', { class: 'list' }, packs().map(packRow)),
    !packs().length ? h('p', { class: 'empty' }, ledger.notReady('packs') || 'No packs yet. Number each pack with a marker, then add it here.') : null,
    loose.length ? h('section', { class: 'card' }, h('h2', {}, 'Read by Cellmate, not linked'),
      h('p', { class: 'muted' }, 'Open a pack and press Link to attach its readings.'),
      h('ul', { class: 'plain' }, loose.map(r => h('li', {}, h('code', {}, r.rom), ` ${r.model || ''} ${r.label ? '"' + r.label + '"' : ''} · ${r.cycles} cycles`)))) : null,
    h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn', onclick: () => editPack(null) }, 'Add a pack')),
  ];
}

function renderPack(p) {
  const rs = readsFor(p, reads());
  const r = rs[0], hl = health(r), loan = openLoan(p, loans());
  const cpm = cyclesPerMonth(rs);
  const past = loans().filter(l => l.pack === p.id && l.back).sort((a, b) => String(b.back).localeCompare(String(a.back))).slice(0, 5);
  return [
    h('p', { class: 'crumb' }, h('a', { href: '#' }, '‹ All packs')),
    h('div', { class: 'tape-wrap' }, h('span', { class: 'tape-cap' }, `Pack ${p.id}${p.model ? ' · ' + p.model : ''}`), h('div', { class: 'tape' }, p.label || p.model || 'Pack ' + p.id)),
    loan ? h('div', { class: 'notice warn' }, h('p', {}, h('b', {}, `Out with ${loan.who}`), ` since ${dayText(loan.out)}.`, loan.note ? ' ' + loan.note : '')) : null,
    h('div', { class: 'btns stack' }, loan
      ? h('button', { type: 'button', class: 'btn big', onclick: () => { ledger.put('loans', { ...loan, back: today() }); buzz(50); toast('Back home.'); render(); } }, 'It came back')
      : h('button', { type: 'button', class: 'btn big', onclick: () => lend(p) }, 'Lend it out')),
    r ? h('section', { class: 'card' }, h('h2', {}, 'Last reading'),
      h('p', {}, h('span', { class: 'chip ' + ({ ok: 'ok', warn: 'warn', bad: 'bad' }[hl.state] || '') }, hl.state === 'ok' ? 'balanced' : hl.state === 'warn' ? 'watch' : hl.state === 'bad' ? 'weak cell' : 'no cells'), ` ${stampText(when(r))}`),
      cells(r),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Cells'), h('dd', {}, hl.text),
        h('dt', {}, 'Charge cycles'), h('dd', {}, String(r.cycles) + (cpm != null ? ` (about ${cpm} a month)` : '')),
        r.packmV ? [h('dt', {}, 'Pack'), h('dd', {}, (r.packmV / 1000).toFixed(2) + ' V')] : null,
        r.tempC != null ? [h('dt', {}, 'Temperature'), h('dd', {}, r.tempC + ' °C')] : null,
        h('dt', {}, 'Locked'), h('dd', {}, r.locked ? 'Yes: Cellmate\'s guide covers clearing it' : 'No'),
        r.mfg ? [h('dt', {}, 'Made'), h('dd', {}, r.mfg)] : null))
      : h('div', { class: 'notice' }, h('p', {}, p.rom ? 'No readings yet. Put it on Cellmate while it\'s on your Wi-Fi.' : 'Not linked to Cellmate yet. Read it on Cellmate, then press Link below.')),
    rs.length > 1 ? h('section', {}, h('h2', {}, 'History'), h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Cycles'), h('th', {}, 'Spread'))),
      h('tbody', {}, rs.slice(0, 12).map(x => h('tr', {}, h('td', {}, dayText(today(new Date(when(x))))), h('td', { class: 'm' }, x.cycles), h('td', { class: 'm' }, x.spreadmV != null ? x.spreadmV + ' mV' : '—'))))))) : null,
    past.length ? h('section', {}, h('h2', {}, 'Lent before'), h('ul', { class: 'plain' }, past.map(l => h('li', {}, `${l.who}: ${dayText(l.out)} to ${dayText(l.back)}`)))) : null,
    h('div', { class: 'btns' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => link(p) }, p.rom ? 'Relink to Cellmate' : 'Link to Cellmate'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => editPack(p) }, 'Edit')),
    p.rom ? h('p', { class: 'muted small' }, 'ROM ', h('code', {}, p.rom)) : null,
    nfcPanel(tagUrl('m', p.id), { note: 'On the flat side of the pack, away from the contacts and the release button.' }),
  ];
}

async function lend(p) {
  const people = [...new Set(loans().map(l => l.who))].sort();
  const dl = h('datalist', { id: 'people' }, people.map(n => h('option', { value: n })));
  const v = await sheet({ title: `Lend ${p.label || 'pack ' + p.id}`, ok: 'Lend', body: dl, fields: [
    { name: 'who', label: 'To', required: true, list: 'people' }, { name: 'note', label: 'Note', placeholder: 'With the impact driver' } ] });
  if (!v || v.__danger || !v.who) return;
  ledger.put('loans', { id: newId(6), pack: p.id, who: v.who, note: v.note, out: today(), back: null });
  buzz(50); toast(`Lent to ${v.who}.`); render();
}

async function link(p) {
  const loose = unpaired(packs(), reads());
  if (!loose.length) { toast('Read the pack on Cellmate first (on your Wi-Fi), then try again.', 'bad'); return; }
  const v = await sheet({ title: 'Which reading is this pack?', ok: 'Link', fields: [
    { name: 'rom', label: 'Read by Cellmate', type: 'select', options: loose.map(r => [r.rom, `${stampText(when(r))} · ${r.model || '?'} · ${r.cycles} cycles${r.label ? ' · ' + r.label : ''}`]) } ],
    body: h('p', { class: 'muted' }, 'The newest is at the top. Read just this pack on Cellmate if you\'re not sure.') });
  if (!v || v.__danger || !v.rom) return;
  const r = loose.find(x => x.rom === v.rom);
  ledger.put('packs', { ...p, rom: v.rom, model: p.model || r.model, ah: p.ah || r.capAh });
  toast('Linked.'); render();
}

async function editPack(p) {
  const exists = !!(p && pack(p.id));
  const v = await sheet({ title: exists ? 'Pack ' + p.id : 'New pack', danger: exists ? 'Delete' : null, fields: [
    { name: 'id', label: 'Number', value: p?.id || nextNumber(), inputmode: 'numeric', hint: 'Write it on the pack with a paint pen too.' },
    { name: 'label', label: 'Name', value: p?.label, placeholder: '5.0 Ah #1' },
    { name: 'model', label: 'Model', value: p?.model, placeholder: 'BL1850B' },
    { name: 'bought', label: 'Bought', type: 'date', value: p?.bought },
    { name: 'note', label: 'Note', value: p?.note } ] });
  if (!v) return;
  if (v.__danger) { if (await confirmSheet(`Delete pack ${p.id}?`, 'Its loans and link go; Cellmate\'s readings stay in the ledger.', 'Delete')) { ledger.del('packs', p.id); go('#'); } return; }
  const id = (v.id || nextNumber()).replace(/[^0-9a-z-]/gi, '').toLowerCase() || nextNumber();
  if ((!exists || p.id !== id) && pack(id)) { toast(`There's already a pack ${id}.`, 'bad'); return; }
  if (exists && p.id !== id) ledger.del('packs', p.id);
  ledger.put('packs', { ...(p || {}), id, label: v.label, model: v.model, bought: v.bought, note: v.note });
  go('#' + id); render();
}

function render() {
  const r = route();
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
      !wait ? h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn', onclick: () => editPack({ id: r.id }) }, `Add pack ${r.id}`)) : null];
  } else body = renderHome();
  mount(app, body);
  const st = $('#sync'); st.className = 'sync ' + ledger.state; st.textContent = ledger.statusText();
  document.title = r.view === 'item' && pack(r.id) ? `Pack ${r.id} · Packrat` : 'Packrat';
}
window.addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
ledger.on(() => { const st = $('#sync'); if (st) { st.className = 'sync ' + ledger.state; st.textContent = ledger.statusText(); } });
render();
ledger.keepUp(['packs', 'reads', 'loans'], render);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__packrat = { ledger, render };
