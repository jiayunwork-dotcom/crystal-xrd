export interface SymOp {
  rotation: number[][];
  translation: number[];
}

export interface SpaceGroup {
  number: number;
  symbol: string;
  crystalSystem: string;
  operations: SymOp[];
}

function I(): number[][] { return [[1,0,0],[0,1,0],[0,0,1]]; }
function neg(M: number[][]): number[][] { return M.map(r => r.map(v => -v)); }
function compose(R1: number[][], R2: number[][], t1: number[], t2: number[]): SymOp {
  const R = R1.map((row, i) => row.map((_, j) => R1[i][0]*R2[0][j] + R1[i][1]*R2[1][j] + R1[i][2]*R2[2][j]));
  const t = [R1[0][0]*t2[0]+R1[0][1]*t2[1]+R1[0][2]*t2[2]+t1[0],
             R1[1][0]*t2[0]+R1[1][1]*t2[1]+R1[1][2]*t2[2]+t1[1],
             R1[2][0]*t2[0]+R1[2][1]*t2[1]+R1[2][2]*t2[2]+t1[2]];
  return { rotation: R, translation: t.map(v => ((v % 1) + 1) % 1) };
}

const Rx = [[1,0,0],[0,-1,0],[0,0,-1]];
const Ry = [[-1,0,0],[0,1,0],[0,0,-1]];
const Rz = [[-1,0,0],[0,-1,0],[0,0,1]];
const Rxy = [[0,1,0],[1,0,0],[0,0,1]];
const Rxz = [[0,0,1],[0,1,0],[1,0,0]];
const Ryz = [[1,0,0],[0,0,1],[0,1,0]];
const R3z = [[-1,-1,0],[1,-1,0],[0,0,1]];
const R6z = [[1,-1,0],[1,0,0],[0,0,1]];
const R3111 = [[0,0,1],[1,0,0],[0,1,0]];
const Rbody = [[-1,0,0],[0,-1,0],[0,0,-1]];
const Rface = [[0,1,0],[0,0,1],[1,0,0]];
const RfaceInv = [[0,0,1],[1,0,0],[0,1,0]];

function genFromGenerators(generators: SymOp[]): SymOp[] {
  const ops: SymOp[] = [{ rotation: I(), translation: [0,0,0] }];
  const set = new Set<string>();
  const identityKey = '1,0,0,0,1,0,0,0,1;0,0,0';
  set.add(identityKey);
  let changed = true;
  let iterations = 0;
  const maxIterations = 1000;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    for (const op of [...ops]) {
      for (const g of generators) {
        const newOp = compose(g.rotation, op.rotation, g.translation, op.translation);
        newOp.rotation = newOp.rotation.map(row => row.map(v => Math.round(v * 1000) / 1000));
        newOp.translation = newOp.translation.map(v => Math.round(v * 1000) / 1000);
        newOp.translation = newOp.translation.map(v => ((v % 1) + 1) % 1);
        const key = newOp.rotation.flat().join(',') + ';' + newOp.translation.join(',');
        if (!set.has(key)) {
          set.add(key);
          ops.push(newOp);
          changed = true;
        }
      }
    }
  }
  return ops;
}

const E = I();

function sg(num: number, symbol: string, system: string, generators: SymOp[]): SpaceGroup {
  return { number: num, symbol, crystalSystem: system, operations: genFromGenerators(generators) };
}

function op(R: number[][], t: number[] = [0,0,0]): SymOp {
  return { rotation: R, translation: t.map(v => ((v % 1) + 1) % 1) };
}

export const SPACE_GROUPS: SpaceGroup[] = [
  sg(1, "P1", "Triclinic", []),
  sg(2, "P-1", "Triclinic", [op(Rbody)]),
  sg(3, "P2", "Monoclinic", [op(Ry)]),
  sg(4, "P21", "Monoclinic", [op(Ry, [0, 0.5, 0])]),
  sg(5, "C2", "Monoclinic", [op(Ry), op(E, [0.5, 0.5, 0])]),
  sg(6, "Pm", "Monoclinic", [op(Rx)]),
  sg(7, "Pc", "Monoclinic", [op(Rx, [0, 0, 0.5])]),
  sg(8, "Cm", "Monoclinic", [op(Rx), op(E, [0.5, 0.5, 0])]),
  sg(9, "Cc", "Monoclinic", [op(Rx, [0, 0, 0.5]), op(E, [0.5, 0.5, 0])]),
  sg(10, "P2/m", "Monoclinic", [op(Ry), op(Rx)]),
  sg(11, "P21/m", "Monoclinic", [op(Ry, [0, 0.5, 0]), op(Rx)]),
  sg(12, "C2/m", "Monoclinic", [op(Ry), op(Rx), op(E, [0.5, 0.5, 0])]),
  sg(13, "P2/c", "Monoclinic", [op(Ry), op(Rx, [0, 0, 0.5])]),
  sg(14, "P21/c", "Monoclinic", [op(Ry, [0, 0.5, 0]), op(Rx, [0, 0, 0.5])]),
  sg(15, "C2/c", "Monoclinic", [op(Ry), op(Rx, [0, 0, 0.5]), op(E, [0.5, 0.5, 0])]),
  sg(16, "P222", "Orthorhombic", [op(Rx), op(Ry)]),
  sg(17, "P2221", "Orthorhombic", [op(Rx), op(Ry, [0, 0, 0.5])]),
  sg(18, "P21212", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry, [0, 0.5, 0])]),
  sg(19, "P212121", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry, [0, 0.5, 0.5])]),
  sg(20, "C2221", "Orthorhombic", [op(Rx), op(Ry, [0, 0, 0.5]), op(E, [0.5, 0.5, 0])]),
  sg(21, "C222", "Orthorhombic", [op(Rx), op(Ry), op(E, [0.5, 0.5, 0])]),
  sg(22, "F222", "Orthorhombic", [op(Rx), op(Ry), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(23, "I222", "Orthorhombic", [op(Rx), op(Ry), op(E, [0.5, 0.5, 0.5])]),
  sg(24, "I212121", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry, [0, 0.5, 0]), op(E, [0.5, 0.5, 0.5])]),
  sg(25, "Pmm2", "Orthorhombic", [op(Rz)]),
  sg(26, "Pmc21", "Orthorhombic", [op(Rz, [0, 0, 0.5])]),
  sg(27, "Pcc2", "Orthorhombic", [op(Rz), op(Rz, [0, 0, 0.5])]),
  sg(28, "Pma2", "Orthorhombic", [op(Rz, [0.5, 0, 0])]),
  sg(29, "Pca21", "Orthorhombic", [op(Rz, [0.5, 0, 0.5])]),
  sg(30, "Pnc2", "Orthorhombic", [op(Rz), op(Rz, [0, 0.5, 0.5])]),
  sg(31, "Pmn21", "Orthorhombic", [op(Rz, [0, 0.5, 0])]),
  sg(32, "Pba2", "Orthorhombic", [op(Rz, [0.5, 0.5, 0])]),
  sg(33, "Pna21", "Orthorhombic", [op(Rz, [0.5, 0.5, 0.5])]),
  sg(34, "Pnn2", "Orthorhombic", [op(Rz, [0.5, 0.5, 0.5])]),
  sg(35, "Cmm2", "Orthorhombic", [op(Rz), op(E, [0.5, 0.5, 0])]),
  sg(36, "Cmc21", "Orthorhombic", [op(Rz, [0, 0, 0.5]), op(E, [0.5, 0.5, 0])]),
  sg(37, "Ccc2", "Orthorhombic", [op(Rz, [0, 0, 0.5]), op(E, [0.5, 0.5, 0])]),
  sg(38, "Amm2", "Orthorhombic", [op(Rz), op(E, [0, 0.5, 0.5])]),
  sg(39, "Aem2", "Orthorhombic", [op(Rz), op(E, [0, 0.5, 0.5])]),
  sg(40, "Ama2", "Orthorhombic", [op(Rz, [0.5, 0, 0]), op(E, [0, 0.5, 0.5])]),
  sg(41, "Aea2", "Orthorhombic", [op(Rz, [0.5, 0, 0.5]), op(E, [0, 0.5, 0.5])]),
  sg(42, "Fmm2", "Orthorhombic", [op(Rz), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(43, "Fdd2", "Orthorhombic", [op(Rz, [0.25, 0.25, 0]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(44, "Imm2", "Orthorhombic", [op(Rz), op(E, [0.5, 0.5, 0.5])]),
  sg(45, "Iba2", "Orthorhombic", [op(Rz, [0.5, 0.5, 0]), op(E, [0.5, 0.5, 0.5])]),
  sg(46, "Ima2", "Orthorhombic", [op(Rz, [0.5, 0, 0]), op(E, [0.5, 0.5, 0.5])]),
  sg(47, "Pmmm", "Orthorhombic", [op(Rx), op(Ry)]),
  sg(48, "Pnnn", "Orthorhombic", [op(Rx, [0.5, 0.5, 0.5]), op(Ry, [0.5, 0.5, 0.5])]),
  sg(49, "Pccm", "Orthorhombic", [op(Rx, [0, 0, 0.5]), op(Ry, [0, 0, 0.5])]),
  sg(50, "Pban", "Orthorhombic", [op(Rx, [0.5, 0.5, 0]), op(Ry, [0.5, 0.5, 0])]),
  sg(51, "Pmma", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry)]),
  sg(52, "Pnna", "Orthorhombic", [op(Rx, [0.5, 0, 0.5]), op(Ry, [0, 0.5, 0.5])]),
  sg(53, "Pmna", "Orthorhombic", [op(Rx, [0.5, 0.5, 0]), op(Ry, [0, 0, 0.5])]),
  sg(54, "Pcca", "Orthorhombic", [op(Rx, [0.5, 0, 0.5]), op(Ry, [0, 0, 0.5])]),
  sg(55, "Pbam", "Orthorhombic", [op(Rx, [0.5, 0.5, 0]), op(Ry, [0.5, 0.5, 0])]),
  sg(56, "Pccn", "Orthorhombic", [op(Rx, [0.5, 0, 0.5]), op(Ry, [0, 0.5, 0.5])]),
  sg(57, "Pbcm", "Orthorhombic", [op(Rx, [0, 0.5, 0.5]), op(Ry, [0, 0, 0.5])]),
  sg(58, "Pnnm", "Orthorhombic", [op(Rx, [0.5, 0.5, 0.5]), op(Ry, [0.5, 0.5, 0.5])]),
  sg(59, "Pmmn", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry, [0, 0.5, 0])]),
  sg(60, "Pbcn", "Orthorhombic", [op(Rx, [0.5, 0, 0.5]), op(Ry, [0, 0.5, 0.5])]),
  sg(61, "Pbca", "Orthorhombic", [op(Rx, [0.5, 0, 0.5]), op(Ry, [0, 0.5, 0.5])]),
  sg(62, "Pnma", "Orthorhombic", [op(Rx, [0, 0.5, 0]), op(Ry, [0.5, 0, 0.5])]),
  sg(63, "Cmcm", "Orthorhombic", [op(Rx, [0, 0, 0.5]), op(Ry), op(E, [0.5, 0.5, 0])]),
  sg(64, "Cmca", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry), op(E, [0.5, 0.5, 0])]),
  sg(65, "Cmmm", "Orthorhombic", [op(Rx), op(Ry), op(E, [0.5, 0.5, 0])]),
  sg(66, "Cccm", "Orthorhombic", [op(Rx, [0, 0, 0.5]), op(Ry, [0, 0, 0.5]), op(E, [0.5, 0.5, 0])]),
  sg(67, "Cmma", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry), op(E, [0.5, 0.5, 0])]),
  sg(68, "Ccca", "Orthorhombic", [op(Rx, [0.5, 0, 0.5]), op(Ry, [0, 0.5, 0]), op(E, [0.5, 0.5, 0])]),
  sg(69, "Fmmm", "Orthorhombic", [op(Rx), op(Ry), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(70, "Fddd", "Orthorhombic", [op(Rx, [0.25, 0.25, 0.25]), op(Ry, [0.25, 0.25, 0.25]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(71, "Immm", "Orthorhombic", [op(Rx), op(Ry), op(E, [0.5, 0.5, 0.5])]),
  sg(72, "Ibam", "Orthorhombic", [op(Rx, [0.5, 0.5, 0]), op(Ry, [0.5, 0.5, 0]), op(E, [0.5, 0.5, 0.5])]),
  sg(73, "Ibca", "Orthorhombic", [op(Rx, [0.5, 0, 0]), op(Ry, [0, 0.5, 0]), op(E, [0.5, 0.5, 0.5])]),
  sg(74, "Imma", "Orthorhombic", [op(Rx, [0, 0.5, 0]), op(Ry), op(E, [0.5, 0.5, 0.5])]),
  sg(75, "P4", "Tetragonal", [op(Rz)]),
  sg(76, "P41", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0, 0, 0.25])]),
  sg(77, "P42", "Tetragonal", [op(Rz, [0, 0, 0.5])]),
  sg(78, "P43", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0, 0, 0.75])]),
  sg(79, "I4", "Tetragonal", [op(Rz), op(E, [0.5, 0.5, 0.5])]),
  sg(80, "I41", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0.5, 0.25, 0.75])]),
  sg(81, "P-4", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]])]),
  sg(82, "I-4", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(E, [0.5, 0.5, 0.5])]),
  sg(83, "P4/m", "Tetragonal", [op(Rz), op(Rx)]),
  sg(84, "P42/m", "Tetragonal", [op(Rz, [0, 0, 0.5]), op(Rx)]),
  sg(85, "P4/n", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0])]),
  sg(86, "P42/n", "Tetragonal", [op(Rz, [0, 0, 0.5]), op(Rx, [0.5, 0.5, 0.5])]),
  sg(87, "I4/m", "Tetragonal", [op(Rz), op(Rx), op(E, [0.5, 0.5, 0.5])]),
  sg(88, "I41/a", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0.5, 0.25, 0.75]), op(Rx, [0.5, 0, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(89, "P422", "Tetragonal", [op(Rz), op(Rx)]),
  sg(90, "P4212", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0])]),
  sg(91, "P4122", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.25]), op(Rx)]),
  sg(92, "P41212", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.25]), op(Rx, [0.5, 0.5, 0])]),
  sg(93, "P4222", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx)]),
  sg(94, "P42212", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0.5, 0.5, 0])]),
  sg(95, "P4322", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.75]), op(Rx)]),
  sg(96, "P43212", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.75]), op(Rx, [0.5, 0.5, 0])]),
  sg(97, "I422", "Tetragonal", [op(Rz), op(Rx), op(E, [0.5, 0.5, 0.5])]),
  sg(98, "I4122", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0.5,0.25,0.75]), op(Rx), op(E, [0.5, 0.5, 0.5])]),
  sg(99, "P4mm", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]])]),
  sg(100, "P4bm", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]]), op(Rx, [0.5, 0.5, 0])]),
  sg(101, "P42cm", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.5]), op(Rx)]),
  sg(102, "P42nm", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.5]), op(Rx, [0.5, 0.5, 0])]),
  sg(103, "P4cc", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]]), op(Rx, [0, 0, 0.5])]),
  sg(104, "P4nc", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]]), op(Rx, [0.5, 0.5, 0.5])]),
  sg(105, "P42mc", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.5]), op(Rx, [0, 0, 0.5])]),
  sg(106, "P42bc", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0,0,0.5]), op(Rx, [0.5, 0.5, 0.5])]),
  sg(107, "I4mm", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]]), op(E, [0.5, 0.5, 0.5])]),
  sg(108, "I4cm", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]]), op(Rx, [0, 0, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(109, "I41md", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0.5,0.25,0.75]), op(Rx, [0, 0, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(110, "I41cd", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0.5,0.25,0.75]), op(Rx, [0, 0.5, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(111, "P-42m", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Rx)]),
  sg(112, "P-42c", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Rx, [0, 0, 0.5])]),
  sg(113, "P-421m", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Rx, [0.5, 0.5, 0])]),
  sg(114, "P-421c", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Rx, [0.5, 0.5, 0.5])]),
  sg(115, "P-4m2", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Ry)]),
  sg(116, "P-4c2", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Ry, [0, 0, 0.5])]),
  sg(117, "P-4b2", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Ry, [0.5, 0.5, 0])]),
  sg(118, "P-4n2", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Ry, [0.5, 0.5, 0.5])]),
  sg(119, "I-4m2", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Ry), op(E, [0.5, 0.5, 0.5])]),
  sg(120, "I-4c2", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Ry, [0, 0, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(121, "I-42m", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Rx), op(E, [0.5, 0.5, 0.5])]),
  sg(122, "I-42d", "Tetragonal", [op([[0,1,0],[-1,0,0],[0,0,1]]), op(Rx, [0.5, 0, 0.75]), op(E, [0.5, 0.5, 0.5])]),
  sg(123, "P4/mmm", "Tetragonal", [op(Rz), op(Rx)]),
  sg(124, "P4/mcc", "Tetragonal", [op(Rz), op(Rx, [0, 0, 0.5])]),
  sg(125, "P4/nbm", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0])]),
  sg(126, "P4/nnc", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0.5])]),
  sg(127, "P4/mbm", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0])]),
  sg(128, "P4/mnc", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0.5])]),
  sg(129, "P4/nmm", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0])]),
  sg(130, "P4/ncc", "Tetragonal", [op(Rz), op(Rx, [0.5, 0.5, 0.5])]),
  sg(131, "P42/mmc", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx)]),
  sg(132, "P42/mcm", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0, 0, 0.5])]),
  sg(133, "P42/nbc", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0.5, 0.5, 0.5])]),
  sg(134, "P42/nnm", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0.5, 0.5, 0])]),
  sg(135, "P42/mbc", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0.5, 0.5, 0.5])]),
  sg(136, "P42/mnm", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0.5, 0.5, 0])]),
  sg(137, "P42/nmc", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0.5, 0.5, 0.5])]),
  sg(138, "P42/ncm", "Tetragonal", [op(Rz, [0,0,0.5]), op(Rx, [0.5, 0.5, 0])]),
  sg(139, "I4/mmm", "Tetragonal", [op(Rz), op(Rx), op(E, [0.5, 0.5, 0.5])]),
  sg(140, "I4/mcm", "Tetragonal", [op(Rz), op(Rx, [0, 0, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(141, "I41/amd", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0.5,0.25,0.75]), op(Rx, [0, 0, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(142, "I41/acd", "Tetragonal", [op([[0,-1,0],[1,0,0],[0,0,1]], [0.5,0.25,0.75]), op(Rx, [0, 0.5, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(143, "P3", "Trigonal", [op(R3z)]),
  sg(144, "P31", "Trigonal", [op(R3z, [0, 0, 1/3])]),
  sg(145, "P32", "Trigonal", [op(R3z, [0, 0, 2/3])]),
  sg(146, "R3", "Trigonal", [op(R3z), op(E, [1/3, 2/3, 2/3])]),
  sg(147, "P-3", "Trigonal", [op(R3z), op(Rbody)]),
  sg(148, "R-3", "Trigonal", [op(R3z), op(Rbody), op(E, [1/3, 2/3, 2/3])]),
  sg(149, "P312", "Trigonal", [op(R3z), op(Rxy)]),
  sg(150, "P321", "Trigonal", [op(R3z), op(Ryz)]),
  sg(151, "P3112", "Trigonal", [op(R3z, [0, 0, 1/3]), op(Rxy)]),
  sg(152, "P3121", "Trigonal", [op(R3z, [0, 0, 1/3]), op(Ryz)]),
  sg(153, "P3212", "Trigonal", [op(R3z, [0, 0, 2/3]), op(Rxy)]),
  sg(154, "P3221", "Trigonal", [op(R3z, [0, 0, 2/3]), op(Ryz)]),
  sg(155, "R32", "Trigonal", [op(R3z), op(Rxy), op(E, [1/3, 2/3, 2/3])]),
  sg(156, "P3m1", "Trigonal", [op(R3z), op(Rx)]),
  sg(157, "P31m", "Trigonal", [op(R3z), op(Ry)]),
  sg(158, "P3c1", "Trigonal", [op(R3z), op(Rx, [0, 0, 0.5])]),
  sg(159, "P31c", "Trigonal", [op(R3z), op(Ry, [0, 0, 0.5])]),
  sg(160, "R3m", "Trigonal", [op(R3z), op(Rx), op(E, [1/3, 2/3, 2/3])]),
  sg(161, "R3c", "Trigonal", [op(R3z), op(Rx, [0, 0, 0.5]), op(E, [1/3, 2/3, 2/3])]),
  sg(162, "P-31m", "Trigonal", [op(R3z), op(Rbody), op(Ry)]),
  sg(163, "P-31c", "Trigonal", [op(R3z), op(Rbody), op(Ry, [0, 0, 0.5])]),
  sg(164, "P-3m1", "Trigonal", [op(R3z), op(Rbody), op(Rx)]),
  sg(165, "P-3c1", "Trigonal", [op(R3z), op(Rbody), op(Rx, [0, 0, 0.5])]),
  sg(166, "R-3m", "Trigonal", [op(R3z), op(Rbody), op(Rx), op(E, [1/3, 2/3, 2/3])]),
  sg(167, "R-3c", "Trigonal", [op(R3z), op(Rbody), op(Rx, [0, 0, 0.5]), op(E, [1/3, 2/3, 2/3])]),
  sg(168, "P6", "Hexagonal", [op(R3z), op(R6z)]),
  sg(169, "P61", "Hexagonal", [op(R6z, [0, 0, 1/6])]),
  sg(170, "P65", "Hexagonal", [op(R6z, [0, 0, 5/6])]),
  sg(171, "P62", "Hexagonal", [op(R6z, [0, 0, 1/3])]),
  sg(172, "P64", "Hexagonal", [op(R6z, [0, 0, 2/3])]),
  sg(173, "P63", "Hexagonal", [op(R6z, [0, 0, 0.5])]),
  sg(174, "P-6", "Hexagonal", [op([[0,1,0],[1,0,0],[0,0,-1]])]),
  sg(175, "P6/m", "Hexagonal", [op(R3z), op(R6z), op(Rbody)]),
  sg(176, "P63/m", "Hexagonal", [op(R6z, [0, 0, 0.5]), op(Rbody)]),
  sg(177, "P622", "Hexagonal", [op(R3z), op(R6z), op(Ryz)]),
  sg(178, "P6122", "Hexagonal", [op(R6z, [0, 0, 1/6]), op(Ryz)]),
  sg(179, "P6522", "Hexagonal", [op(R6z, [0, 0, 5/6]), op(Ryz)]),
  sg(180, "P6222", "Hexagonal", [op(R6z, [0, 0, 1/3]), op(Ryz)]),
  sg(181, "P6422", "Hexagonal", [op(R6z, [0, 0, 2/3]), op(Ryz)]),
  sg(182, "P6322", "Hexagonal", [op(R6z, [0, 0, 0.5]), op(Ryz)]),
  sg(183, "P6mm", "Hexagonal", [op(R3z), op(R6z), op(Rx)]),
  sg(184, "P6cc", "Hexagonal", [op(R3z), op(R6z), op(Rx, [0, 0, 0.5])]),
  sg(185, "P63cm", "Hexagonal", [op(R6z, [0, 0, 0.5]), op(Rx)]),
  sg(186, "P63mc", "Hexagonal", [op(R6z, [0, 0, 0.5]), op(Rx, [0, 0, 0.5])]),
  sg(187, "P-6m2", "Hexagonal", [op([[0,1,0],[1,0,0],[0,0,-1]]), op(Ry)]),
  sg(188, "P-6c2", "Hexagonal", [op([[0,1,0],[1,0,0],[0,0,-1]]), op(Ry, [0, 0, 0.5])]),
  sg(189, "P-62m", "Hexagonal", [op([[0,1,0],[1,0,0],[0,0,-1]]), op(Rx)]),
  sg(190, "P-62c", "Hexagonal", [op([[0,1,0],[1,0,0],[0,0,-1]]), op(Rx, [0, 0, 0.5])]),
  sg(191, "P6/mmm", "Hexagonal", [op(R3z), op(R6z), op(Rbody), op(Rx)]),
  sg(192, "P6/mcc", "Hexagonal", [op(R3z), op(R6z), op(Rbody), op(Rx, [0, 0, 0.5])]),
  sg(193, "P63/mcm", "Hexagonal", [op(R6z, [0, 0, 0.5]), op(Rbody), op(Rx)]),
  sg(194, "P63/mmc", "Hexagonal", [op(R6z, [0, 0, 0.5]), op(Rbody), op(Rx, [0, 0, 0.5])]),
  sg(195, "P23", "Cubic", [op(R3111), op(Ry)]),
  sg(196, "F23", "Cubic", [op(R3111), op(Ry), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(197, "I23", "Cubic", [op(R3111), op(Ry), op(E, [0.5, 0.5, 0.5])]),
  sg(198, "P213", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0])]),
  sg(199, "I213", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op(E, [0.5, 0.5, 0.5])]),
  sg(200, "Pm-3", "Cubic", [op(R3111), op(Ry), op(Rbody)]),
  sg(201, "Pn-3", "Cubic", [op(R3111), op(Ry), op(Rbody, [0.5, 0.5, 0.5])]),
  sg(202, "Fm-3", "Cubic", [op(R3111), op(Ry), op(Rbody), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(203, "Fd-3", "Cubic", [op(R3111), op(Ry), op(Rbody, [0.25, 0.25, 0.25]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(204, "Im-3", "Cubic", [op(R3111), op(Ry), op(Rbody), op(E, [0.5, 0.5, 0.5])]),
  sg(205, "Pa-3", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op(Rbody, [0.5, 0.5, 0.5])]),
  sg(206, "Ia-3", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op(Rbody, [0.5, 0.5, 0.5]), op(E, [0.5, 0.5, 0.5])]),
  sg(207, "P432", "Cubic", [op(R3111), op(Ry), op(Rz)]),
  sg(208, "P4232", "Cubic", [op(R3111), op(Ry), op(Rz, [0.5, 0.5, 0.5])]),
  sg(209, "F432", "Cubic", [op(R3111), op(Ry), op(Rz), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(210, "F4132", "Cubic", [op(R3111), op(Ry), op([[0,-1,0],[1,0,0],[0,0,1]], [0.5, 0.25, 0.75]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(211, "I432", "Cubic", [op(R3111), op(Ry), op(Rz), op(E, [0.5, 0.5, 0.5])]),
  sg(212, "P4332", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op(Rz, [0, 0.5, 0.5])]),
  sg(213, "P4132", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op(Rz, [0, 0.5, 0.5])]),
  sg(214, "I4132", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op([[0,-1,0],[1,0,0],[0,0,1]], [0.5, 0.25, 0.75]), op(E, [0.5, 0.5, 0.5])]),
  sg(215, "P-43m", "Cubic", [op(R3111), op(Ry), op(Rxy)]),
  sg(216, "F-43m", "Cubic", [op(R3111), op(Ry), op(Rxy), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(217, "I-43m", "Cubic", [op(R3111), op(Ry), op(Rxy), op(E, [0.5, 0.5, 0.5])]),
  sg(218, "P-43n", "Cubic", [op(R3111), op(Ry), op(Rxy, [0.5, 0.5, 0.5])]),
  sg(219, "F-43c", "Cubic", [op(R3111), op(Ry), op(Rxy, [0.5, 0.5, 0.5]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(220, "I-43d", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op(Rxy, [0.75, 0.25, 0.75]), op(E, [0.5, 0.5, 0.5])]),
  sg(221, "Pm-3m", "Cubic", [op(R3111), op(Ry), op(Rbody)]),
  sg(222, "Pn-3n", "Cubic", [op(R3111), op(Ry), op(Rbody, [0.5, 0.5, 0.5])]),
  sg(223, "Pm-3n", "Cubic", [op(R3111), op(Ry, [0.5, 0.5, 0.5]), op(Rbody)]),
  sg(224, "Pn-3m", "Cubic", [op(R3111), op(Ry), op(Rbody, [0.5, 0.5, 0.5])]),
  sg(225, "Fm-3m", "Cubic", [op(R3111), op(Ry), op(Rbody), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(226, "Fm-3c", "Cubic", [op(R3111), op(Ry), op(Rbody, [0.5, 0.5, 0.5]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(227, "Fd-3m", "Cubic", [op(R3111), op(Ry), op(Rbody, [0.25, 0.25, 0.25]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(228, "Fd-3c", "Cubic", [op(R3111), op(Ry), op(Rbody, [0.25, 0.25, 0.25]), op(E, [0.5, 0.5, 0]), op(E, [0.5, 0, 0.5])]),
  sg(229, "Im-3m", "Cubic", [op(R3111), op(Ry), op(Rbody), op(E, [0.5, 0.5, 0.5])]),
  sg(230, "Ia-3d", "Cubic", [op(R3111), op(Ry, [0.5, 0, 0]), op(Rbody, [0.25, 0.25, 0.25]), op(E, [0.5, 0.5, 0.5])]),
];

export function getSpaceGroupByNumber(num: number): SpaceGroup | undefined {
  return SPACE_GROUPS.find(sg => sg.number === num);
}

export function getSpaceGroupBySymbol(symbol: string): SpaceGroup | undefined {
  return SPACE_GROUPS.find(sg => sg.symbol === symbol);
}

export const CRYSTAL_SYSTEMS = [
  "Triclinic", "Monoclinic", "Orthorhombic", "Tetragonal", "Trigonal", "Hexagonal", "Cubic"
];
