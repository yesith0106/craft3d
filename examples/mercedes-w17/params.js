// Mercedes-AMG F1 W17 E Performance (2026): the dimension sheet. Everything in mm.
// Car frame: s = behind the front axle line (XF in the FIA text), h = above the ground, x = to the left of the
// centre plane. The FIA reference plane (Z = 0, the top of the plank) sits RH above the ground, so h = Z + RH.
//
// Tags: [reg]   FIA 2026 F1 Regulations, Section C (Technical), Issue 17, 28 Apr 2026 - article or appendix volume
//       [spec]  published by Mercedes-AMG F1 / Pirelli
//       [photo] measured off Mercedes' launch renders: side view (formula1.com "KA 10", 3.80 mm/px at the near wheels,
//               4.05 mm/px on the centre plane, scale from the 3400 wheelbase, checked on the 705 front tyre: 186 px =
//               707 mm) and top view (the-race.com "GR 12", 3.09 mm/px, checked on the 1900 width: 618 px = 1910 mm)
//       [std]   a standard size      [est] estimated, nothing better found
//
// Sources
//   FIA regs   https://api.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_17_-_2026-04-28.pdf
//   W17 specs  https://www.mercedesamgf1.com/f1-w17-2026-technical-specifications   (width 1900, height 970, 772 kg, push-rod front AND rear)
//   tyres      https://www.mercedesamgf1.com/news/what-are-the-tyre-options-for-the-2026-british-gp   (front 705 x 280, rear 710 x 375, 18")
//   photos     https://www.formula1.com/en/latest/article/tech-analysis-have-mercedes-pioneered-a-left-field-solution-with-their-new.6fpytwTL29cap2mrQuAEdc
//              https://www.the-race.com/formula-1/mercedes-f1-2026-car-w17-gary-anderson-verdict/
//
// One number by hand: front wing endplate rear edge. The regulation trims the endplate with a 925 mm cylinder about
// the front axle at Z = 360 (app. C2 23.3): radius 462.5, so at axle height the plate must stop 462 mm ahead of the
// axle. The side render puts that edge at px 295 -> 1512 + (295 - 800) x 3.8 = -407 mm at the plate's top corner
// (h 406 = Z 366): the photo's plate ends where the regulation cylinder allows at its lower edge, as built here.
export const P = {
  // ---- envelope
  wheelbase: 3400, // [reg] C2.3.5 maximum
  width: 1900, // [reg] C2.3.1: nothing beyond 950 from the centre plane; [spec] Mercedes: 1900
  RH: 40, // [est] static ride height of the reference plane (plank underside at 30)
  noseTip: -1150, // [photo] top view -1190, side view -1090 (parallax between them): mean. [reg] limit XF = -1300
  tailEnd: 4140, // [reg] RV-TAIL ends XDIF = 760 behind the final drive; the rear light sits on it
  rollHoopZ: 970, // [reg] RV-ROLL-HOOP top Z = 970; [spec] Mercedes "height 970 mm"; [photo] airbox top 993 above ground
  mass: 772, // [spec] Mercedes (regulation minimum 768 kg)
  // ---- wheels and tyres
  tyreF: {D: 705, W: 280}, // [spec] Pirelli 2026 front
  tyreR: {D: 710, W: 375}, // [spec] Pirelli 2026 rear
  rimD: 457.2, // [std] 18 inch bead seat
  trackF: 1620, // [reg-derived] 1900 - 280: tyres flush with the maximum width
  trackR: 1525, // [reg-derived] 1900 - 375
  // ---- cockpit datum
  XC: 1850, // [photo] rear edge of the cockpit opening / roll hoop front: airbox inlet at s 1804..1829. [reg] C2.4: XA..XC 1830..2030
  // ---- front wing (app. C2 21-27, C3.10)
  fw: {
    span: 640, // [reg] profiles out to Y = 675, endplate body Y 575..680; [photo] flap tips at 581
    foot: 895, // [reg] outer footplate to Y = 900; [photo] 857
    elements: 3, // [reg] C3.10.1(b) up to three; [photo] three
  },
  // ---- rear wing (app. C2 30-32, C3.11)
  rw: {
    half: 555, // [reg] profiles to Y = 575; [photo] 555
    topZ: 880, // [reg] RV-RW-PROFILES top
    le: 178, te: 620, // [reg] XR 165..630; [photo] 167..645
    elements: 3, // [reg] C3.11.1(b); no beam wing in 2026
  },
  // ---- floor (app. C2 4-11)
  floor: {
    halfFront: 760, halfRear: 700, // [reg] 770 at XF 1100 tapering to 700 at XR -335; [photo] 633..650 visible ahead of the rear tyre
    boardS: [690, 1290], boardH: [170, 335], // [reg] RV-FLOOR-BOARD XF 650..1350, Z 70..450; [photo] s 676..1303, h 167..338
    plankHalf: 125, plankT: 10, // [reg] RV-PLANK
    diffStart: 2800, diffEnd: 3700, diffExitZ: 250, // [reg] 4.5: Z 75 at XR -600, 175 at XR -350, 250 at XR +300
  },
};
