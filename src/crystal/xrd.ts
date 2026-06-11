import type { CrystalAtom, CellParams, XRDPattern, XRDPeak, StructureFactorDetail, ReciprocalCell } from '../types';
import { getWasm, fractionalToCartesian } from './symmetry';
import type { SymOp } from '../data/spaceGroups';

const SCATTERING_PARAMS: Record<string, { a: number[]; b: number[]; c: number }> = {
  H: { a: [0.4930, 0.3229, 0.1402, 0.0408], b: [10.5109, 26.1257, 3.1424, 57.7998], c: 0.003038 },
  He: { a: [0.8734, 0.6309, 0.3112, 0.1780], b: [9.1037, 3.3568, 22.9276, 0.9821], c: 0.00644 },
  Li: { a: [1.1282, 0.7508, 0.6175, 0.4653], b: [3.9546, 1.0524, 85.3905, 168.261], c: 0.0377 },
  Be: { a: [1.5919, 1.1278, 0.5391, 0.7029], b: [43.6427, 1.8626, 103.483, 0.542], c: 0.0385 },
  B: { a: [2.0545, 1.3326, 1.0979, 0.7068], b: [23.2185, 1.021, 60.3498, 0.1403], c: -0.1932 },
  C: { a: [2.3100, 1.0200, 1.5886, 0.8650], b: [20.8439, 10.2075, 0.5687, 51.6512], c: 0.2156 },
  N: { a: [12.2126, 3.1322, 2.0125, 1.1663], b: [0.0057, 9.8933, 28.9975, 0.5826], c: -11.529 },
  O: { a: [3.0485, 2.2868, 1.5463, 0.867], b: [13.2771, 5.7011, 0.3239, 32.9089], c: 0.2508 },
  F: { a: [3.5392, 2.6412, 1.5170, 1.0243], b: [10.2825, 4.2944, 0.2615, 26.1476], c: 0.2776 },
  Na: { a: [4.7626, 3.1736, 1.2674, 1.1128], b: [3.285, 8.8422, 0.3136, 129.597], c: 0.676 },
  Mg: { a: [5.4204, 2.1735, 1.2269, 2.3073], b: [2.8275, 79.2611, 0.3808, 7.1937], c: 0.8584 },
  Al: { a: [6.4202, 1.9002, 1.5936, 1.9646], b: [3.0387, 0.7426, 31.5472, 85.0886], c: 1.1151 },
  Si: { a: [6.2915, 3.0353, 1.9891, 1.541], b: [2.4386, 32.3337, 0.6785, 81.6937], c: 1.1407 },
  P: { a: [6.4345, 4.1791, 1.78, 1.4908], b: [1.9067, 27.157, 0.526, 68.1645], c: 1.1149 },
  S: { a: [6.9053, 5.2034, 1.4379, 1.5863], b: [1.4679, 22.2151, 0.2536, 56.172], c: 0.8669 },
  Cl: { a: [11.4604, 7.1964, 6.2556, 1.6455], b: [0.0104, 1.1662, 18.5194, 47.7784], c: -9.5574 },
  K: { a: [8.2186, 7.4398, 1.0519, 0.8659], b: [12.7949, 0.7748, 213.187, 41.6841], c: 1.4228 },
  Ca: { a: [8.6266, 7.3873, 1.5899, 1.0211], b: [10.4421, 0.6599, 85.7484, 178.437], c: 1.3751 },
  Ti: { a: [9.7595, 7.3558, 1.6991, 1.9021], b: [7.8508, 0.5, 35.6338, 116.105], c: 1.2807 },
  Cr: { a: [10.6406, 7.3537, 3.324, 1.4922], b: [6.1038, 0.392, 20.2626, 98.7399], c: 1.1832 },
  Mn: { a: [11.2819, 7.3573, 3.0193, 2.2441], b: [5.3396, 0.3432, 17.8674, 83.7543], c: 1.0896 },
  Fe: { a: [11.7695, 7.3573, 3.5222, 2.3045], b: [4.7611, 0.3072, 15.3535, 76.8805], c: 1.0369 },
  Co: { a: [12.2841, 7.3409, 4.0034, 2.3488], b: [4.2791, 0.2784, 13.5359, 71.1692], c: 0.9956 },
  Ni: { a: [12.8376, 7.292, 4.4438, 2.38], b: [3.8785, 0.2565, 12.1763, 66.3421], c: 1.0341 },
  Cu: { a: [13.338, 7.1676, 5.6158, 1.6735], b: [3.5828, 0.247, 11.3966, 64.8126], c: 1.591 },
  Zn: { a: [14.0743, 7.0318, 5.1652, 2.41], b: [3.2655, 0.2333, 10.3163, 58.7097], c: 1.3041 },
  Ga: { a: [15.2354, 6.7006, 4.3591, 2.9623], b: [3.0669, 0.2412, 10.7805, 61.4135], c: 1.7189 },
  Ge: { a: [16.0816, 6.3747, 3.7068, 3.683], b: [2.8509, 0.2516, 11.4468, 54.7625], c: 2.1313 },
  Br: { a: [17.1789, 5.2358, 5.6377, 3.9851], b: [2.1723, 16.5796, 0.2609, 41.4328], c: 2.9557 },
  Rb: { a: [17.1784, 9.6435, 5.1399, 1.5292], b: [1.7888, 17.3151, 0.2748, 164.934], c: 3.4873 },
  Sr: { a: [17.5663, 9.8184, 5.422, 2.6693], b: [1.6569, 14.0988, 0.2464, 132.376], c: 2.5064 },
  Zr: { a: [17.8765, 10.948, 5.4173, 3.6572], b: [1.4327, 11.2115, 0.3278, 93.5458], c: 2.0693 },
  Mo: { a: [3.7025, 17.2377, 12.8876, 3.7429], b: [0.2772, 1.0958, 11.0041, 61.6584], c: 4.3875 },
  Ag: { a: [19.2808, 16.6885, 4.8045, 1.0463], b: [0.6446, 7.1908, 0.2291, 43.8], c: 5.159 },
  Sn: { a: [19.1889, 19.1005, 4.4585, 2.4663], b: [5.8289, 0.5122, 0.2918, 43.8214], c: 4.7734 },
  I: { a: [20.1472, 18.995, 7.5138, 2.2735], b: [4.347, 0.3814, 0.4179, 43.3042], c: 2.0604 },
  Ba: { a: [20.3361, 19.297, 10.888, 2.6959], b: [3.216, 0.2765, 0.6307, 51.2284], c: 2.766 },
  Au: { a: [16.8819, 18.5913, 25.5582, 5.86], b: [0.4611, 8.6216, 1.4826, 36.3956], c: 12.0658 },
  Pb: { a: [31.0617, 13.0637, 18.442, 5.9696], b: [0.6902, 2.3576, 8.618, 47.2589], c: 13.4118 },
};

function computeF(element: string, s: number): number {
  const p = SCATTERING_PARAMS[element];
  if (!p) return Math.round(element.charCodeAt(0));
  let f = p.c;
  for (let i = 0; i < 4; i++) {
    f += p.a[i] * Math.exp(-p.b[i] * s * s);
  }
  return f;
}

function computeDSpacing(cell: CellParams, h: number, k: number, l: number): number {
  const { a, b, c, alpha, beta, gamma } = cell;
  const al = alpha * Math.PI / 180;
  const be = beta * Math.PI / 180;
  const ga = gamma * Math.PI / 180;
  const cosAl = Math.cos(al), cosBe = Math.cos(be), cosGa = Math.cos(ga);
  const sinAl = Math.sin(al), sinBe = Math.sin(be), sinGa = Math.sin(ga);
  const vol = a * b * c * Math.sqrt(1 - cosAl * cosAl - cosBe * cosBe - cosGa * cosGa + 2 * cosAl * cosBe * cosGa);

  const s11 = b * b * c * c * sinAl * sinAl;
  const s22 = a * a * c * c * sinBe * sinBe;
  const s33 = a * a * b * b * sinGa * sinGa;
  const s12 = a * b * c * c * (cosAl * cosBe - cosGa);
  const s23 = a * a * b * c * (cosBe * cosGa - cosAl);
  const s13 = a * b * b * c * (cosGa * cosAl - cosBe);

  const invD2 = (s11 * h * h + s22 * k * k + s33 * l * l + 2 * s12 * h * k + 2 * s23 * k * l + 2 * s13 * h * l) / (vol * vol);
  if (invD2 <= 0) return 0;
  return 1 / Math.sqrt(invD2);
}

function computeStructureFactor(atoms: CrystalAtom[], h: number, k: number, l: number, sinThetaOverLambda: number): [number, number] {
  let fReal = 0, fImag = 0;
  for (const atom of atoms) {
    const fj = computeF(atom.element, sinThetaOverLambda);
    const dw = Math.exp(-atom.biso * sinThetaOverLambda * sinThetaOverLambda);
    const phase = 2 * Math.PI * (h * atom.x + k * atom.y + l * atom.z);
    fReal += atom.occupancy * fj * dw * Math.cos(phase);
    fImag += atom.occupancy * fj * dw * Math.sin(phase);
  }
  return [fReal, fImag];
}

function lorentzPolarization(twoThetaRad: number): number {
  const sinT = Math.sin(twoThetaRad / 2);
  const cosT = Math.cos(twoThetaRad / 2);
  const cos2T = Math.cos(twoThetaRad);
  return (1 + cos2T * cos2T) / (sinT * sinT * cosT);
}

function extractPointGroup(operations: SymOp[]): number[][][] {
  const unique: number[][][] = [];
  const seen = new Set<string>();
  for (const op of operations) {
    const key = op.rotation.flat().map(v => Math.round(v)).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(op.rotation.map(row => [...row]));
    }
  }
  return unique;
}

export function computeMultiplicityFromOps(h: number, k: number, l: number, operations: SymOp[]): number {
  const pointGroup = extractPointGroup(operations);
  const seen = new Set<string>();
  
  for (const R of pointGroup) {
    const hp = R[0][0] * h + R[0][1] * k + R[0][2] * l;
    const kp = R[1][0] * h + R[1][1] * k + R[1][2] * l;
    const lp = R[2][0] * h + R[2][1] * k + R[2][2] * l;
    const key = `${hp},${kp},${lp}`;
    const keyNeg = `${-hp},${-kp},${-lp}`;
    if (!seen.has(key) && !seen.has(keyNeg)) {
      seen.add(key);
    }
  }
  
  return seen.size;
}

function computeMultiplicity(h: number, k: number, l: number): number {
  if (h === 0 && k === 0 && l === 0) return 0;
  
  const ah = Math.abs(h), ak = Math.abs(k), al = Math.abs(l);
  const zeros = (ah === 0 ? 1 : 0) + (ak === 0 ? 1 : 0) + (al === 0 ? 1 : 0);
  const allEqual = ah === ak && ak === al;
  const twoEqual = (ah === ak && ah !== 0) || (ah === al && ah !== 0) || (ak === al && ak !== 0);
  
  if (zeros === 3) return 1;
  if (zeros === 2) return 6;
  if (zeros === 1) {
    if (twoEqual) return 12;
    return 24;
  }
  if (allEqual) return 8;
  if (twoEqual) return 24;
  return 48;
}

function pseudoVoigt(x: number, center: number, fwhm: number, eta: number): number {
  if (fwhm <= 0) return 0;
  const sigma = fwhm / (2 * Math.sqrt(2 * Math.LN2));
  const gammaL = fwhm / 2;
  const gauss = Math.exp(-(x - center) * (x - center) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  const lorentz = gammaL / (Math.PI * ((x - center) * (x - center) + gammaL * gammaL));
  return eta * lorentz + (1 - eta) * gauss;
}

export function calculateXRDPattern(
  atoms: CrystalAtom[],
  cell: CellParams,
  wavelength: number,
  dMin: number,
  twoThetaMin: number,
  twoThetaMax: number,
  u: number,
  v: number,
  w: number,
  eta: number,
): XRDPattern {
  const wasm = getWasm();
  if (wasm) {
    try {
      const result = wasm.calculate_xrd_pattern(
        JSON.stringify(atoms), JSON.stringify(cell),
        wavelength, dMin, twoThetaMin, twoThetaMax, u, v, w, eta
      );
      return JSON.parse(result);
    } catch (e) {
      console.warn('WASM XRD failed, using JS fallback:', e);
    }
  }

  const maxHKL = 30;
  const peakMap = new Map<string, XRDPeak>();

  for (let h = -maxHKL; h <= maxHKL; h++) {
    for (let k = -maxHKL; k <= maxHKL; k++) {
      for (let l = -maxHKL; l <= maxHKL; l++) {
        if (h === 0 && k === 0 && l === 0) continue;
        const d = computeDSpacing(cell, h, k, l);
        if (d < dMin || d <= 0) continue;
        const sinTheta = wavelength / (2 * d);
        if (Math.abs(sinTheta) > 1) continue;
        const twoTheta = 2 * Math.asin(sinTheta) * 180 / Math.PI;
        if (twoTheta < twoThetaMin || twoTheta > twoThetaMax) continue;

        const s = sinTheta / wavelength;
        const [fReal, fImag] = computeStructureFactor(atoms, h, k, l, s);
        const fSq = fReal * fReal + fImag * fImag;
        const lp = lorentzPolarization(twoTheta * Math.PI / 180);
        const intensity = fSq * lp;

        if (intensity < 1e-10) continue;

        const dKey = d.toFixed(4);
        const existing = peakMap.get(dKey);
        if (existing) {
          existing.intensity += intensity;
          existing.multiplicity += 1;
        } else {
          peakMap.set(dKey, {
            h, k, l, d_spacing: d, two_theta: twoTheta,
            multiplicity: 1, intensity, f_real: fReal, f_imag: fImag,
          });
        }
      }
    }
  }

  let peaks = Array.from(peakMap.values());
  if (peaks.length === 0) return { peaks: [], profile: [] };

  const maxIntensity = Math.max(...peaks.map(p => p.intensity));
  for (const p of peaks) {
    p.intensity = p.intensity / maxIntensity * 100;
  }
  peaks.sort((a, b) => a.two_theta - b.two_theta);

  const profile: [number, number][] = [];
  const step = 0.02;
  for (let tt = twoThetaMin; tt <= twoThetaMax; tt += step) {
    let intensity = 0;
    for (const peak of peaks) {
      const tanPeak = Math.tan(peak.two_theta * Math.PI / 180);
      const peakFwhm = Math.sqrt(Math.max(0.001, u * tanPeak * tanPeak + v * tanPeak + w));
      intensity += peak.intensity * pseudoVoigt(tt, peak.two_theta, peakFwhm, eta);
    }
    profile.push([tt, intensity]);
  }

  return { peaks, profile };
}

export function calculateStructureFactorDetail(
  atoms: CrystalAtom[],
  cell: CellParams,
  h: number, k: number, l: number,
  wavelength: number,
): StructureFactorDetail {
  const wasm = getWasm();
  if (wasm) {
    try {
      const result = wasm.calculate_structure_factor_detail(
        JSON.stringify(atoms), JSON.stringify(cell), h, k, l, wavelength
      );
      return JSON.parse(result);
    } catch (e) { /* fallback */ }
  }

  const d = computeDSpacing(cell, h, k, l);
  const sinTheta = wavelength / (2 * d);
  const s = sinTheta / wavelength;
  const twoTheta = 2 * Math.asin(sinTheta) * 180 / Math.PI;

  const contributions: StructureFactorDetail['atom_contributions'] = [];
  let fRealTotal = 0, fImagTotal = 0;

  for (const atom of atoms) {
    const fj = computeF(atom.element, s);
    const dw = Math.exp(-atom.biso * s * s);
    const phase = 2 * Math.PI * (h * atom.x + k * atom.y + l * atom.z);
    const cr = atom.occupancy * fj * dw * Math.cos(phase);
    const ci = atom.occupancy * fj * dw * Math.sin(phase);
    fRealTotal += cr;
    fImagTotal += ci;
    contributions.push({
      element: atom.element, x: atom.x, y: atom.y, z: atom.z,
      f_j: fj * dw, phase, contrib_real: cr, contrib_imag: ci,
    });
  }

  const mult = computeMultiplicity(h, k, l);
  const fSq = fRealTotal * fRealTotal + fImagTotal * fImagTotal;
  const lp = lorentzPolarization(twoTheta * Math.PI / 180);
  const intensity = fSq * mult * lp;

  return {
    h, k, l, d_spacing: d, two_theta: twoTheta,
    multiplicity: mult, f_real: fRealTotal, f_imag: fImagTotal,
    intensity_percent: intensity, atom_contributions: contributions,
  };
}

export function computeReciprocalCell(cell: CellParams): ReciprocalCell {
  const wasm = getWasm();
  if (wasm) {
    try {
      const result = wasm.compute_reciprocal_cell(cell.a, cell.b, cell.c, cell.alpha, cell.beta, cell.gamma);
      return JSON.parse(result);
    } catch (e) { /* fallback */ }
  }

  const al = cell.alpha * Math.PI / 180;
  const be = cell.beta * Math.PI / 180;
  const ga = cell.gamma * Math.PI / 180;
  const cosAl = Math.cos(al), cosBe = Math.cos(be), cosGa = Math.cos(ga);
  const sinAl = Math.sin(al), sinBe = Math.sin(be), sinGa = Math.sin(ga);
  const vol = cell.a * cell.b * cell.c * Math.sqrt(1 - cosAl * cosAl - cosBe * cosBe - cosGa * cosGa + 2 * cosAl * cosBe * cosGa);

  const aStar = cell.b * cell.c * sinAl / vol;
  const bStar = cell.a * cell.c * sinBe / vol;
  const cStar = cell.a * cell.b * sinGa / vol;
  const cosAlStar = (cosBe * cosGa - cosAl) / (sinBe * sinGa);
  const cosBeStar = (cosAl * cosGa - cosBe) / (sinAl * sinGa);
  const cosGaStar = (cosAl * cosBe - cosGa) / (sinAl * sinBe);

  return {
    a_star: aStar, b_star: bStar, c_star: cStar,
    alpha_star: Math.acos(cosAlStar) * 180 / Math.PI,
    beta_star: Math.acos(cosBeStar) * 180 / Math.PI,
    gamma_star: Math.acos(cosGaStar) * 180 / Math.PI,
  };
}
