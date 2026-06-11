import type { CellParams, IndexingResult, IndexingPeakResult } from '../types';

function twoThetaToD(twoTheta: number, wavelength: number): number {
  const theta = twoTheta * Math.PI / 360;
  return wavelength / (2 * Math.sin(theta));
}

function dToTwoTheta(d: number, wavelength: number): number {
  const sinTheta = wavelength / (2 * d);
  if (Math.abs(sinTheta) > 1) return NaN;
  return 2 * Math.asin(sinTheta) * 180 / Math.PI;
}

function matchPeaksToCell(
  expTwoThetas: number[],
  calcDSpacingFn: (h: number, k: number, l: number) => number,
  wavelength: number,
  toleranceDeg: number,
  maxHKL: number
): { peaks: IndexingPeakResult[]; rms: number; matchedPeaks: number; unmatchedCount: number } {
  const calcPeaks: { h: number; k: number; l: number; d: number; tt: number }[] = [];

  for (let h = 0; h <= maxHKL; h++) {
    for (let k = 0; k <= maxHKL; k++) {
      for (let l = 0; l <= maxHKL; l++) {
        if (h === 0 && k === 0 && l === 0) continue;
        const d = calcDSpacingFn(h, k, l);
        if (d <= 0) continue;
        const tt = dToTwoTheta(d, wavelength);
        if (isNaN(tt) || tt <= 0 || tt >= 180) continue;
        calcPeaks.push({ h, k, l, d, tt });
      }
    }
  }

  calcPeaks.sort((a, b) => a.tt - b.tt);

  const sortedExp = expTwoThetas.map((tt, idx) => ({ tt, idx })).sort((a, b) => a.tt - b.tt);
  const peakAssignments: IndexingPeakResult[] = [];
  const usedCalc = new Set<number>();

  for (const expPeak of sortedExp) {
    let bestMatch: { calcIdx: number; delta: number; h: number; k: number; l: number; d: number; tt: number } | null = null;
    for (let ci = 0; ci < calcPeaks.length; ci++) {
      if (usedCalc.has(ci)) continue;
      const calcPeak = calcPeaks[ci];
      const delta = Math.abs(calcPeak.tt - expPeak.tt);
      if (delta > toleranceDeg) continue;
      if (!bestMatch || delta < bestMatch.delta) {
        bestMatch = { calcIdx: ci, delta, ...calcPeak };
      }
    }
    if (bestMatch) {
      peakAssignments.push({
        index: expPeak.idx,
        expTwoTheta: expPeak.tt,
        calcTwoTheta: bestMatch.tt,
        deltaTwoTheta: bestMatch.tt - expPeak.tt,
        h: bestMatch.h,
        k: bestMatch.k,
        l: bestMatch.l,
        dSpacing: bestMatch.d,
      });
      usedCalc.add(bestMatch.calcIdx);
    }
  }

  let rms = 0;
  if (peakAssignments.length > 0) {
    const sumSq = peakAssignments.reduce((s, p) => s + p.deltaTwoTheta * p.deltaTwoTheta, 0);
    rms = Math.sqrt(sumSq / peakAssignments.length);
  }

  return {
    peaks: peakAssignments.sort((a, b) => a.expTwoTheta - b.expTwoTheta),
    rms,
    matchedPeaks: peakAssignments.length,
    unmatchedCount: expTwoThetas.length - peakAssignments.length,
  };
}

function findApproxGCD(values: number[], relTol: number = 0.03): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const smallest = sorted[0];
  let bestQ0 = smallest;
  let bestScore = Infinity;

  for (let n = 1; n <= 12; n++) {
    const q0 = smallest / n;
    if (q0 < 1e-12) continue;

    let score = 0;
    let nMatch = 0;

    for (const v of sorted) {
      const ratio = v / q0;
      const nearestInt = Math.round(ratio);
      if (nearestInt < 1) continue;
      const dev = Math.abs(ratio - nearestInt);
      if (dev / nearestInt > relTol) continue;
      score += dev * dev;
      nMatch++;
    }

    if (nMatch >= Math.min(3, sorted.length) && score < bestScore) {
      bestScore = score;
      bestQ0 = q0;
    }
  }

  if (bestScore === Infinity) return null;
  return bestQ0;
}

function refineCubic(
  twoThetas: number[],
  aInit: number,
  wavelength: number,
  toleranceDeg: number
): { a: number; match: ReturnType<typeof matchPeaksToCell> } {
  let bestA = aInit;
  let bestMatch = matchPeaksToCell(
    twoThetas,
    (h, k, l) => {
      const s = h * h + k * k + l * l;
      return s > 0 ? bestA / Math.sqrt(s) : 0;
    },
    wavelength,
    toleranceDeg,
    25
  );

  let step = 0.1;
  for (let iter = 0; iter < 5; iter++) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const dir of [-1, 1]) {
        const testA = bestA + dir * step;
        if (testA < 1 || testA > 30) continue;
        const m = matchPeaksToCell(
          twoThetas,
          (h, k, l) => {
            const s = h * h + k * k + l * l;
            return s > 0 ? testA / Math.sqrt(s) : 0;
          },
          wavelength,
          toleranceDeg,
          25
        );
        if (m.matchedPeaks > bestMatch.matchedPeaks ||
          (m.matchedPeaks === bestMatch.matchedPeaks && m.rms < bestMatch.rms)) {
          bestMatch = m;
          bestA = testA;
          improved = true;
        }
      }
    }
    step *= 0.1;
  }

  return { a: bestA, match: bestMatch };
}

export function indexCubic(
  twoThetas: number[],
  wavelength: number,
  toleranceDeg: number
): IndexingResult | null {
  if (twoThetas.length < 3) return null;

  const dSpacings = twoThetas.map(tt => twoThetaToD(tt, wavelength));
  const Q = dSpacings.map(d => 1 / (d * d));

  const Q0 = findApproxGCD(Q, 0.08);
  if (!Q0) return null;

  let a = 1 / Math.sqrt(Q0);
  if (a < 1 || a > 30) return null;

  const refined = refineCubic(twoThetas, a, wavelength, toleranceDeg);

  if (refined.match.matchedPeaks < 3) return null;

  return {
    crystalSystem: 'Cubic',
    cell: { a: refined.a, b: refined.a, c: refined.a, alpha: 90, beta: 90, gamma: 90 },
    peaks: refined.match.peaks,
    rms: refined.match.rms,
    matchedPeaks: refined.match.matchedPeaks,
    totalPeaks: twoThetas.length,
  };
}

export function indexTetragonal(
  twoThetas: number[],
  wavelength: number,
  toleranceDeg: number
): IndexingResult | null {
  if (twoThetas.length < 3) return null;

  const dSpacings = twoThetas.map(tt => twoThetaToD(tt, wavelength));
  const Q = dSpacings.map(d => 1 / (d * d));
  const sortedQ = [...Q].sort((a, b) => a - b);

  const candidates: number[] = [];
  for (let i = 0; i < Math.min(sortedQ.length, 10); i++) {
    for (let n = 1; n <= 8; n++) {
      candidates.push(sortedQ[i] / n);
    }
  }

  let bestResult: IndexingResult | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < Math.min(candidates.length, 25); i++) {
    for (let j = 0; j < Math.min(candidates.length, 25); j++) {
      const qa = candidates[i];
      const qc = candidates[j];
      if (qa < 1e-12 || qc < 1e-12) continue;

      const a = 1 / Math.sqrt(qa);
      const c = 1 / Math.sqrt(qc);
      if (a < 1 || a > 30 || c < 1 || c > 30) continue;

      const match = matchPeaksToCell(
        twoThetas,
        (h, k, l) => {
          const invD2 = (h * h + k * k) / (a * a) + (l * l) / (c * c);
          return invD2 > 0 ? 1 / Math.sqrt(invD2) : 0;
        },
        wavelength,
        toleranceDeg,
        15
      );

      const score = match.unmatchedCount * 100 + match.rms;

      if (match.matchedPeaks >= 3 && score < bestScore) {
        bestScore = score;
        bestResult = {
          crystalSystem: 'Tetragonal',
          cell: { a, b: a, c, alpha: 90, beta: 90, gamma: 90 },
          peaks: match.peaks,
          rms: match.rms,
          matchedPeaks: match.matchedPeaks,
          totalPeaks: twoThetas.length,
        };
      }
    }
  }

  return bestResult;
}

export function indexOrthorhombic(
  twoThetas: number[],
  wavelength: number,
  toleranceDeg: number
): IndexingResult | null {
  if (twoThetas.length < 3) return null;

  const dSpacings = twoThetas.map(tt => twoThetaToD(tt, wavelength));
  const Q = dSpacings.map(d => 1 / (d * d));
  const sortedQ = [...Q].sort((a, b) => a - b);

  const candidates: number[] = [];
  for (let i = 0; i < Math.min(sortedQ.length, 8); i++) {
    for (let n = 1; n <= 6; n++) {
      candidates.push(sortedQ[i] / n);
    }
  }

  let bestResult: IndexingResult | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < Math.min(candidates.length, 12); i++) {
    for (let j = i; j < Math.min(candidates.length, 12); j++) {
      for (let k = j; k < Math.min(candidates.length, 12); k++) {
        const qa = candidates[i];
        const qb = candidates[j];
        const qc = candidates[k];
        if (qa < 1e-12 || qb < 1e-12 || qc < 1e-12) continue;

        const a = 1 / Math.sqrt(qa);
        const b = 1 / Math.sqrt(qb);
        const c = 1 / Math.sqrt(qc);
        if (a < 1 || a > 30 || b < 1 || b > 30 || c < 1 || c > 30) continue;

        const match = matchPeaksToCell(
          twoThetas,
          (h, k, l) => {
            const invD2 = h * h / (a * a) + k * k / (b * b) + l * l / (c * c);
            return invD2 > 0 ? 1 / Math.sqrt(invD2) : 0;
          },
          wavelength,
          toleranceDeg,
          10
        );

        const score = match.unmatchedCount * 100 + match.rms;

        if (match.matchedPeaks >= 3 && score < bestScore) {
          bestScore = score;
          bestResult = {
            crystalSystem: 'Orthorhombic',
            cell: { a, b, c, alpha: 90, beta: 90, gamma: 90 },
            peaks: match.peaks,
            rms: match.rms,
            matchedPeaks: match.matchedPeaks,
            totalPeaks: twoThetas.length,
          };
        }
      }
    }
  }

  return bestResult;
}

export function indexHexagonal(
  twoThetas: number[],
  wavelength: number,
  toleranceDeg: number
): IndexingResult | null {
  if (twoThetas.length < 3) return null;

  const dSpacings = twoThetas.map(tt => twoThetaToD(tt, wavelength));
  const Q = dSpacings.map(d => 1 / (d * d));
  const sortedQ = [...Q].sort((a, b) => a - b);

  const candidates: number[] = [];
  for (let i = 0; i < Math.min(sortedQ.length, 10); i++) {
    for (let n = 1; n <= 6; n++) {
      candidates.push(sortedQ[i] / n);
    }
  }

  let bestResult: IndexingResult | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < Math.min(candidates.length, 20); i++) {
    for (let j = 0; j < Math.min(candidates.length, 20); j++) {
      const qa = candidates[i];
      const qc = candidates[j];
      if (qa < 1e-12 || qc < 1e-12) continue;

      const a = 1 / Math.sqrt(qa);
      const c = 1 / Math.sqrt(qc);
      if (a < 1 || a > 30 || c < 1 || c > 30) continue;

      const match = matchPeaksToCell(
        twoThetas,
        (h, k, l) => {
          const invD2 = (4 / 3) * (h * h + h * k + k * k) / (a * a) + (l * l) / (c * c);
          return invD2 > 0 ? 1 / Math.sqrt(invD2) : 0;
        },
        wavelength,
        toleranceDeg,
        10
      );

      const score = match.unmatchedCount * 100 + match.rms;

      if (match.matchedPeaks >= 3 && score < bestScore) {
        bestScore = score;
        bestResult = {
          crystalSystem: 'Hexagonal',
          cell: { a, b: a, c, alpha: 90, beta: 90, gamma: 120 },
          peaks: match.peaks,
          rms: match.rms,
          matchedPeaks: match.matchedPeaks,
          totalPeaks: twoThetas.length,
        };
      }
    }
  }

  return bestResult;
}

export function indexMonoclinic(
  twoThetas: number[],
  wavelength: number,
  toleranceDeg: number
): IndexingResult | null {
  if (twoThetas.length < 3) return null;

  const dSpacings = twoThetas.map(tt => twoThetaToD(tt, wavelength));
  const Q = dSpacings.map(d => 1 / (d * d));
  const sortedQ = [...Q].sort((a, b) => a - b);

  const candidates: number[] = [];
  for (let i = 0; i < Math.min(sortedQ.length, 6); i++) {
    for (let n = 1; n <= 4; n++) {
      candidates.push(sortedQ[i] / n);
    }
  }

  let bestResult: IndexingResult | null = null;
  let bestScore = Infinity;

  const betaValues = [80, 85, 90, 95, 100, 105, 110, 115, 120];

  for (let i = 0; i < Math.min(candidates.length, 6); i++) {
    for (let j = i; j < Math.min(candidates.length, 6); j++) {
      for (let k = j; k < Math.min(candidates.length, 6); k++) {
        const qa = candidates[i];
        const qb = candidates[j];
        const qc = candidates[k];
        if (qa < 1e-12 || qb < 1e-12 || qc < 1e-12) continue;

        const a = 1 / Math.sqrt(qa);
        const b = 1 / Math.sqrt(qb);
        const c = 1 / Math.sqrt(qc);
        if (a < 1 || a > 30 || b < 1 || b > 30 || c < 1 || c > 30) continue;

        for (const beta of betaValues) {
          const match = matchPeaksToCell(
            twoThetas,
            (h, k, l) => {
              const betaRad = beta * Math.PI / 180;
              const sinBeta = Math.sin(betaRad);
              const cosBeta = Math.cos(betaRad);
              const invD2 = (h * h) / (a * a * sinBeta * sinBeta) +
                (k * k) / (b * b) +
                (l * l) / (c * c * sinBeta * sinBeta) +
                (2 * h * l * cosBeta) / (a * c * sinBeta * sinBeta);
              return invD2 > 0 ? 1 / Math.sqrt(invD2) : 0;
            },
            wavelength,
            toleranceDeg,
            6
          );

          const score = match.unmatchedCount * 100 + match.rms;

          if (match.matchedPeaks >= 3 && score < bestScore) {
            bestScore = score;
            bestResult = {
              crystalSystem: 'Monoclinic',
              cell: { a, b, c, alpha: 90, beta, gamma: 90 },
              peaks: match.peaks,
              rms: match.rms,
              matchedPeaks: match.matchedPeaks,
              totalPeaks: twoThetas.length,
            };
          }
        }
      }
    }
  }

  return bestResult;
}

export function indexPeaks(
  twoThetasInput: number[],
  wavelength: number,
  toleranceDeg: number = 0.05
): { result: IndexingResult | null; bestCandidate: IndexingResult | null } {
  const twoThetas = twoThetasInput.filter(t => t > 0 && t < 180).sort((a, b) => a - b);

  if (twoThetas.length < 3) {
    return { result: null, bestCandidate: null };
  }

  const systems = [
    { name: 'Cubic', fn: indexCubic },
    { name: 'Tetragonal', fn: indexTetragonal },
    { name: 'Orthorhombic', fn: indexOrthorhombic },
    { name: 'Hexagonal', fn: indexHexagonal },
    { name: 'Monoclinic', fn: indexMonoclinic },
  ];

  let bestCandidate: IndexingResult | null = null;
  let bestCandidateScore = Infinity;

  for (const system of systems) {
    const result = system.fn(twoThetas, wavelength, toleranceDeg);

    if (result) {
      const score = result.rms + (result.totalPeaks - result.matchedPeaks) * toleranceDeg * 3;

      if (!bestCandidate || score < bestCandidateScore) {
        bestCandidateScore = score;
        bestCandidate = result;
      }

      if (result.matchedPeaks === twoThetas.length && result.rms <= toleranceDeg * 3) {
        return { result, bestCandidate: result };
      }
    }
  }

  return { result: null, bestCandidate };
}

export function parseTwoThetaInput(text: string): number[] {
  const lines = text.split('\n');
  const results: number[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const val = parseFloat(trimmed);
    if (!isNaN(val) && val > 0 && val < 180) {
      results.push(val);
    }
  }
  return results;
}

export function getHighestSymmetrySpaceGroup(crystalSystem: string): number {
  const mapping: Record<string, number> = {
    'Cubic': 221,
    'Tetragonal': 123,
    'Orthorhombic': 47,
    'Hexagonal': 191,
    'Trigonal': 162,
    'Monoclinic': 12,
    'Triclinic': 2,
  };
  return mapping[crystalSystem] || 221;
}
