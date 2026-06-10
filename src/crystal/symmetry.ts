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
