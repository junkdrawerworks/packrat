// Made-up packs, Cellmate readings and loans for the sample mode.
const d = s => Date.parse(s);
export const SAMPLE = {
  'packrat.packs': [
    { id: '01', label: '5.0 Ah #1', model: 'BL1850B', rom: '28F1A20C1A0000E3', bought: '2021-05-02' },
    { id: '02', label: '5.0 Ah #2', model: 'BL1850B', rom: '28F1A20C1B0000A1', bought: '2021-05-02' },
    { id: '03', label: '3.0 Ah', model: 'BL1830B', rom: '2833C1990C0000F0' },
    { id: '04', label: '2.0 Ah compact', model: 'BL1820B' },
  ],
  'packrat.reads': [
    { id: 'r1', rom: '28F1A20C1A0000E3', model: 'BL1850B', cycles: 212, cells: [3912, 3915, 3909, 3911, 3914], spreadmV: 6, packmV: 19561, tempC: 19.8, locked: false, mfg: '2021-03-11', at: d('2026-11-20T17:00:00Z') },
    { id: 'r2', rom: '28F1A20C1A0000E3', model: 'BL1850B', cycles: 180, cells: [3901, 3906, 3899, 3904, 3903], spreadmV: 7, at: d('2026-06-02T17:00:00Z') },
    { id: 'r3', rom: '28F1A20C1B0000A1', model: 'BL1850B', cycles: 233, cells: [3870, 3866, 3790, 3868, 3871], spreadmV: 81, packmV: 19265, tempC: 20.4, locked: false, mfg: '2021-03-11', at: d('2026-11-20T17:05:00Z') },
    { id: 'r4', rom: '2833C1990C0000F0', model: 'BL1830B', cycles: 409, cells: [3700, 3560, 3712, 3705, 3709], spreadmV: 152, packmV: 18386, tempC: 21.0, locked: true, mfg: '2017-08-01', at: d('2026-11-21T10:00:00Z') },
    { id: 'r5', rom: '2833D0110C000044', model: 'BL1860B', cycles: 31, cells: [4010, 4011, 4009, 4012, 4010], spreadmV: 3, label: 'new 6Ah', at: d('2026-11-22T10:00:00Z') },
  ],
  'packrat.loans': [
    { id: 'l1', pack: '02', who: 'Neighbor', note: 'With the leaf blower', out: '2026-11-15', back: null },
    { id: 'l2', pack: '01', who: 'Neighbor', out: '2026-09-01', back: '2026-09-09' },
  ],
};
