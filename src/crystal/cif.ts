import type { CellParams, AsymAtom } from '../types';

export function parseCIF(text: string): { cell: CellParams; spaceGroup: string; atoms: AsymAtom[] } | null {
  const lines = text.split('\n');
  const cell: CellParams = { a: 0, b: 0, c: 0, alpha: 90, beta: 90, gamma: 90 };
  let spaceGroup = 'P1';
  const atoms: AsymAtom[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('_cell_length_a')) cell.a = parseCifValue(line);
    else if (line.startsWith('_cell_length_b')) cell.b = parseCifValue(line);
    else if (line.startsWith('_cell_length_c')) cell.c = parseCifValue(line);
    else if (line.startsWith('_cell_angle_alpha')) cell.alpha = parseCifValue(line);
    else if (line.startsWith('_cell_angle_beta')) cell.beta = parseCifValue(line);
    else if (line.startsWith('_cell_angle_gamma')) cell.gamma = parseCifValue(line);
    else if (line.startsWith('_space_group_name_H-M') || line.startsWith('_symmetry_space_group_name_H-M')) {
      spaceGroup = parseCifStringValue(line);
    }

    if (line === 'loop_') {
      i = parseLoop(lines, i, atoms);
      continue;
    }
    i++;
  }

  if (cell.a === 0) return null;
  return { cell, spaceGroup, atoms };
}

function parseCifValue(line: string): number {
  const parts = line.split(/\s+/);
  if (parts.length >= 2) {
    const v = parts[1].replace(/[()]/g, '');
    return parseFloat(v) || 0;
  }
  return 0;
}

function parseCifStringValue(line: string): string {
  const idx = line.search(/\s/);
  const val = line.slice(idx).trim();
  return val.replace(/^['"]|['"]$/g, '');
}

function parseLoop(lines: string[], startIdx: number, atoms: AsymAtom[]): number {
  let j = startIdx + 1;
  const tags: string[] = [];

  while (j < lines.length) {
    const line = lines[j].trim();
    if (!line) { j++; continue; }
    if (line.startsWith('_')) {
      tags.push(line.split(/\s+/)[0]);
      j++;
    } else break;
  }

  const labelIdx = tags.findIndex(t => t === '_atom_site_type_symbol' || t === '_atom_site_label');
  const xIdx = tags.findIndex(t => t === '_atom_site_fract_x');
  const yIdx = tags.findIndex(t => t === '_atom_site_fract_y');
  const zIdx = tags.findIndex(t => t === '_atom_site_fract_z');
  const occIdx = tags.findIndex(t => t === '_atom_site_occupancy');
  const bisoIdx = tags.findIndex(t => t === '_atom_site_B_iso_or_equiv' || t === '_atom_site_U_iso_or_equiv');

  if (labelIdx === -1 || xIdx === -1 || yIdx === -1 || zIdx === -1) return j;

  while (j < lines.length) {
    const line = lines[j].trim();
    if (!line || line.startsWith('_') || line === 'loop_' || line.startsWith('data_')) break;
    const vals = line.split(/\s+/);
    if (vals.length < tags.length) { j++; continue; }

    const element = vals[labelIdx].replace(/[^a-zA-Z]/g, '');
    const x = parseValUnc(vals[xIdx]);
    const y = parseValUnc(vals[yIdx]);
    const z = parseValUnc(vals[zIdx]);
    const occ = occIdx >= 0 ? parseValUnc(vals[occIdx]) : 1.0;
    const biso = bisoIdx >= 0 ? parseValUnc(vals[bisoIdx]) : 1.0;

    atoms.push({ element, x, y, z, occupancy: occ || 1, biso: biso || 1 });
    j++;
  }
  return j;
}

function parseValUnc(val: string): number {
  const idx = val.indexOf('(');
  const clean = idx >= 0 ? val.substring(0, idx) : val;
  return parseFloat(clean) || 0;
}

export function exportCIF(cell: CellParams, spaceGroup: string, atoms: AsymAtom[]): string {
  const lines: string[] = [
    'data_crystal',
    `_cell_length_a    ${cell.a.toFixed(6)}`,
    `_cell_length_b    ${cell.b.toFixed(6)}`,
    `_cell_length_c    ${cell.c.toFixed(6)}`,
    `_cell_angle_alpha ${cell.alpha.toFixed(4)}`,
    `_cell_angle_beta  ${cell.beta.toFixed(4)}`,
    `_cell_angle_gamma ${cell.gamma.toFixed(4)}`,
    `_symmetry_space_group_name_H-M '${spaceGroup}'`,
    '',
    'loop_',
    '_atom_site_label',
    '_atom_site_type_symbol',
    '_atom_site_fract_x',
    '_atom_site_fract_y',
    '_atom_site_fract_z',
    '_atom_site_occupancy',
    '_atom_site_B_iso_or_equiv',
  ];

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    lines.push(`${a.element}${i + 1} ${a.element} ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)} ${a.occupancy.toFixed(4)} ${a.biso.toFixed(4)}`);
  }

  return lines.join('\n');
}
