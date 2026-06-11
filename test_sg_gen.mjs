
import { SPACE_GROUPS } from './src/data/spaceGroups.ts';

console.log('Testing space group generation...');
console.log('Total space groups:', SPACE_GROUPS.length);

let failed = [];
for (const sg of SPACE_GROUPS) {
  try {
    const opCount = sg.operations.length;
    if (opCount === 0) {
      failed.push({ num: sg.number, symbol: sg.symbol, reason: '0 operations' });
    }
  } catch (e) {
    failed.push({ num: sg.number, symbol: sg.symbol, reason: e.message });
  }
}

console.log('\nFailed space groups:', failed.length);
for (const f of failed) {
  console.log(`  #${f.num} ${f.symbol}: ${f.reason}`);
}

console.log('\nBy crystal system:');
const systems = {};
for (const sg of SPACE_GROUPS) {
  if (!systems[sg.crystalSystem]) systems[sg.crystalSystem] = 0;
  systems[sg.crystalSystem]++;
}
for (const [sys, count] of Object.entries(systems)) {
  console.log(`  ${sys}: ${count}`);
}

const sg2 = SPACE_GROUPS.find(s => s.number === 2);
console.log('\nSpace group #2 P-1:');
console.log('  Exists:', !!sg2);
if (sg2) {
  console.log('  Operations:', sg2.operations.length);
  console.log('  Crystal system:', sg2.crystalSystem);
}
