# Packrat

**Use it: [packrat.junkdrawer.works](https://packrat.junkdrawer.works/)** (writing stickers needs Chrome on an Android phone)

**A sticker on every Makita pack: tap it for the pack's cell balance and charge cycles over time, and who has it when it's lent out.** Readings come from Cellmate, an ESP32 battery reader that sends each one to the ledger. Packrat matches them to packs by the ROM id inside each battery, so every pack builds a history.

<p align="center">
  <img src="docs/phone-pack.png" width="250" alt="A pack with a weak cell: the five cell voltages, 152 mV apart, 409 cycles.">
  <img src="docs/phone-home.png" width="250" alt="Every pack, with what's lent out at the top.">
</p>

## How it works

- **Health.** The spread between the five cells: under 30 mV is balanced, over 100 mV means a weak cell. A cell under 2.5 V reads **discharged**, and one over 4.25 V **cell too high**, in red whatever the spread: those are Cellmate's own limits, where it calls a pack bad, and Packrat never calls a pack better than Cellmate did.
- **Lending.** One tap to lend, one to mark it back, with who had it and when.
- **Linking.** A new pack is matched to Cellmate's readings once; after that every reading lands on it.
- **Switchboard.** Records live in your Switchboard ledger (a Google Sheet you own), so they follow you between the phone and the laptop. Connect from [tag.junkdrawer.works](https://tag.junkdrawer.works/).

## Running it

It's a static site: plain HTML, CSS and JavaScript, with no build step.

```sh
npx http-server -p 8080 -c-1 .   # then open http://localhost:8080 (add ?demo for sample data)
npm test                         # unit tests, then the page in Chromium with a pretend NFC reader
node tools/make-icons.mjs        # PNG icons from icon.svg
```

GitHub Pages serves it from `main`, `/ (root)`, at its own address (`CNAME`).

### Files

- `js/app.js`: the app.
- `js/packs.js`: readings, health and loans, unit-tested.
- `js/sample.js`: the made-up packs, Cellmate readings and loans for the sample (`?demo`).
- `js/kit/`, `css/kit.css`: the tag apps' shared kit (ledger client, Web NFC, small UI helpers).
- `fonts/`: Barlow, Barlow Condensed and JetBrains Mono (SIL Open Font License), served from here so nothing loads from elsewhere.
- `test/e2e.mjs`, `test/app-checks.mjs`: the page in Chromium, offline included.

