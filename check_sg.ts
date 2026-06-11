import { SPACE_GROUPS, CRYSTAL_SYSTEMS } from './src/data/spaceGroups';

console.log('Total space groups:', SPACE_GROUPS.length);
console.log('\nBy crystal system:');

for (const sys of CRYSTAL_SYSTEMS) {
  const sgs = SPACE_GROUPS.filter(sg => sg.crystalSystem === sys);
  const numbers = sgs.map(sg => sg.number).sort((a, b) => a - b);
  console.log(`\n${sys}: ${sgs.length} space groups`);
  console.log(`  Numbers: ${numbers.join(', ')}`);
  console.log(`  First: ${sgs[0]?.number} ${sgs[0]?.symbol} (${sgs[0]?.operations.length} ops)`);
  console.log(`  Last: ${sgs[sgs.length-1]?.number} ${sgs[sgs.length-1]?.symbol} (${sgs[sgs.length-1]?.operations.length} ops)`);
}

// 检查是否有编号缺失
const allNumbers = new Set(SPACE_GROUPS.map(sg => sg.number));
const missing: number[] = [];
for (let i = 1; i <= 230; i++) {
  if (!allNumbers.has(i)) missing.push(i);
}
console.log(`\nMissing numbers: ${missing.length > 0 ? missing.join(', ') : 'none'}`);
