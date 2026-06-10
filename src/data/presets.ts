export interface CrystalPreset {
  name: string;
  a: number; b: number; c: number;
  alpha: number; beta: number; gamma: number;
  spaceGroupNumber: number;
  atoms: { element: string; x: number; y: number; z: number; occupancy: number; biso: number }[];
}

export const PRESETS: CrystalPreset[] = [
  {
    name: "NaCl (Rock Salt)",
    a: 5.6402, b: 5.6402, c: 5.6402,
    alpha: 90, beta: 90, gamma: 90,
    spaceGroupNumber: 225,
    atoms: [
      { element: "Na", x: 0, y: 0, z: 0, occupancy: 1, biso: 1.0 },
      { element: "Cl", x: 0.5, y: 0, z: 0, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Diamond",
    a: 3.567, b: 3.567, c: 3.567,
    alpha: 90, beta: 90, gamma: 90,
    spaceGroupNumber: 227,
    atoms: [
      { element: "C", x: 0, y: 0, z: 0, occupancy: 1, biso: 1.0 },
      { element: "C", x: 0.25, y: 0.25, z: 0.25, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Perovskite (CaTiO3)",
    a: 3.795, b: 3.795, c: 3.795,
    alpha: 90, beta: 90, gamma: 90,
    spaceGroupNumber: 221,
    atoms: [
      { element: "Ca", x: 0, y: 0, z: 0, occupancy: 1, biso: 1.0 },
      { element: "Ti", x: 0.5, y: 0.5, z: 0.5, occupancy: 1, biso: 1.0 },
      { element: "O", x: 0.5, y: 0.5, z: 0, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Spinel (MgAl2O4)",
    a: 8.08, b: 8.08, c: 8.08,
    alpha: 90, beta: 90, gamma: 90,
    spaceGroupNumber: 227,
    atoms: [
      { element: "Mg", x: 0.125, y: 0.125, z: 0.125, occupancy: 1, biso: 1.0 },
      { element: "Al", x: 0.5, y: 0.5, z: 0.5, occupancy: 1, biso: 1.0 },
      { element: "O", x: 0.25, y: 0.25, z: 0.25, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Fluorite (CaF2)",
    a: 5.462, b: 5.462, c: 5.462,
    alpha: 90, beta: 90, gamma: 90,
    spaceGroupNumber: 225,
    atoms: [
      { element: "Ca", x: 0, y: 0, z: 0, occupancy: 1, biso: 1.0 },
      { element: "F", x: 0.25, y: 0.25, z: 0.25, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Rutile (TiO2)",
    a: 4.594, b: 4.594, c: 2.959,
    alpha: 90, beta: 90, gamma: 90,
    spaceGroupNumber: 136,
    atoms: [
      { element: "Ti", x: 0, y: 0, z: 0, occupancy: 1, biso: 1.0 },
      { element: "O", x: 0.305, y: 0.305, z: 0, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Corundum (Al2O3)",
    a: 4.759, b: 4.759, c: 12.991,
    alpha: 90, beta: 90, gamma: 120,
    spaceGroupNumber: 167,
    atoms: [
      { element: "Al", x: 0, y: 0, z: 0.3522, occupancy: 1, biso: 1.0 },
      { element: "O", x: 0.306, y: 0, z: 0.25, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Wurtzite (ZnS)",
    a: 3.822, b: 3.822, c: 6.26,
    alpha: 90, beta: 90, gamma: 120,
    spaceGroupNumber: 186,
    atoms: [
      { element: "Zn", x: 0.333, y: 0.667, z: 0, occupancy: 1, biso: 1.0 },
      { element: "S", x: 0.333, y: 0.667, z: 0.375, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Zincblende (ZnS)",
    a: 5.41, b: 5.41, c: 5.41,
    alpha: 90, beta: 90, gamma: 90,
    spaceGroupNumber: 216,
    atoms: [
      { element: "Zn", x: 0, y: 0, z: 0, occupancy: 1, biso: 1.0 },
      { element: "S", x: 0.25, y: 0.25, z: 0.25, occupancy: 1, biso: 1.0 },
    ]
  },
  {
    name: "Ice-Ih",
    a: 4.51, b: 4.51, c: 7.35,
    alpha: 90, beta: 90, gamma: 120,
    spaceGroupNumber: 194,
    atoms: [
      { element: "O", x: 0.333, y: 0.667, z: 0.0625, occupancy: 1, biso: 1.0 },
    ]
  },
];
