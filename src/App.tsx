import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { SPACE_GROUPS, CRYSTAL_SYSTEMS, getSpaceGroupByNumber } from './data/spaceGroups';
import { PRESETS } from './data/presets';
import { generateEquivalentPositions, fractionalToCartesian, computeDistance, initWasm } from './crystal/symmetry';
import { calculateXRDPattern, calculateStructureFactorDetail, computeReciprocalCell } from './crystal/xrd';
import { parseCIF, exportCIF } from './crystal/cif';
import type {
  CellParams, AsymAtom, CrystalAtom, XRDPattern, StructureFactorDetail,
  XRDParams, SupercellParams,
} from './types';
import { CPK_COLORS, COVALENT_RADII, WAVELENGTHS, DEFAULT_XRD_PARAMS, DEFAULT_CELL } from './types';

function AtomSphere({ position, color, radius, onClick, selected }: {
  position: [number, number, number]; color: string; radius: number;
  onClick?: () => void; selected?: boolean;
}) {
  return (
    <mesh position={position} onClick={onClick}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial color={selected ? '#ffff00' : color} emissive={selected ? '#666600' : '#000'} />
    </mesh>
  );
}

function BondCylinder({ start, end, color = '#888888' }: {
  start: [number, number, number]; end: [number, number, number]; color?: string;
}) {
  const dir = new THREE.Vector3(...end).sub(new THREE.Vector3(...start));
  const len = dir.length();
  if (len < 0.01) return null;
  const mid = new THREE.Vector3(...start).add(dir.clone().multiplyScalar(0.5));
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return (
    <mesh position={mid.toArray() as [number, number, number]} quaternion={quat}>
      <cylinderGeometry args={[0.06, 0.06, len, 6]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function UnitCellFrame({ cell, scale = 1 }: { cell: CellParams; scale?: number }) {
  const verts = useMemo(() => {
    const corners: [number, number, number][] = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
      corners.push(fractionalToCartesian(i, j, k, cell).map(v => v * scale) as [number, number, number]);
    }
    return corners;
  }, [cell, scale]);

  const edges: [number, number][][] = useMemo(() => {
    const idx = [
      [0,1],[2,3],[4,5],[6,7],
      [0,2],[1,3],[4,6],[5,7],
      [0,4],[1,5],[2,6],[3,7],
    ];
    return idx.map(([a, b]) => [a, b]);
  }, []);

  return (
    <group>
      {edges.map(([a, b], i) => (
        <Line key={i} points={[verts[a], verts[b]]} color="black" lineWidth={1} />
      ))}
    </group>
  );
}

function PolyhedronMesh({ center, neighbors, color }: {
  center: [number, number, number]; neighbors: [number, number, number][]; color: string;
}) {
  const geometry = useMemo(() => {
    if (neighbors.length < 4) return null;
    const geo = new ConvexGeometry(
      neighbors.map(n => new THREE.Vector3(...n))
    );
    return geo;
  }, [neighbors]);

  if (!geometry) return null;

  return (
    <mesh position={center} geometry={geometry}>
      <meshStandardMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CrystalScene({
  atoms, cell, supercell, showBonds, showPolyhedra, pointCloudMode,
  selectedAtom, onSelectAtom,
}: {
  atoms: CrystalAtom[]; cell: CellParams; supercell: SupercellParams;
  showBonds: boolean; showPolyhedra: boolean; pointCloudMode: boolean;
  selectedAtom: number | null; onSelectAtom: (idx: number | null) => void;
}) {
  const scaledAtoms = useMemo(() => {
    const result: { atom: CrystalAtom; cart: [number, number, number]; idx: number }[] = [];
    for (let na = 0; na < supercell.na; na++)
      for (let nb = 0; nb < supercell.nb; nb++)
        for (let nc = 0; nc < supercell.nc; nc++)
          for (let idx = 0; idx < atoms.length; idx++) {
            const a = atoms[idx];
            const fx = (a.x + na) / supercell.na;
            const fy = (a.y + nb) / supercell.nb;
            const fz = (a.z + nc) / supercell.nc;
            const cart = fractionalToCartesian(fx, fy, fz, cell);
            result.push({ atom: a, cart, idx });
          }
    return result;
  }, [atoms, cell, supercell]);

  const bonds = useMemo(() => {
    if (!showBonds || pointCloudMode) return [];
    const result: { start: [number, number, number]; end: [number, number, number] }[] = [];
    const maxDist = 5;
    for (let i = 0; i < scaledAtoms.length; i++) {
      for (let j = i + 1; j < scaledAtoms.length; j++) {
        const r1 = COVALENT_RADII[scaledAtoms[i].atom.element] || 1.5;
        const r2 = COVALENT_RADII[scaledAtoms[j].atom.element] || 1.5;
        const maxBondDist = (r1 + r2) * 1.2;
        const dx = scaledAtoms[i].cart[0] - scaledAtoms[j].cart[0];
        const dy = scaledAtoms[i].cart[1] - scaledAtoms[j].cart[1];
        const dz = scaledAtoms[i].cart[2] - scaledAtoms[j].cart[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < maxBondDist && dist < maxDist) {
          result.push({ start: scaledAtoms[i].cart, end: scaledAtoms[j].cart });
        }
        if (result.length > 10000) return result;
      }
    }
    return result;
  }, [scaledAtoms, showBonds, pointCloudMode]);

  const polyhedraData = useMemo(() => {
    if (!showPolyhedra || pointCloudMode) return [];
    const cations = ['Na', 'Mg', 'Al', 'Si', 'K', 'Ca', 'Ti', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'Zr', 'Nb', 'Mo', 'Sn', 'Ba', 'Pb'];
    const result: { center: [number, number, number]; neighbors: [number, number, number][]; color: string }[] = [];

    for (let i = 0; i < scaledAtoms.length; i++) {
      if (!cations.includes(scaledAtoms[i].atom.element)) continue;
      const neighbors: [number, number, number][] = [];
      for (let j = 0; j < scaledAtoms.length; j++) {
        if (i === j) continue;
        if (scaledAtoms[j].atom.element !== 'O') continue;
        const dx = scaledAtoms[i].cart[0] - scaledAtoms[j].cart[0];
        const dy = scaledAtoms[i].cart[1] - scaledAtoms[j].cart[1];
        const dz = scaledAtoms[i].cart[2] - scaledAtoms[j].cart[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 3.5) neighbors.push(scaledAtoms[j].cart);
      }
      if (neighbors.length >= 4) {
        result.push({
          center: scaledAtoms[i].cart,
          neighbors,
          color: CPK_COLORS[scaledAtoms[i].atom.element] || '#ff0000',
        });
      }
      if (result.length > 200) break;
    }
    return result;
  }, [scaledAtoms, showPolyhedra, pointCloudMode]);

  const scale = 1;
  const atomScale = 0.25;

  return (
    <group>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 10]} intensity={0.8} />
      <directionalLight position={[-10, -10, -10]} intensity={0.3} />
      <UnitCellFrame cell={cell} scale={scale} />
      {scaledAtoms.map((sa, i) => {
        const r = (COVALENT_RADII[sa.atom.element] || 1.2) * atomScale;
        const color = CPK_COLORS[sa.atom.element] || '#ff69b4';
        return (
          <AtomSphere
            key={i}
            position={sa.cart.map(v => v * scale) as [number, number, number]}
            color={color}
            radius={pointCloudMode ? 0.1 : r}
            selected={selectedAtom === sa.idx}
            onClick={(e) => { e.stopPropagation(); onSelectAtom(sa.idx); }}
          />
        );
      })}
      {bonds.map((b, i) => (
        <BondCylinder key={`b${i}`} start={b.start.map(v => v * scale) as [number, number, number]} end={b.end.map(v => v * scale) as [number, number, number]} />
      ))}
      {polyhedraData.map((p, i) => (
        <PolyhedronMesh key={`p${i}`} center={p.center.map(v => v * scale) as [number, number, number]} neighbors={p.neighbors.map(n => n.map((v, j) => (v - p.center[j]) * scale + p.center[j] * scale) as [number, number, number])} color={p.color} />
      ))}
      <OrbitControls makeDefault />
    </group>
  );
}

function SymmetryViz3D({ operations, cell }: { operations: any[]; cell: CellParams }) {
  return (
    <group>
      {operations.slice(0, 10).map((op: any, i: number) => {
        const R = op.rotation;
        const trace = R[0][0] + R[1][1] + R[2][2];
        const isMirror = trace === 1 && R[0][0] * R[1][1] * R[2][2] !== 1;
        if (isMirror) {
          const size = 3;
          return (
            <mesh key={i} rotation={[0, 0, 0]} position={[0, 0, 0]}>
              <planeGeometry args={[size, size]} />
              <meshStandardMaterial color="#4488ff" transparent opacity={0.15} side={THREE.DoubleSide} />
            </mesh>
          );
        }
        return null;
      })}
    </group>
  );
}

function BraggLawDemo() {
  const [d, setD] = useState(2.0);
  const [wavelength, setWavelength] = useState(1.5406);
  const [n, setN] = useState(1);

  const sinTheta = (n * wavelength) / (2 * d);
  const valid = Math.abs(sinTheta) <= 1;
  const theta = valid ? Math.asin(sinTheta) * 180 / Math.PI : 90;
  const twoTheta = 2 * theta;

  return (
    <div style={{ padding: 12 }}>
      <h4 style={{ margin: '0 0 8px' }}>Bragg's Law: nλ = 2d·sinθ</h4>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label>d (Å): <input type="number" step="0.1" value={d} onChange={e => setD(+e.target.value)} style={{ width: 60 }} /></label>
        <label>λ (Å): <select value={wavelength} onChange={e => setWavelength(+e.target.value)}>
          {Object.entries(WAVELENGTHS).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
        </select></label>
        <label>n: <input type="number" min={1} max={5} value={n} onChange={e => setN(+e.target.value)} style={{ width: 40 }} /></label>
      </div>
      <div style={{ marginTop: 8, padding: 8, background: '#1a1a2e', borderRadius: 4, color: valid ? '#0f0' : '#f00' }}>
        {valid ? (
          <>θ = {theta.toFixed(2)}° &nbsp; 2θ = {twoTheta.toFixed(2)}° &nbsp; (n={n}, λ={wavelength}Å, d={d}Å)</>
        ) : (
          <>No diffraction: nλ/(2d) = {sinTheta.toFixed(4)} &gt; 1</>
        )}
      </div>
    </div>
  );
}

function ReciprocalSpaceView({ cell }: { cell: CellParams }) {
  const rc = computeReciprocalCell(cell);
  const maxHKL = 5;
  const points: [number, number, number][] = [];

  for (let h = -maxHKL; h <= maxHKL; h++)
    for (let k = -maxHKL; k <= maxHKL; k++)
      for (let l = -maxHKL; l <= maxHKL; l++) {
        if (h === 0 && k === 0 && l === 0) continue;
        const gx = h * rc.a_star;
        const gy = k * rc.b_star;
        const gz = l * rc.c_star;
        const glen = Math.sqrt(gx * gx + gy * gy + gz * gz);
        if (glen < 2) points.push([gx * 2, gy * 2, gz * 2]);
      }

  return (
    <div style={{ height: 250 }}>
      <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
        <ambientLight intensity={0.6} />
        {points.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color={Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) < 1 ? '#ff4444' : '#44aaff'} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.08} wireframe />
        </mesh>
        <OrbitControls />
      </Canvas>
    </div>
  );
}

export default function App() {
  const [cell, setCell] = useState<CellParams>(DEFAULT_CELL);
  const [spaceGroupNum, setSpaceGroupNum] = useState(225);
  const [asymAtoms, setAsymAtoms] = useState<AsymAtom[]>([
    { element: 'Na', x: 0, y: 0, z: 0, occupancy: 1, biso: 1 },
    { element: 'Cl', x: 0.5, y: 0, z: 0, occupancy: 1, biso: 1 },
  ]);
  const [crystalAtoms, setCrystalAtoms] = useState<CrystalAtom[]>([]);
  const [xrdParams, setXrdParams] = useState<XRDParams>(DEFAULT_XRD_PARAMS);
  const [xrdPattern, setXrdPattern] = useState<XRDPattern | null>(null);
  const [supercell, setSupercell] = useState<SupercellParams>({ na: 1, nb: 1, nc: 1 });
  const [showBonds, setShowBonds] = useState(true);
  const [showPolyhedra, setShowPolyhedra] = useState(false);
  const [selectedAtom, setSelectedAtom] = useState<number | null>(null);
  const [sfDetail, setSfDetail] = useState<StructureFactorDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'structure' | 'xrd' | 'compare' | 'teaching'>('structure');
  const [showSymmetryViz, setShowSymmetryViz] = useState(false);
  const [compareAtoms, setCompareAtoms] = useState<CrystalAtom[]>([]);
  const [compareCell, setCompareCell] = useState<CellParams | null>(null);
  const [rmsd, setRmsd] = useState<number | null>(null);
  const [wasmReady, setWasmReady] = useState(false);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    initWasm().then(ok => setWasmReady(ok));
  }, []);

  const sg = getSpaceGroupByNumber(spaceGroupNum);

  useEffect(() => {
    if (!sg) return;
    const ops = sg.operations.length > 0 ? sg.operations : [{ rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0] }];
    const atoms = generateEquivalentPositions(asymAtoms, ops, 0.01);
    setCrystalAtoms(atoms);
  }, [asymAtoms, spaceGroupNum]);

  const totalAtoms = crystalAtoms.length * supercell.na * supercell.nb * supercell.nc;
  const pointCloudMode = totalAtoms > 5000;

  const computeXRD = useCallback(() => {
    if (crystalAtoms.length === 0) return;
    setComputing(true);
    setTimeout(() => {
      const result = calculateXRDPattern(
        crystalAtoms, cell,
        xrdParams.wavelength, xrdParams.dMin,
        xrdParams.twoThetaMin, xrdParams.twoThetaMax,
        xrdParams.u, xrdParams.v, xrdParams.w, xrdParams.eta,
      );
      setXrdPattern(result);
      setComputing(false);
    }, 50);
  }, [crystalAtoms, cell, xrdParams]);

  useEffect(() => {
    if (crystalAtoms.length > 0) computeXRD();
  }, [crystalAtoms, cell]);

  const handleCIFImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.cif';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = parseCIF(text);
      if (result) {
        setCell(result.cell);
        setAsymAtoms(result.atoms);
        const sgMatch = SPACE_GROUPS.find(s => s.symbol === result.spaceGroup);
        if (sgMatch) setSpaceGroupNum(sgMatch.number);
      }
    };
    input.click();
  }, []);

  const handleCIFExport = useCallback(() => {
    const sgObj = getSpaceGroupByNumber(spaceGroupNum);
    const cif = exportCIF(cell, sgObj?.symbol || 'P1', asymAtoms);
    const blob = new Blob([cif], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crystal.cif';
    a.click();
    URL.revokeObjectURL(url);
  }, [cell, spaceGroupNum, asymAtoms]);

  const handlePreset = useCallback((preset: typeof PRESETS[0]) => {
    setCell({ a: preset.a, b: preset.b, c: preset.c, alpha: preset.alpha, beta: preset.beta, gamma: preset.gamma });
    setSpaceGroupNum(preset.spaceGroupNumber);
    setAsymAtoms(preset.atoms.map(a => ({ ...a })));
  }, []);

  const handleCompare = useCallback(() => {
    setCompareAtoms([...crystalAtoms]);
    setCompareCell({ ...cell });
  }, [crystalAtoms, cell]);

  const computeRMSD = useCallback(() => {
    if (compareAtoms.length === 0 || crystalAtoms.length === 0) return;
    const n = Math.min(compareAtoms.length, crystalAtoms.length);
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sumSq += (crystalAtoms[i].x - compareAtoms[i].x) ** 2 +
               (crystalAtoms[i].y - compareAtoms[i].y) ** 2 +
               (crystalAtoms[i].z - compareAtoms[i].z) ** 2;
    }
    setRmsd(Math.sqrt(sumSq / n));
  }, [crystalAtoms, compareAtoms]);

  const selectedAtomInfo = useMemo(() => {
    if (selectedAtom === null || crystalAtoms.length === 0) return null;
    const atom = crystalAtoms[selectedAtom];
    if (!atom) return null;
    const bonds: { element: string; dist: number }[] = [];
    for (let i = 0; i < crystalAtoms.length; i++) {
      if (i === selectedAtom) continue;
      const dist = computeDistance(atom, crystalAtoms[i], cell);
      const r1 = COVALENT_RADII[atom.element] || 1.5;
      const r2 = COVALENT_RADII[crystalAtoms[i].element] || 1.5;
      if (dist < (r1 + r2) * 1.2) bonds.push({ element: crystalAtoms[i].element, dist });
    }
    return { atom, bonds: bonds.sort((a, b) => a.dist - b.dist).slice(0, 12) };
  }, [selectedAtom, crystalAtoms, cell]);

  const groupedSpaceGroups = useMemo(() => {
    const groups: Record<string, typeof SPACE_GROUPS> = {};
    for (const sys of CRYSTAL_SYSTEMS) groups[sys] = [];
    for (const sg of SPACE_GROUPS) groups[sg.crystalSystem]?.push(sg);
    return groups;
  }, []);

  const style: React.CSSProperties = {
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    background: '#0d1117',
    color: '#c9d1d9',
    fontSize: 13,
  };

  const panelStyle: React.CSSProperties = {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  };

  const inputStyle: React.CSSProperties = {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 4,
    color: '#c9d1d9',
    padding: '2px 6px',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#8b949e',
    marginBottom: 2,
  };

  const btnStyle: React.CSSProperties = {
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  };

  const btnSecStyle: React.CSSProperties = {
    ...btnStyle,
    background: '#30363d',
  };

  return (
    <div style={{ ...style, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 16px', background: '#010409', borderBottom: '1px solid #30363d', gap: 16 }}>
        <h1 style={{ fontSize: 16, margin: 0, color: '#58a6ff' }}>⚛ Crystal XRD</h1>
        <span style={{ fontSize: 11, color: '#8b949e' }}>3D Crystal Structure Editor & X-ray Diffraction Simulator</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: wasmReady ? '#3fb950' : '#f85149' }}>
          WASM: {wasmReady ? '✓' : 'JS Fallback'}
        </span>
        <select style={{ ...inputStyle, width: 160 }} onChange={e => { const p = PRESETS.find(pp => pp.name === e.target.value); if (p) handlePreset(p); }} defaultValue="">
          <option value="" disabled>Load Preset...</option>
          {PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <button style={btnSecStyle} onClick={handleCIFImport}>Import CIF</button>
        <button style={btnSecStyle} onClick={handleCIFExport}>Export CIF</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 300, overflowY: 'auto', padding: 8, borderRight: '1px solid #30363d' }}>
          <div style={panelStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#58a6ff' }}>Unit Cell Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {(['a', 'b', 'c'] as const).map(k => (
                <div key={k}><div style={labelStyle}>{k} (Å)</div><input style={inputStyle} type="number" step="0.01" value={cell[k]} onChange={e => setCell({ ...cell, [k]: +e.target.value })} /></div>
              ))}
              {(['alpha', 'beta', 'gamma'] as const).map(k => (
                <div key={k}><div style={labelStyle}>{k} (°)</div><input style={inputStyle} type="number" step="0.1" value={cell[k]} onChange={e => setCell({ ...cell, [k]: +e.target.value })} /></div>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#58a6ff' }}>Space Group</div>
            <select style={{ ...inputStyle, width: '100%' }} value={spaceGroupNum} onChange={e => setSpaceGroupNum(+e.target.value)}>
              {CRYSTAL_SYSTEMS.map(sys => (
                <optgroup key={sys} label={sys}>
                  {(groupedSpaceGroups[sys] || []).map(sg => (
                    <option key={sg.number} value={sg.number}>{sg.number} - {sg.symbol}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
              {sg?.symbol} ({sg?.operations.length} operations) • {crystalAtoms.length} atoms in cell
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: '#58a6ff' }}>Asymmetric Unit Atoms</span>
              <button style={{ ...btnStyle, padding: '2px 8px', fontSize: 11 }} onClick={() => setAsymAtoms([...asymAtoms, { element: 'C', x: 0, y: 0, z: 0, occupancy: 1, biso: 1 }])}>+ Add</button>
            </div>
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              {asymAtoms.map((a, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 1fr 20px', gap: 2, marginBottom: 2, alignItems: 'center' }}>
                  <input style={{ ...inputStyle, width: 36, textAlign: 'center' }} value={a.element} onChange={e => { const n = [...asymAtoms]; n[i] = { ...n[i], element: e.target.value }; setAsymAtoms(n); }} />
                  <input style={inputStyle} type="number" step="0.01" value={a.x} onChange={e => { const n = [...asymAtoms]; n[i] = { ...n[i], x: +e.target.value }; setAsymAtoms(n); }} placeholder="x" />
                  <input style={inputStyle} type="number" step="0.01" value={a.y} onChange={e => { const n = [...asymAtoms]; n[i] = { ...n[i], y: +e.target.value }; setAsymAtoms(n); }} placeholder="y" />
                  <input style={inputStyle} type="number" step="0.01" value={a.z} onChange={e => { const n = [...asymAtoms]; n[i] = { ...n[i], z: +e.target.value }; setAsymAtoms(n); }} placeholder="z" />
                  <span style={{ cursor: 'pointer', color: '#f85149', fontSize: 14 }} onClick={() => setAsymAtoms(asymAtoms.filter((_, j) => j !== i))}>×</span>
                </div>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#58a6ff' }}>Supercell</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {(['na', 'nb', 'nc'] as const).map(k => (
                <div key={k}>
                  <div style={labelStyle}>{k.replace('n', 'N')}{k.slice(1)}</div>
                  <input style={inputStyle} type="number" min={1} max={5} value={supercell[k]} onChange={e => setSupercell({ ...supercell, [k]: Math.min(5, Math.max(1, +e.target.value)) })} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: pointCloudMode ? '#f85149' : '#8b949e', marginTop: 4 }}>
              Total: {totalAtoms} atoms {pointCloudMode ? '(point cloud mode)' : ''}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#58a6ff' }}>Display Options</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <input type="checkbox" checked={showBonds} onChange={e => setShowBonds(e.target.checked)} /> Show Bonds
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <input type="checkbox" checked={showPolyhedra} onChange={e => setShowPolyhedra(e.target.checked)} /> Polyhedra Mode
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showSymmetryViz} onChange={e => setShowSymmetryViz(e.target.checked)} /> Symmetry Elements
            </label>
          </div>

          {selectedAtomInfo && (
            <div style={panelStyle}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#58a6ff' }}>Selected Atom</div>
              <div style={{ fontSize: 12 }}>
                <div>{selectedAtomInfo.atom.element} ({selectedAtomInfo.atom.x.toFixed(4)}, {selectedAtomInfo.atom.y.toFixed(4)}, {selectedAtomInfo.atom.z.toFixed(4)})</div>
                <div style={{ marginTop: 4, color: '#8b949e' }}>Bonds:</div>
                {selectedAtomInfo.bonds.map((b, i) => (
                  <div key={i} style={{ fontSize: 11 }}>→ {b.element}: {b.dist.toFixed(3)} Å</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 0, background: '#010409', borderBottom: '1px solid #30363d' }}>
            {(['structure', 'xrd', 'compare', 'teaching'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '6px 16px', border: 'none', cursor: 'pointer',
                background: activeTab === tab ? '#161b22' : 'transparent',
                color: activeTab === tab ? '#58a6ff' : '#8b949e',
                borderBottom: activeTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                fontWeight: 600, fontSize: 13,
              }}>
                {tab === 'structure' ? '3D Structure' : tab === 'xrd' ? 'XRD Pattern' : tab === 'compare' ? 'Compare' : 'Teaching'}
              </button>
            ))}
          </div>

          {activeTab === 'structure' && (
            <div style={{ flex: 1, background: '#0d1117' }}>
              <Canvas camera={{ position: [8, 8, 8], fov: 50 }} onClick={() => setSelectedAtom(null)}>
                <CrystalScene
                  atoms={crystalAtoms}
                  cell={cell}
                  supercell={supercell}
                  showBonds={showBonds}
                  showPolyhedra={showPolyhedra}
                  pointCloudMode={pointCloudMode}
                  selectedAtom={selectedAtom}
                  onSelectAtom={setSelectedAtom}
                />
                {showSymmetryViz && sg && <SymmetryViz3D operations={sg.operations} cell={cell} />}
              </Canvas>
            </div>
          )}

          {activeTab === 'xrd' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
              <div style={{ padding: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 11, color: '#8b949e' }}>λ:
                  <select style={{ ...inputStyle, width: 100, marginLeft: 4 }} value={xrdParams.wavelength} onChange={e => setXrdParams({ ...xrdParams, wavelength: +e.target.value })}>
                    {Object.entries(WAVELENGTHS).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: '#8b949e' }}>d<sub>min</sub>:
                  <input style={{ ...inputStyle, width: 50, marginLeft: 4 }} type="number" step="0.1" value={xrdParams.dMin} onChange={e => setXrdParams({ ...xrdParams, dMin: +e.target.value })} />
                </label>
                <label style={{ fontSize: 11, color: '#8b949e' }}>2θ range:
                  <input style={{ ...inputStyle, width: 40, marginLeft: 4 }} type="number" value={xrdParams.twoThetaMin} onChange={e => setXrdParams({ ...xrdParams, twoThetaMin: +e.target.value })} />
                  -
                  <input style={{ ...inputStyle, width: 40 }} type="number" value={xrdParams.twoThetaMax} onChange={e => setXrdParams({ ...xrdParams, twoThetaMax: +e.target.value })} />°
                </label>
                <label style={{ fontSize: 11, color: '#8b949e' }}>U:
                  <input style={{ ...inputStyle, width: 45, marginLeft: 4 }} type="number" step="0.01" value={xrdParams.u} onChange={e => setXrdParams({ ...xrdParams, u: +e.target.value })} />
                </label>
                <label style={{ fontSize: 11, color: '#8b949e' }}>V:
                  <input style={{ ...inputStyle, width: 45, marginLeft: 4 }} type="number" step="0.01" value={xrdParams.v} onChange={e => setXrdParams({ ...xrdParams, v: +e.target.value })} />
                </label>
                <label style={{ fontSize: 11, color: '#8b949e' }}>W:
                  <input style={{ ...inputStyle, width: 45, marginLeft: 4 }} type="number" step="0.01" value={xrdParams.w} onChange={e => setXrdParams({ ...xrdParams, w: +e.target.value })} />
                </label>
                <label style={{ fontSize: 11, color: '#8b949e' }}>η:
                  <input style={{ ...inputStyle, width: 45, marginLeft: 4 }} type="number" step="0.05" min={0} max={1} value={xrdParams.eta} onChange={e => setXrdParams({ ...xrdParams, eta: +e.target.value })} />
                </label>
                <button style={btnStyle} onClick={computeXRD} disabled={computing}>
                  {computing ? 'Computing...' : 'Calculate XRD'}
                </button>
              </div>

              {xrdPattern && (
                <>
                  <div style={{ flex: 1, minHeight: 250 }}>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={xrdPattern.profile.map(([x, y]) => ({ x: x.toFixed(2), y }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                        <XAxis dataKey="x" stroke="#8b949e" tick={{ fontSize: 10 }} label={{ value: '2θ (°)', position: 'insideBottom', offset: -2, style: { fill: '#8b949e', fontSize: 10 } }} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10 }} label={{ value: 'I (rel.)', angle: -90, position: 'insideLeft', style: { fill: '#8b949e', fontSize: 10 } }} />
                        <RTooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 11 }} />
                        <Area type="monotone" dataKey="y" stroke="#58a6ff" fill="#1f6feb33" />
                        {xrdPattern.peaks.filter(p => p.intensity > 5).map((peak, i) => (
                          <ReferenceLine key={i} x={peak.two_theta.toFixed(2)} stroke="#f0883e88" />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ maxHeight: 300, overflowY: 'auto', padding: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #30363d' }}>
                          {['hkl', 'd (Å)', '2θ (°)', 'Mult.', 'I (%)'].map(h => (
                            <th key={h} style={{ padding: '3px 6px', textAlign: 'left', color: '#8b949e' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {xrdPattern.peaks.sort((a, b) => b.intensity - a.intensity).slice(0, 50).map((peak, i) => (
                          <tr key={i} style={{ cursor: 'pointer', borderBottom: '1px solid #21262d' }}
                            onClick={() => {
                              const detail = calculateStructureFactorDetail(crystalAtoms, cell, peak.h, peak.k, peak.l, xrdParams.wavelength);
                              setSfDetail(detail);
                            }}
                            onMouseOver={e => (e.currentTarget.style.background = '#1f6feb33')}
                            onMouseOut={e => (e.currentTarget.style.background = '')}
                          >
                            <td style={{ padding: '3px 6px' }}>({peak.h} {peak.k} {peak.l})</td>
                            <td style={{ padding: '3px 6px' }}>{peak.d_spacing.toFixed(4)}</td>
                            <td style={{ padding: '3px 6px' }}>{peak.two_theta.toFixed(2)}</td>
                            <td style={{ padding: '3px 6px' }}>{peak.multiplicity}</td>
                            <td style={{ padding: '3px 6px' }}>{peak.intensity.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'compare' && (
            <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
              <div style={panelStyle}>
                <h3 style={{ margin: '0 0 8px', color: '#58a6ff' }}>Structure Comparison</h3>
                <p style={{ fontSize: 12, color: '#8b949e' }}>Compare two crystal structures and compute RMSD.</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={btnStyle} onClick={handleCompare}>Save Current as Reference</button>
                  <button style={btnSecStyle} onClick={computeRMSD} disabled={!compareAtoms.length}>Compute RMSD</button>
                </div>
                {compareAtoms.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <div style={{ color: '#3fb950' }}>Reference saved: {compareAtoms.length} atoms</div>
                    <div>Current: {crystalAtoms.length} atoms</div>
                    {rmsd !== null && <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: '#f0883e' }}>RMSD = {rmsd.toFixed(6)}</div>}
                  </div>
                )}
              </div>
              {compareAtoms.length > 0 && (
                <div style={{ height: 300, marginTop: 8 }}>
                  <Canvas camera={{ position: [8, 8, 8], fov: 50 }}>
                    <ambientLight intensity={0.4} />
                    <directionalLight position={[10, 10, 10]} intensity={0.8} />
                    {crystalAtoms.map((a, i) => {
                      const cart = fractionalToCartesian(a.x, a.y, a.z, cell);
                      const isDiff = i < compareAtoms.length && (
                        Math.abs(a.x - compareAtoms[i].x) > 0.01 ||
                        Math.abs(a.y - compareAtoms[i].y) > 0.01 ||
                        Math.abs(a.z - compareAtoms[i].z) > 0.01
                      );
                      return (
                        <mesh key={`c${i}`} position={cart}>
                          <sphereGeometry args={[isDiff ? 0.3 : 0.15, 8, 8]} />
                          <meshStandardMaterial color={isDiff ? '#ff4444' : (CPK_COLORS[a.element] || '#ff69b4')} />
                        </mesh>
                      );
                    })}
                    <OrbitControls />
                  </Canvas>
                </div>
              )}
            </div>
          )}

          {activeTab === 'teaching' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <div style={panelStyle}>
                <h3 style={{ margin: '0 0 8px', color: '#58a6ff' }}>Bragg's Law Interactive Demo</h3>
                <BraggLawDemo />
              </div>
              <div style={panelStyle}>
                <h3 style={{ margin: '0 0 8px', color: '#58a6ff' }}>Reciprocal Space & Ewald Sphere</h3>
                <p style={{ fontSize: 12, color: '#8b949e', margin: '0 0 8px' }}>
                  Red points: reciprocal lattice points within Ewald sphere (satisfying diffraction condition).
                  Blue: outside. Sphere radius = 1/λ.
                </p>
                <ReciprocalSpaceView cell={cell} />
              </div>
              <div style={panelStyle}>
                <h3 style={{ margin: '0 0 8px', color: '#58a6ff' }}>Symmetry Operations</h3>
                {sg && (
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {sg.operations.map((op, i) => {
                      const R = op.rotation;
                      const t = op.translation;
                      return (
                        <div key={i} style={{ fontSize: 11, padding: '2px 0', borderBottom: '1px solid #21262d' }}>
                          Op {i + 1}: R=[{R.flat().map(v => v.toFixed(0)).join(',')}] t=[{t.map(v => v.toFixed(2)).join(',')}]
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {sfDetail && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSfDetail(null)}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16, maxWidth: 700, maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#58a6ff' }}>Structure Factor: ({sfDetail.h} {sfDetail.k} {sfDetail.l})</h3>
              <span style={{ cursor: 'pointer', color: '#f85149', fontSize: 18 }} onClick={() => setSfDetail(null)}>×</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div style={panelStyle}>d = {sfDetail.d_spacing.toFixed(4)} Å</div>
              <div style={panelStyle}>2θ = {sfDetail.two_theta.toFixed(2)}°</div>
              <div style={panelStyle}>Mult. = {sfDetail.multiplicity}</div>
              <div style={panelStyle}>F(real) = {sfDetail.f_real.toFixed(4)}</div>
              <div style={panelStyle}>F(imag) = {sfDetail.f_imag.toFixed(4)}</div>
              <div style={panelStyle}>|F|² = {(sfDetail.f_real ** 2 + sfDetail.f_imag ** 2).toFixed(4)}</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d' }}>
                  {['Atom', 'x', 'y', 'z', 'fⱼ', 'Phase', 'Re', 'Im'].map(h => (
                    <th key={h} style={{ padding: '3px 6px', textAlign: 'left', color: '#8b949e' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sfDetail.atom_contributions.map((ac, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '3px 6px' }}>{ac.element}</td>
                    <td style={{ padding: '3px 6px' }}>{ac.x.toFixed(4)}</td>
                    <td style={{ padding: '3px 6px' }}>{ac.y.toFixed(4)}</td>
                    <td style={{ padding: '3px 6px' }}>{ac.z.toFixed(4)}</td>
                    <td style={{ padding: '3px 6px' }}>{ac.f_j.toFixed(4)}</td>
                    <td style={{ padding: '3px 6px' }}>{(ac.phase / Math.PI).toFixed(2)}π</td>
                    <td style={{ padding: '3px 6px' }}>{ac.contrib_real.toFixed(4)}</td>
                    <td style={{ padding: '3px 6px' }}>{ac.contrib_imag.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
