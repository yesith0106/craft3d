// Wooting's own 80HE CAD (mm, the CAD frame: plate top at y = 0, x right, z toward the typist, x = 0 the case centre).
// Exported from the STEP with tools/step2mesh.py and packed with tools/cadpack.mjs; see LICENSE-CAD.md.
import {unpackCad} from '../craft/cad.js';
import {DATA, HEAD} from './cad-data.js';

export const {PARTS, BOXES, part} = await unpackCad(HEAD, DATA);
