use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;

#[derive(Deserialize)]
struct AtomInput {
    element: String,
    x: f64,
    y: f64,
    z: f64,
    occupancy: f64,
    biso: f64,
}

#[derive(Deserialize)]
struct SymOp {
    rotation: [[f64; 3]; 3],
    translation: [f64; 3],
}

#[derive(Serialize, Deserialize)]
struct AtomOutput {
    element: String,
    x: f64,
    y: f64,
    z: f64,
    occupancy: f64,
    biso: f64,
    asym_id: usize,
}

pub fn generate_equivalent_positions(
    atoms_json: &str,
    operations_json: &str,
    tolerance: f64,
) -> Result<String, JsValue> {
    let atoms: Vec<AtomInput> = serde_json::from_str(atoms_json)
        .map_err(|e| JsValue::from_str(&format!("Parse atoms error: {}", e)))?;
    let operations: Vec<SymOp> = serde_json::from_str(operations_json)
        .map_err(|e| JsValue::from_str(&format!("Parse operations error: {}", e)))?;

    let mut result: Vec<AtomOutput> = Vec::new();

    for (asym_id, atom) in atoms.iter().enumerate() {
        for op in &operations {
            let nx = op.rotation[0][0] * atom.x + op.rotation[0][1] * atom.y + op.rotation[0][2] * atom.z + op.translation[0];
            let ny = op.rotation[1][0] * atom.x + op.rotation[1][1] * atom.y + op.rotation[1][2] * atom.z + op.translation[1];
            let nz = op.rotation[2][0] * atom.x + op.rotation[2][1] * atom.y + op.rotation[2][2] * atom.z + op.translation[2];

            let fx = modulo1(nx);
            let fy = modulo1(ny);
            let fz = modulo1(nz);

            let is_dup = result.iter().any(|a| {
                a.element == atom.element
                    && (a.x - fx).abs() < tolerance
                    && (a.y - fy).abs() < tolerance
                    && (a.z - fz).abs() < tolerance
            });

            if !is_dup {
                result.push(AtomOutput {
                    element: atom.element.clone(),
                    x: fx,
                    y: fy,
                    z: fz,
                    occupancy: atom.occupancy,
                    biso: atom.biso,
                    asym_id,
                });
            }
        }
    }

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

fn modulo1(v: f64) -> f64 {
    let r = v % 1.0;
    if r < 0.0 { r + 1.0 } else { r }
}

pub fn calculate_rmsd(atoms1_json: &str, atoms2_json: &str) -> Result<f64, JsValue> {
    let atoms1: Vec<AtomOutput> = serde_json::from_str(atoms1_json)
        .map_err(|e| JsValue::from_str(&format!("Parse atoms1 error: {}", e)))?;
    let atoms2: Vec<AtomOutput> = serde_json::from_str(atoms2_json)
        .map_err(|e| JsValue::from_str(&format!("Parse atoms2 error: {}", e)))?;

    if atoms1.len() != atoms2.len() {
        return Err(JsValue::from_str("Atom counts differ"));
    }

    let n = atoms1.len() as f64;
    let sum_sq: f64 = atoms1.iter().zip(atoms2.iter())
        .map(|(a, b)| {
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let dz = a.z - b.z;
            dx * dx + dy * dy + dz * dz
        })
        .sum();

    Ok(sum_sq.sqrt() / n.sqrt())
}
