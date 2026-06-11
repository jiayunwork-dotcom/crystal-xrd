// 测试空间群生成
const fs = require('fs');

// 简单实现必要的函数
function I() { return [[1,0,0],[0,1,0],[0,0,1]]; }
function neg(M) { return M.map(r => r.map(v => -v)); }
function compose(R1, R2, t1, t2) {
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

function genFromGenerators(generators) {
  const ops = [{ rotation: I(), translation: [0,0,0] }];
  const set = new Set();
  set.add('1,0,0,0,1,0,0,0,1;0,0,0');
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 1000) {
    changed = false;
    iterations++;
    for (const op of [...ops]) {
      for (const g of generators) {
        const newOp = compose(g.rotation, op.rotation, g.translation, op.translation);
        newOp.translation = newOp.translation.map(v => Math.round(v * 1000) / 1000);
        const key = newOp.rotation.flat().join(',') + ';' + newOp.translation.join(',');
        if (!set.has(key)) {
          set.add(key);
          ops.push(newOp);
          changed = true;
        }
      }
    }
  }
  if (iterations >= 1000) {
    return { ops, error: 'too many iterations', count: ops.length };
  }
  return { ops, error: null, count: ops.length };
}

function op(R, t = [0,0,0]) {
  return { rotation: R, translation: t.map(v => ((v % 1) + 1) % 1) };
}

// 测试一些空间群
const testCases = [
  { num: 1, name: 'P1', generators: [], expected: 1 },
  { num: 2, name: 'P-1', generators: [op(Rbody)], expected: 2 },
  { num: 3, name: 'P2', generators: [op(Ry)], expected: 2 },
  { num: 5, name: 'C2', generators: [op(Ry), op(I(), [0.5, 0.5, 0])], expected: 4 },
  { num: 16, name: 'P222', generators: [op(Rx), op(Ry)], expected: 4 },
  { num: 47, name: 'Pmmm', generators: [op(Rx), op(Ry)], expected: 8 },
  { num: 75, name: 'P4', generators: [op(Rz)], expected: 4 },
  { num: 123, name: 'P4/mmm', generators: [op(Rz), op(Rx)], expected: 16 },
  { num: 143, name: 'P3', generators: [op(R3z)], expected: 3 },
  { num: 168, name: 'P6', generators: [op(R3z), op(R6z)], expected: 6 },
  { num: 191, name: 'P6/mmm', generators: [op(R3z), op(R6z), op(Rbody), op(Rx)], expected: 24 },
  { num: 195, name: 'P23', generators: [op(R3111), op(Ry)], expected: 12 },
  { num: 221, name: 'Pm-3m', generators: [op(R3111), op(Ry), op(Rbody)], expected: 48 },
  { num: 225, name: 'Fm-3m', generators: [op(R3111), op(Ry), op(Rbody), op(I(), [0.5, 0.5, 0]), op(I(), [0.5, 0, 0.5])], expected: 192 },
  { num: 227, name: 'Fd-3m', generators: [op(R3111), op(Ry), op(Rbody, [0.25, 0.25, 0.25]), op(I(), [0.5, 0.5, 0]), op(I(), [0.5, 0, 0.5])], expected: 192 },
];

console.log('Testing space group generation:\n');
let allPassed = true;

for (const tc of testCases) {
  const result = genFromGenerators(tc.generators);
  const passed = result.count === tc.expected && !result.error;
  if (!passed) allPassed = false;
  console.log(`SG ${tc.num} (${tc.name}): ${result.count} operations (expected ${tc.expected}) ${passed ? '✓' : '✗'}`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
}

console.log(`\n${allPassed ? 'All tests passed!' : 'Some tests failed!'}`);
