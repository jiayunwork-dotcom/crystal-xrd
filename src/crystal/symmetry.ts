import type { AsymAtom, CrystalAtom, CellParams } from '../types';
import type { SymOp } from '../data/spaceGroups';

let wasm: any = null;

export function getWasm() { return wasm; }

export async function initWasm() {
  try {
    const wasmModule = await import('../../crystal-wasm/pkg/crystal_wasm.js');
    if (wasmModule.default) await wasmModule.default();
    wasm = wasmModule;
    return true;
  } catch (e) {
    console.warn('WASM module not available, using JS fallback:', e);
    return false;
  }
}

export function generateEquivalentPositions(
  atoms: AsymAtom[],
  operations: SymOp[],
  tolerance: number = 0.01
): CrystalAtom[] {
  if (wasm) {
    try {
      const result = wasm.generate_equivalent_positions(
        JSON.stringify(atoms),
        JSON.stringify(operations),
        tolerance
      );
      return JSON.parse(result);
    } catch (e) {
      console.warn('WASM call failed, using JS fallback:', e);
    }
  }
  return generateEquivalentPositionsJS(atoms, operations, tolerance);
}

function generateEquivalentPositionsJS(
  atoms: AsymAtom[],
  operations: SymOp[],
  tolerance: number
): CrystalAtom[] {
  const result: CrystalAtom[] = [];

  for (let asymId = 0; asymId < atoms.length; asymId++) {
    const atom = atoms[asymId];
    for (const op of operations) {
      const nx = op.rotation[0][0] * atom.x + op.rotation[0][1] * atom.y + op.rotation[0][2] * atom.z + op.translation[0];
      const ny = op.rotation[1][0] * atom.x + op.rotation[1][1] * atom.y + op.rotation[1][2] * atom.z + op.translation[1];
      const nz = op.rotation[2][0] * atom.x + op.rotation[2][1] * atom.y + op.rotation[2][2] * atom.z + op.translation[2];

      const fx = modulo1(nx);
      const fy = modulo1(ny);
      const fz = modulo1(nz);

      const isDup = result.some(a =>
        a.element === atom.element &&
        Math.abs(a.x - fx) < tolerance &&
        Math.abs(a.y - fy) < tolerance &&
        Math.abs(a.z - fz) < tolerance
      );

      if (!isDup) {
        result.push({
          element: atom.element,
          x: Math.round(fx * 10000) / 10000,
          y: Math.round(fy * 10000) / 10000,
          z: Math.round(fz * 10000) / 10000,
          occupancy: atom.occupancy,
          biso: atom.biso,
          asymId,
        });
      }
    }
  }

  return result;
}

function modulo1(v: number): number {
  const r = v % 1;
  return r < 0 ? r + 1 : r;
}

export function fractionalToCartesian(fx: number, fy: number, fz: number, cell: CellParams): [number, number, number] {
  const al = cell.alpha * Math.PI / 180;
  const be = cell.beta * Math.PI / 180;
  const ga = cell.gamma * Math.PI / 180;

  const cosAl = Math.cos(al);
  const cosBe = Math.cos(be);
  const cosGa = Math.cos(ga);
  const sinGa = Math.sin(ga);

  const x = cell.a * fx + cell.b * cosGa * fy + cell.c * cosBe * fz;
  const y = cell.b * sinGa * fy + cell.c * (cosAl - cosBe * cosGa) / sinGa * fz;
  const z = cell.c * Math.sqrt(1 - cosAl * cosAl - cosBe * cosBe - cosGa * cosGa + 2 * cosAl * cosBe * cosGa) / sinGa * fz;

  return [x, y, z];
}

export function computeCellVolume(cell: CellParams): number {
  const al = cell.alpha * Math.PI / 180;
  const be = cell.beta * Math.PI / 180;
  const ga = cell.gamma * Math.PI / 180;
  return cell.a * cell.b * cell.c *
    Math.sqrt(1 - Math.cos(al) ** 2 - Math.cos(be) ** 2 - Math.cos(ga) ** 2 + 2 * Math.cos(al) * Math.cos(be) * Math.cos(ga));
}

export function computeDistance(
  a1: CrystalAtom, a2: CrystalAtom, cell: CellParams
): number {
  let dx = a2.x - a1.x;
  let dy = a2.y - a1.y;
  let dz = a2.z - a1.z;
  dx -= Math.round(dx);
  dy -= Math.round(dy);
  dz -= Math.round(dz);
  const [cx1, cy1, cz1] = fractionalToCartesian(a1.x, a1.y, a1.z, cell);
  const [cx2, cy2, cz2] = fractionalToCartesian(a1.x + dx, a1.y + dy, a1.z + dz, cell);
  return Math.sqrt((cx2 - cx1) ** 2 + (cy2 - cy1) ** 2 + (cz2 - cz1) ** 2);
}

export function calculateRmsd(atoms1: CrystalAtom[], atoms2: CrystalAtom[]): number {
  if (atoms1.length !== atoms2.length) return Infinity;
  let sumSq = 0;
  for (let i = 0; i < atoms1.length; i++) {
    sumSq += (atoms1[i].x - atoms2[i].x) ** 2 +
             (atoms1[i].y - atoms2[i].y) ** 2 +
             (atoms1[i].z - atoms2[i].z) ** 2;
  }
  return Math.sqrt(sumSq / atoms1.length);
}

function subtractCentroid(points: number[][]): { points: number[][]; centroid: number[] } {
  const n = points.length;
  const centroid = [0, 0, 0];
  for (const p of points) {
    centroid[0] += p[0];
    centroid[1] += p[1];
    centroid[2] += p[2];
  }
  centroid[0] /= n;
  centroid[1] /= n;
  centroid[2] /= n;
  
  const centered = points.map(p => [p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]]);
  return { points: centered, centroid };
}

function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const result: number[][] = [];
  for (let i = 0; i < m; i++) {
    result[i] = [];
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < p; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function transposeMatrix(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const result: number[][] = [];
  for (let j = 0; j < n; j++) {
    result[j] = [];
    for (let i = 0; i < m; i++) {
      result[j][i] = A[i][j];
    }
  }
  return result;
}

function svd3x3(A: number[][]): { U: number[][]; S: number[]; Vt: number[][] } {
  const AtA = multiplyMatrices(transposeMatrix(A), A);
  
  const a = AtA[0][0], b = AtA[0][1], c = AtA[0][2];
  const d = AtA[1][1], e = AtA[1][2], f = AtA[2][2];
  
  const trace = a + d + f;
  const det = a*(d*f - e*e) - b*(b*f - c*e) + c*(b*e - c*d);
  const normSq = a*a + b*b + c*c + b*b + d*d + e*e + c*c + e*e + f*f;
  
  const p = normSq - trace*trace/3;
  const q = 2*trace*trace*trace/27 - trace*normSq/3 + det;
  
  const phi = Math.acos(-q/2 / Math.sqrt(p*p*p/27));
  const sqrtP = Math.sqrt(p/3);
  
  const lambda1 = trace/3 + 2*sqrtP*Math.cos(phi/3);
  const lambda2 = trace/3 + 2*sqrtP*Math.cos((phi + 2*Math.PI)/3);
  const lambda3 = trace/3 + 2*sqrtP*Math.cos((phi + 4*Math.PI)/3);
  
  const eigenvalues = [lambda1, lambda2, lambda3].sort((a, b) => b - a);
  const S = eigenvalues.map(v => Math.sqrt(Math.max(0, v)));
  
  function findEigenvector(matrix: number[][], lambda: number): number[] {
    const M = matrix.map((row, i) => row.map((val, j) => val - (i === j ? lambda : 0)));
    
    const v1 = [M[0][0], M[0][1], M[0][2]];
    const v2 = [M[1][0], M[1][1], M[1][2]];
    const v3 = [M[2][0], M[2][1], M[2][2]];
    
    let cross = [
      v1[1]*v2[2] - v1[2]*v2[1],
      v1[2]*v2[0] - v1[0]*v2[2],
      v1[0]*v2[1] - v1[1]*v2[0],
    ];
    let mag = Math.sqrt(cross[0]*cross[0] + cross[1]*cross[1] + cross[2]*cross[2]);
    
    if (mag < 1e-10) {
      cross = [
        v1[1]*v3[2] - v1[2]*v3[1],
        v1[2]*v3[0] - v1[0]*v3[2],
        v1[0]*v3[1] - v1[1]*v3[0],
      ];
      mag = Math.sqrt(cross[0]*cross[0] + cross[1]*cross[1] + cross[2]*cross[2]);
    }
    
    if (mag < 1e-10) {
      cross = [
        v2[1]*v3[2] - v2[2]*v3[1],
        v2[2]*v3[0] - v2[0]*v3[2],
        v2[0]*v3[1] - v2[1]*v3[0],
      ];
      mag = Math.sqrt(cross[0]*cross[0] + cross[1]*cross[1] + cross[2]*cross[2]);
    }
    
    if (mag < 1e-10) return [1, 0, 0];
    
    return cross.map(v => v / mag);
  }
  
  const V: number[][] = [];
  for (const lambda of eigenvalues) {
    V.push(findEigenvector(AtA, lambda));
  }
  
  const U: number[][] = [];
  for (let i = 0; i < 3; i++) {
    if (S[i] > 1e-10) {
      const Av = [
        A[0][0]*V[i][0] + A[0][1]*V[i][1] + A[0][2]*V[i][2],
        A[1][0]*V[i][0] + A[1][1]*V[i][1] + A[1][2]*V[i][2],
        A[2][0]*V[i][0] + A[2][1]*V[i][1] + A[2][2]*V[i][2],
      ];
      const mag = Math.sqrt(Av[0]*Av[0] + Av[1]*Av[1] + Av[2]*Av[2]);
      U.push(Av.map(v => v / mag));
    } else {
      const other1 = U[0] || [1, 0, 0];
      const other2 = U[1] || [0, 1, 0];
      const cross = [
        other1[1]*other2[2] - other1[2]*other2[1],
        other1[2]*other2[0] - other1[0]*other2[2],
        other1[0]*other2[1] - other1[1]*other2[0],
      ];
      U.push(cross);
    }
  }
  
  const Ut = transposeMatrix(U);
  const Vt = transposeMatrix(V);
  const detU = U[0][0]*(U[1][1]*U[2][2]-U[1][2]*U[2][1]) - U[0][1]*(U[1][0]*U[2][2]-U[1][2]*U[2][0]) + U[0][2]*(U[1][0]*U[2][1]-U[1][1]*U[2][0]);
  const detV = V[0][0]*(V[1][1]*V[2][2]-V[1][2]*V[2][1]) - V[0][1]*(V[1][0]*V[2][2]-V[1][2]*V[2][0]) + V[0][2]*(V[1][0]*V[2][1]-V[1][1]*V[2][0]);
  
  if (detU * detV < 0) {
    for (let i = 0; i < 3; i++) {
      Vt[2][i] = -Vt[2][i];
    }
    S[2] = -S[2];
  }
  
  return { U, S, Vt };
}

export function kabschAlignment(
  atoms1: CrystalAtom[],
  atoms2: CrystalAtom[],
  cell1: CellParams,
  cell2: CellParams,
): { rmsd: number; rotatedAtoms2: CrystalAtom[]; rotation: number[][]; translation: number[] } {
  const n = Math.min(atoms1.length, atoms2.length);
  
  const P: number[][] = [];
  const Q: number[][] = [];
  
  for (let i = 0; i < n; i++) {
    const c1 = fractionalToCartesian(atoms1[i].x, atoms1[i].y, atoms1[i].z, cell1);
    const c2 = fractionalToCartesian(atoms2[i].x, atoms2[i].y, atoms2[i].z, cell2);
    P.push([...c1]);
    Q.push([...c2]);
  }
  
  const { points: Pcent, centroid: centroidP } = subtractCentroid(P);
  const { points: Qcent, centroid: centroidQ } = subtractCentroid(Q);
  
  const H = multiplyMatrices(transposeMatrix(Pcent), Qcent);
  
  const { U, S, Vt } = svd3x3(H);
  
  const R = multiplyMatrices(Vt, transposeMatrix(U));
  
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const p = Pcent[i];
    const q = Qcent[i];
    const rq = [
      R[0][0]*q[0] + R[0][1]*q[1] + R[0][2]*q[2],
      R[1][0]*q[0] + R[1][1]*q[1] + R[1][2]*q[2],
      R[2][0]*q[0] + R[2][1]*q[1] + R[2][2]*q[2],
    ];
    sumSq += (p[0]-rq[0])**2 + (p[1]-rq[1])**2 + (p[2]-rq[2])**2;
  }
  const rmsd = Math.sqrt(sumSq / n);
  
  const rotatedAtoms2: CrystalAtom[] = [];
  for (let i = 0; i < atoms2.length; i++) {
    const cart = fractionalToCartesian(atoms2[i].x, atoms2[i].y, atoms2[i].z, cell2);
    const qc = [cart[0] - centroidQ[0], cart[1] - centroidQ[1], cart[2] - centroidQ[2]];
    const rq = [
      R[0][0]*qc[0] + R[0][1]*qc[1] + R[0][2]*qc[2],
      R[1][0]*qc[0] + R[1][1]*qc[1] + R[1][2]*qc[2],
      R[2][0]*qc[0] + R[2][1]*qc[1] + R[2][2]*qc[2],
    ];
    const final = [
      rq[0] + centroidP[0],
      rq[1] + centroidP[1],
      rq[2] + centroidP[2],
    ];
    
    const a = cell1.a;
    const b = cell1.b;
    const c = cell1.c;
    const alpha = cell1.alpha * Math.PI / 180;
    const beta = cell1.beta * Math.PI / 180;
    const gamma = cell1.gamma * Math.PI / 180;
    
    const cosAlpha = Math.cos(alpha);
    const cosBeta = Math.cos(beta);
    const cosGamma = Math.cos(gamma);
    const sinGamma = Math.sin(gamma);
    
    const vol = a * b * c * Math.sqrt(1 - cosAlpha*cosAlpha - cosBeta*cosBeta - cosGamma*cosGamma + 2*cosAlpha*cosBeta*cosGamma);
    
    const x = final[0];
    const y = final[1];
    const z = final[2];
    
    const fz = z * sinGamma * a * b / vol;
    const fy = (y - b*cosGamma*(x/a) - c*(cosAlpha - cosBeta*cosGamma)/sinGamma * fz) / (b * sinGamma);
    const fx = (x - b*cosGamma*fy - c*cosBeta*fz) / a;
    
    rotatedAtoms2.push({
      ...atoms2[i],
      x: ((fx % 1) + 1) % 1,
      y: ((fy % 1) + 1) % 1,
      z: ((fz % 1) + 1) % 1,
    });
  }
  
  const translation = [
    centroidP[0] - (R[0][0]*centroidQ[0] + R[0][1]*centroidQ[1] + R[0][2]*centroidQ[2]),
    centroidP[1] - (R[1][0]*centroidQ[0] + R[1][1]*centroidQ[1] + R[1][2]*centroidQ[2]),
    centroidP[2] - (R[2][0]*centroidQ[0] + R[2][1]*centroidQ[1] + R[2][2]*centroidQ[2]),
  ];
  
  return { rmsd, rotatedAtoms2, rotation: R, translation };
}
