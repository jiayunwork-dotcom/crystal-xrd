mod symmetry;
mod xrd;
mod scattering;
mod cif;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn generate_equivalent_positions(
    atoms_json: &str,
    operations_json: &str,
    tolerance: f64,
) -> Result<String, JsValue> {
    symmetry::generate_equivalent_positions(atoms_json, operations_json, tolerance)
}

#[wasm_bindgen]
pub fn calculate_xrd_pattern(
    atoms_json: &str,
    cell_params_json: &str,
    wavelength: f64,
    d_min: f64,
    two_theta_min: f64,
    two_theta_max: f64,
    u: f64,
    v: f64,
    w: f64,
    eta: f64,
) -> Result<String, JsValue> {
    xrd::calculate_xrd_pattern(
        atoms_json, cell_params_json, wavelength, d_min,
        two_theta_min, two_theta_max, u, v, w, eta,
    )
}

#[wasm_bindgen]
pub fn calculate_structure_factor_detail(
    atoms_json: &str,
    cell_params_json: &str,
    h: i32,
    k: i32,
    l: i32,
    wavelength: f64,
) -> Result<String, JsValue> {
    xrd::calculate_structure_factor_detail(atoms_json, cell_params_json, h, k, l, wavelength)
}

#[wasm_bindgen]
pub fn parse_cif(cif_text: &str) -> Result<String, JsValue> {
    cif::parse_cif(cif_text)
}

#[wasm_bindgen]
pub fn calculate_rmsd(atoms1_json: &str, atoms2_json: &str) -> Result<f64, JsValue> {
    symmetry::calculate_rmsd(atoms1_json, atoms2_json)
}

#[wasm_bindgen]
pub fn compute_reciprocal_cell(
    a: f64, b: f64, c: f64,
    alpha: f64, beta: f64, gamma: f64,
) -> Result<String, JsValue> {
    xrd::compute_reciprocal_cell(a, b, c, alpha, beta, gamma)
}
