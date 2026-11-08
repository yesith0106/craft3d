# The 80HE CAD in this example

`cad-data.js` is derived from Wooting's published Wooting 80HE assembly,
[WootingKb/wooting-design](https://github.com/WootingKb/wooting-design) (`wooting-80he/wooting_80he_ansi_shared-3d_asm.stp`,
Creo, 2024-12-06), © Wooting Technologies B.V., licensed under the
[CERN Open Hardware Licence Version 2 – Strongly Reciprocal](https://ohwr.org/cern_ohl_s_v2.txt) (CERN-OHL-S-2.0).

What was done to it: the STEP was tessellated with OpenCascade (`tools/step2mesh.py export`), the screws and threaded
inserts were replaced by their bounding boxes (drawn as plain cylinders), the ISO-Enter stabiliser is left out at load,
and positions were quantised to 0.01 mm (`tools/cadpack.mjs`). The derived data stays under CERN-OHL-S-2.0.

Regenerate it:

```
npm run setup:cad                                    # once, in the craft3d repo
PY=.ocp/bin/python
$PY tools/step2mesh.py list    wooting_80he_ansi_shared-3d_asm.stp
$PY tools/step2mesh.py export  wooting_80he_ansi_shared-3d_asm.stp out/w80 \
  --skip INSERT_M2X3MM_1,INSERT_M2X3L_5,SCREW-M2X4_3,SCREW_M2X5_CASE-0SMP200500A100_,SCREW_FLAT_T2_0X4_0L_2,SCREW_M2P6X5P5_SELF-TAPE__8 \
  --coarse STABILIZER-2P_2=0.15:0.8 --coarse STABILIZER-6P25_3=0.15:0.8 --coarse USB-4105_2=0.15:1.0 \
  --coarse 0A8205024H0010-3D_2=0.3:1.2 --coarse YJ-ZH1_5T-1-5Y_3=0.2:1.0 --coarse 80HE_PCB_ANSI_US_8=0.1:0.8 \
  --coarse SILICONE_C-FEET_V4_10_2=0.12:0.6 --coarse SILICONE_C-FEET_V5-6_31=0.12:0.6 --coarse SI-CASE-FEET-PLUG_V5_18=0.1:0.6
node tools/cadpack.mjs out/w80 examples/wooting80he/cad-data.js "Wooting's published 80HE ANSI assembly, CERN-OHL-S-2.0"
```

The keycaps, switches, legends, per-key sensors and LEDs, the cable and all annotations are craft3d's own (MIT, like
the rest of the repo).
