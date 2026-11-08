// Wooting 80HE (ANSI): the numbers, no three.js. Everything the drawing shows reads from here or from Wooting's CAD.
//   [spec]  wooting.io/wooting-80he, Technical Specifications (Nov 2026)
//   [cad]   Wooting's published assembly, WootingKb/wooting-design/wooting-80he (ANSI, 2024-12-06), measured
//   [photo] Wooting's orthographic top render, 80he-prebuilt-ANSI (346 mm = 2138 px)
//   [std]   MX / keycap industry standard     [est] estimated, said so
// CAD frame: plate top y = 0, x right (x = 0 the case centre), z toward the typist, mm.
export const U = 19.05; // [std] one key unit

export const SPEC = {
  length: 346, // [spec] 346 x 142 (CAD 346.37 x 142.83)
  depth: 142,
  hFront: 19.4, // [spec] front case height, no keycaps
  hFrontCaps: 28.4, // [spec] front height with OEM keycaps
  massAbs: 790, // [spec] g
  massZinc: 2160,
  feet: [2.8, 6, 10], // [spec] degrees
  travel: 4.0, // [spec] Lekker L60 V2
  switch: 'Lekker L60 V2',
};

// ------------------------------------------------------------------ layout [cad + photo]
// [x0, width] in u, the row's top edge in u, the OEM profile row. F-row 0.25u gaps after Esc, F4, F8, F12 and Mode;
// 0.25u between the F-row and the number row; nav column at 15.25u; the arrow cluster starts 0.5u after Fn.
const row = (y, keys, r) => keys.map(([x, w, l]) => ({x, w, y, l, r}));
const seq = (x, list) => list.map(([w, l]) => {
  const k = [x, w, l];
  x += w;
  return k;
});
export const KEYS = [
  ...row(0, [[0, 1, 'Esc'], ...seq(1.25, [[1, 'F1'], [1, 'F2'], [1, 'F3'], [1, 'F4']]), ...seq(5.5, [[1, 'F5'], [1, 'F6'], [1, 'F7'], [1, 'F8']]), ...seq(9.75, [[1, 'F9'], [1, 'F10'], [1, 'F11'], [1, 'F12']]), [14, 1, 'Mode'], [15.25, 1, 'Prt Sc'], [16.25, 1, 'Pause']], 1),
  ...row(1.25, [...seq(0, [[1, '`'], [1, '1'], [1, '2'], [1, '3'], [1, '4'], [1, '5'], [1, '6'], [1, '7'], [1, '8'], [1, '9'], [1, '0'], [1, '-'], [1, '='], [2, 'Backspace']]), [15.25, 1, 'Ins'], [16.25, 1, 'Pg Up']], 1),
  ...row(2.25, [...seq(0, [[1.5, 'Tab'], [1, 'Q'], [1, 'W'], [1, 'E'], [1, 'R'], [1, 'T'], [1, 'Y'], [1, 'U'], [1, 'I'], [1, 'O'], [1, 'P'], [1, '['], [1, ']'], [1.5, '\\']]), [15.25, 1, 'Del'], [16.25, 1, 'Pg Dn']], 2),
  ...row(3.25, seq(0, [[1.75, 'Caps'], [1, 'A'], [1, 'S'], [1, 'D'], [1, 'F'], [1, 'G'], [1, 'H'], [1, 'J'], [1, 'K'], [1, 'L'], [1, ';'], [1, "'"], [2.25, 'Enter']]), 3),
  ...row(4.25, [...seq(0, [[2.25, 'Shift'], [1, 'Z'], [1, 'X'], [1, 'C'], [1, 'V'], [1, 'B'], [1, 'N'], [1, 'M'], [1, ','], [1, '.'], [1, '/'], [2.75, 'Shift']]), [15.25, 1, '↑']], 4),
  ...row(5.25, [...seq(0, [[1.25, 'Ctrl'], [1.25, 'Win'], [1.25, 'Alt'], [6.25, ''], [1.25, 'Alt'], [1.25, 'Ctrl'], [1.25, 'Fn']]), [14.25, 1, '←'], [15.25, 1, '↓'], [16.25, 1, '→']], 4),
];
export const GRID = {w: 17.25, h: 6.25}; // u
// the key field in the CAD frame [cad]: centred in x; row centres at z = -50.01 ... 50.01
export const FIELD = {x0: -(GRID.w * U) / 2, z0: -50.01 - U / 2};
export const ux = (u) => FIELD.x0 + u * U;
export const vz = (v) => FIELD.z0 + v * U;
/** a key's centre, CAD frame */
export const keyXZ = (k) => [ux(k.x + k.w / 2), vz(k.y + 0.5)];

// ------------------------------------------------------------------ the stack, CAD frame [cad]
export const STACK = {
  topFace: 7.5, // top case top face above the plate top
  plateT: 1.5, // PC plate
  pcbTop: -5.0, // plate top to PCB top 5.0: the silicone pad fills it
  pcbBot: -6.6, // PCB 1.6
  petBot: -8.0, // PET film 0.35 at -7.65 .. -8.0
  foamBot: -9.6, // EPDM foam 3.0 at -6.6 .. -9.6
  housingTop: 6.6, // [std] MX top housing above the plate top
  housingBelow: 5.0, // [std] bottom housing below the plate top: it lands on the PCB
  stemTop: 10.2, // [std] cross stem top above the plate top, at rest
  capSeat: 6.2, // [std] keycap skirt bottom above the plate top, at rest
};

// keycaps: Wooting's stock caps are OEM profile [spec: "28.4 mm with OEM keycap"; reviews]. Typical OEM row heights
// (top centre above the skirt) and top slopes [est]; the model scales them so the bottom row lands on the spec's 28.4.
export const CAP = {
  base: 18.1, // [std] 1u footprint (19.05 pitch less a 0.95 gap)
  rows: {1: {h: 11.3, tilt: -8}, 2: {h: 9.8, tilt: -4}, 3: {h: 9.1, tilt: -1}, 4: {h: 9.6, tilt: 6}}, // tilt: + rises toward the typist
};

/** stabilisers [cad]: 2u and up; the 6.25u spacebar 100 mm apart, 2-2.75u 23.8 mm */
export function stabSpan(w) {
  if (w >= 6) return 100;
  if (w >= 2) return 23.8;
  return 0;
}

export function selfTest() {
  const ok = [];
  ok.push(['84 keys', KEYS.length === 84]);
  // the CAD stabiliser centres [cad bounding boxes] against the layout: LShift -142.88, RShift 95.25, Enter 100.01,
  // Backspace 102.39, Space -33.34
  const at = (l, i = 0) => keyXZ(KEYS.filter((k) => k.l === l)[i])[0];
  const want = [['Shift', 0, -142.88], ['Shift', 1, 95.25], ['Enter', 0, 100.01], ['Backspace', 0, 102.39], ['', 0, -33.335]];
  for (const [l, i, x] of want) ok.push([`${l || 'Space'} x ${at(l, i).toFixed(2)} vs CAD ${x}`, Math.abs(at(l, i) - x) < 0.03]);
  return {pass: ok.every(([, v]) => v), checks: ok.map(([s, v]) => `${v ? 'ok ' : 'BAD'} ${s}`)};
}
