// Bonnie Vale Underground – secondary ventilation survey stations
// Source: FML-UGM-RP-002, June 2026 survey
export const STATIONS = [
  { id: 's1', loc: '1190 RAD E',  fan: '2×110 kW', stn: '1190R02',     csa: 28.7, minQ: 16.0 },
  { id: 's2', loc: '1205 ACC',    fan: '2×110 kW', stn: '1205 ACC VS',  csa: 33.6, minQ: 16.0 },
  { id: 's3', loc: '1220 ACC',    fan: '2×110 kW', stn: '1220A02',     csa: 36.3, minQ: 16.0 },
  { id: 's4', loc: '1220 EWD N',  fan: '2×110 kW', stn: 'Laser loc.',  csa: 22.6, minQ: 16.0 },
  { id: 's5', loc: '1270 ACC',    fan: '2×110 kW', stn: '1270 ACC VS',  csa: 33.9, minQ: 16.0 },
  { id: 's6', loc: '1285 ACC',    fan: '3×90 kW',  stn: '1285 ACC VS',  csa: 39.4, minQ: 16.0 },
  { id: 's7', loc: '1300 EWD',    fan: '3×90 kW',  stn: '1300EWD04',   csa: 24.1, minQ: 16.0 },
  // Portal has a higher minimum Q for truck loading operations (WHS Mines Regs §R656C)
  { id: 's8', loc: 'Portal',      fan: '3×90 kW',  stn: 'BVD03',       csa: 33.0, minQ: 16.0, truckMinQ: 45.0 },
];

export const ACTIVITIES = [
  'No activity', 'Bogger', 'Jumbo drill', 'DDD drilling',
  'Truck loading', 'Service crew', 'Other',
];

export const DEFECT_TYPES = [
  'Worn / torn vent bag', 'Holes in vent bag', 'Air loss at choke',
  'Bag > 30 m from face', 'Fan silencer missing / damaged',
  'Duct damage or blockage', 'Other',
];

export const PRIORITIES = [
  'P1 – Immediate',
  'P2 – Today',
  'P3 – This week',
  'P4 – Next survey',
];

// Primary ventilation fans at Bonnie Vale
export const BV_FANS = [
  'VR3 Fan-A (1.35 MW Howden)',
  'VR3 Fan-B (1.35 MW Howden)',
  'VR6 Fan-1 (1.7 MW AirEng)',
  'VR6 Fan-2 (1.7 MW AirEng)',
  'VR6 Fan-3 (1.7 MW AirEng)',
];

// TARP priority table for primary fan outage (UVCP Table 12, adapted for BV)
export const TARP = [
  { p: 'P1 – Normal',        vr3: '2×88%', vr6: '3×82%', vol: 830, trucks: 14, note: 'Normal ops — 4 trucks below 1620' },
  { p: 'P2 – 1×VR6 off',    vr3: '2×88%', vr6: '2×90%', vol: 800, trucks: 14, note: 'Increase remaining VR6 fans 82→90%' },
  { p: 'P3 – 1×VR3 off',    vr3: '1×95%', vr6: '3×82%', vol: 725, trucks: 13, note: '3 trucks below 1620, call mill control' },
  { p: 'P8 – VR3 off',      vr3: 'OFF',   vr6: '3×82%', vol: 465, trucks:  5, note: '3 trucks < 1620, no firing in Adam' },
  { p: 'P10 – 1×VR6 only',  vr3: 'OFF',   vr6: '1×82%', vol: 185, trucks:  0, note: 'LVs only — no HVs or trucks underground' },
  { p: 'P13 – ALL off',      vr3: 'OFF',   vr6: 'OFF',   vol:   0, trucks:  0, note: 'EVACUATE — all secondary fans OFF' },
];

// ── Pure helpers ──────────────────────────────────────────────────────────────

export const calcQ = (vel, csa, csaOv) => {
  const v = parseFloat(vel), a = parseFloat(csaOv) || csa;
  return v > 0 && a > 0 ? +(v * a).toFixed(1) : null;
};

export const stationById = (id) => STATIONS.find(s => s.id === id);

export const effectiveMinQ = (station, activity) =>
  (station.truckMinQ && activity === 'Truck loading') ? station.truckMinQ : station.minQ;

export const makeReading = (station) => ({
  sid: station.id,
  vel: '', csaOv: '', bar: '', db: '', wb: '',
  o2: '', co: '', co2: '', no2: '', h2s: '',
  act: 'No activity', cmt: '',
  defects: [],
  done: false,
});
