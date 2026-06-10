use crate::scattering::compute_f;
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
struct CellParams {
    a: f64,
    b: f64,
    c: f64,
    alpha: f64,
    beta: f64,
    gamma: f64,
}

#[derive(Serialize)]
struct XRDPeak {
    h: i32,
    k: i32,
    l: i32,
    d_spacing: f64,
    two_theta: f64,
    multiplicity: i32,
    intensity: f64,
    f_real: f64,
    f_imag: f64,
}

#[derive(Serialize)]
struct XRDPattern {
    peaks: Vec<XRDPeak>,
    profile: Vec<[f64; 2]>,
}

#[derive(Serialize)]
struct SFDetail {
    h: i32,
    k: i32,
    l: i32,
    d_spacing: f64,
    two_theta: f64,
    multiplicity: i32,
    f_real: f64,
    f_imag: f64,
    intensity_percent: f64,
    atom_contributions: Vec<AtomContribution>,
}

#[derive(Serialize)]
struct AtomContribution {
    element: String,
    x: f64,
    y: f64,
    z: f64,
    f_j: f64,
    phase: f64,
    contrib_real: f64,
    contrib_imag: f64,
}

#[derive(Serialize)]
struct ReciprocalCell {
    a_star: f64,
    b_star: f64,
    c_star: f64,
    alpha_star: f64,
    beta_star: f64,
    gamma_star: f64,
}

fn deg2rad(d: f64) -> f64 {
    d * std::f64::consts::PI / 180.0
}

fn compute_d_spacing(cell: &CellParams, h: i32, k: i32, l: i32) -> f64 {
    let a = cell.a;
    let b = cell.b;
    let c = cell.c;
    let al = deg2rad(cell.alpha);
    let be = deg2rad(cell.beta);
    let ga = deg2rad(cell.gamma);

    let cos_al = al.cos();
    let cos_be = be.cos();
    let cos_ga = ga.cos();
    let sin_al = al.sin();
    let sin_be = be.sin();
    let sin_ga = ga.sin();

    let vol = a * b * c * (1.0 - cos_al * cos_al - cos_be * cos_be - cos_ga * cos_ga
        + 2.0 * cos_al * cos_be * cos_ga).sqrt();

    let s11 = b * b * c * c * sin_al * sin_al;
    let s22 = a * a * c * c * sin_be * sin_be;
    let s33 = a * a * b * b * sin_ga * sin_ga;
    let s12 = a * b * c * c * (cos_al * cos_be - cos_ga);
    let s23 = a * a * b * c * (cos_be * cos_ga - cos_al);
    let s13 = a * b * b * c * (cos_ga * cos_al - cos_be);

    let inv_d2 = (s11 * (h as f64) * (h as f64)
        + s22 * (k as f64) * (k as f64)
        + s33 * (l as f64) * (l as f64)
        + 2.0 * s12 * (h as f64) * (k as f64)
        + 2.0 * s23 * (k as f64) * (l as f64)
        + 2.0 * s13 * (h as f64) * (l as f64)) / (vol * vol);

    if inv_d2 <= 0.0 {
        return 0.0;
    }
    1.0 / inv_d2.sqrt()
}

fn compute_structure_factor(
    atoms: &[AtomInput],
    h: i32,
    k: i32,
    l: i32,
    sin_theta_over_lambda: f64,
) -> (f64, f64) {
    let mut f_real = 0.0;
    let mut f_imag = 0.0;

    for atom in atoms {
        let f_j = compute_f(&atom.element, sin_theta_over_lambda);
        let dw = (-atom.biso * sin_theta_over_lambda * sin_theta_over_lambda).exp();
        let phase = 2.0 * std::f64::consts::PI * (h as f64 * atom.x + k as f64 * atom.y + l as f64 * atom.z);
        f_real += atom.occupancy * f_j * dw * phase.cos();
        f_imag += atom.occupancy * f_j * dw * phase.sin();
    }

    (f_real, f_imag)
}

fn lorentz_polarization(two_theta_rad: f64) -> f64 {
    let sin_t = (two_theta_rad / 2.0).sin();
    let cos_t = (two_theta_rad / 2.0).cos();
    let cos_2t = two_theta_rad.cos();
    (1.0 + cos_2t * cos_2t) / (sin_t * sin_t * sin_t * 2.0 * cos_t * 4.0)
}

fn pseudo_voigt(x: f64, center: f64, fwhm: f64, eta: f64) -> f64 {
    if fwhm <= 0.0 {
        return 0.0;
    }
    let sigma = fwhm / (2.0 * (2.0_f64.ln()).sqrt());
    let gamma_l = fwhm / 2.0;
    let gauss = (-(x - center) * (x - center) / (2.0 * sigma * sigma)).exp()
        / (sigma * (2.0 * std::f64::consts::PI).sqrt());
    let lorentz = gamma_l / (std::f64::consts::PI * ((x - center) * (x - center) + gamma_l * gamma_l));
    eta * lorentz + (1.0 - eta) * gauss
}

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
    let atoms: Vec<AtomInput> = serde_json::from_str(atoms_json)
        .map_err(|e| JsValue::from_str(&format!("Parse atoms error: {}", e)))?;
    let cell: CellParams = serde_json::from_str(cell_params_json)
        .map_err(|e| JsValue::from_str(&format!("Parse cell error: {}", e)))?;

    let max_hkl = 30;
    let mut peaks: Vec<XRDPeak> = Vec::new();

    for h in -max_hkl..=max_hkl {
        for k in -max_hkl..=max_hkl {
            for l in -max_hkl..=max_hkl {
                if h == 0 && k == 0 && l == 0 {
                    continue;
                }
                let d = compute_d_spacing(&cell, h, k, l);
                if d < d_min || d <= 0.0 {
                    continue;
                }
                let sin_theta = wavelength / (2.0 * d);
                if sin_theta.abs() > 1.0 {
                    continue;
                }
                let two_theta = 2.0 * sin_theta.asin() * 180.0 / std::f64::consts::PI;
                if two_theta < two_theta_min || two_theta > two_theta_max {
                    continue;
                }

                let already = peaks.iter().any(|p| {
                    (p.d_spacing - d).abs() < 0.001
                });
                if already {
                    continue;
                }

                let s = sin_theta / wavelength;
                let (f_real, f_imag) = compute_structure_factor(&atoms, h, k, l, s);
                let f_sq = f_real * f_real + f_imag * f_imag;

                let two_theta_rad = deg2rad(two_theta);
                let lp = lorentz_polarization(two_theta_rad);

                let mult = compute_multiplicity(h, k, l, &cell);

                let intensity = f_sq * (mult as f64) * lp;

                if intensity > 1e-6 {
                    peaks.push(XRDPeak {
                        h, k, l,
                        d_spacing: d,
                        two_theta,
                        multiplicity: mult,
                        intensity,
                        f_real,
                        f_imag,
                    });
                }
            }
        }
    }

    if peaks.is_empty() {
        return serde_json::to_string(&XRDPattern { peaks: vec![], profile: vec![] })
            .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)));
    }

    let max_intensity = peaks.iter().map(|p| p.intensity).fold(0.0_f64, f64::max);
    for peak in &mut peaks {
        peak.intensity = peak.intensity / max_intensity * 100.0;
    }

    peaks.sort_by(|a, b| a.two_theta.partial_cmp(&b.two_theta).unwrap());

    let mut profile: Vec<[f64; 2]> = Vec::new();
    let step = 0.02;
    let mut tt = two_theta_min;
    while tt <= two_theta_max {
        let mut intensity = 0.0;
        for peak in &peaks {
            let tan_tt = deg2rad(tt).tan();
            let _fwhm = (u * tan_tt * tan_tt + v * tan_tt + w).sqrt().max(0.01);
            let peak_tt_rad = deg2rad(peak.two_theta);
            let tan_peak = peak_tt_rad.tan();
            let peak_fwhm = (u * tan_peak * tan_peak + v * tan_peak + w).sqrt().max(0.01);
            intensity += peak.intensity * pseudo_voigt(tt, peak.two_theta, peak_fwhm, eta);
        }
        profile.push([tt, intensity]);
        tt += step;
    }

    let result = XRDPattern { peaks, profile };
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

fn compute_multiplicity(h: i32, k: i32, l: i32, _cell: &CellParams) -> i32 {
    let mut equivalents: Vec<(i32, i32, i32)> = Vec::new();
    let perms: [(i32, i32, i32); 48] = [
        (h,k,l),(h,l,k),(k,h,l),(k,l,h),(l,h,k),(l,k,h),
        (-h,k,l),(-h,l,k),(h,-k,l),(h,-l,k),(h,k,-l),(h,l,-k),
        (h,-k,-l),(h,-l,-k),(-h,k,-l),(-h,l,-k),(-h,-k,l),(-h,-l,k),
        (-h,-k,-l),(-h,-l,-k),(-k,-h,-l),(-k,-l,-h),(-l,-h,-k),(-l,-k,-h),
        (k,h,-l),(k,-h,l),(-k,h,l),(-k,-h,-l),(l,h,-k),(l,-h,k),
        (-l,h,k),(-l,-h,-k),(h,l,-k),(-h,l,k),(h,-l,-k),(-h,-l,k),
        (k,l,-h),(-k,l,h),(k,-l,-h),(-k,-l,h),(l,k,-h),(-l,k,h),
        (l,-k,-h),(-l,-k,h),(-h,k,-l),(-h,-k,l),(h,-k,l),(h,k,-l),
    ];

    for (ph, pk, pl) in &perms {
        if !equivalents.iter().any(|&(eh, ek, el)| eh == *ph && ek == *pk && el == *pl) {
            equivalents.push((*ph, *pk, *pl));
        }
    }
    equivalents.len() as i32
}

pub fn calculate_structure_factor_detail(
    atoms_json: &str,
    cell_params_json: &str,
    h: i32,
    k: i32,
    l: i32,
    wavelength: f64,
) -> Result<String, JsValue> {
    let atoms: Vec<AtomInput> = serde_json::from_str(atoms_json)
        .map_err(|e| JsValue::from_str(&format!("Parse atoms error: {}", e)))?;
    let cell: CellParams = serde_json::from_str(cell_params_json)
        .map_err(|e| JsValue::from_str(&format!("Parse cell error: {}", e)))?;

    let d = compute_d_spacing(&cell, h, k, l);
    let sin_theta = wavelength / (2.0 * d);
    let s = sin_theta / wavelength;
    let two_theta = 2.0 * sin_theta.asin() * 180.0 / std::f64::consts::PI;

    let mut contributions: Vec<AtomContribution> = Vec::new();
    let mut f_real_total = 0.0;
    let mut f_imag_total = 0.0;

    for atom in &atoms {
        let f_j = compute_f(&atom.element, s);
        let dw = (-atom.biso * s * s).exp();
        let phase = 2.0 * std::f64::consts::PI * (h as f64 * atom.x + k as f64 * atom.y + l as f64 * atom.z);
        let cr = atom.occupancy * f_j * dw * phase.cos();
        let ci = atom.occupancy * f_j * dw * phase.sin();
        f_real_total += cr;
        f_imag_total += ci;
        contributions.push(AtomContribution {
            element: atom.element.clone(),
            x: atom.x,
            y: atom.y,
            z: atom.z,
            f_j: f_j * dw,
            phase,
            contrib_real: cr,
            contrib_imag: ci,
        });
    }

    let mult = compute_multiplicity(h, k, l, &cell);
    let f_sq = f_real_total * f_real_total + f_imag_total * f_imag_total;
    let two_theta_rad = deg2rad(two_theta);
    let lp = lorentz_polarization(two_theta_rad);
    let intensity = f_sq * (mult as f64) * lp;

    let detail = SFDetail {
        h, k, l,
        d_spacing: d,
        two_theta,
        multiplicity: mult,
        f_real: f_real_total,
        f_imag: f_imag_total,
        intensity_percent: intensity,
        atom_contributions: contributions,
    };

    serde_json::to_string(&detail)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

pub fn compute_reciprocal_cell(
    a: f64, b: f64, c: f64,
    alpha: f64, beta: f64, gamma: f64,
) -> Result<String, JsValue> {
    let al = deg2rad(alpha);
    let be = deg2rad(beta);
    let ga = deg2rad(gamma);

    let cos_al = al.cos();
    let cos_be = be.cos();
    let cos_ga = ga.cos();
    let sin_al = al.sin();
    let sin_be = be.sin();
    let sin_ga = ga.sin();

    let vol = a * b * c * (1.0 - cos_al * cos_al - cos_be * cos_be - cos_ga * cos_ga
        + 2.0 * cos_al * cos_be * cos_ga).sqrt();

    let a_star = b * c * sin_al / vol;
    let b_star = a * c * sin_be / vol;
    let c_star = a * b * sin_ga / vol;

    let cos_al_star = (cos_be * cos_ga - cos_al) / (sin_be * sin_ga);
    let cos_be_star = (cos_al * cos_ga - cos_be) / (sin_al * sin_ga);
    let cos_ga_star = (cos_al * cos_be - cos_ga) / (sin_al * sin_be);

    let alpha_star = cos_al_star.acos() * 180.0 / std::f64::consts::PI;
    let beta_star = cos_be_star.acos() * 180.0 / std::f64::consts::PI;
    let gamma_star = cos_ga_star.acos() * 180.0 / std::f64::consts::PI;

    let rc = ReciprocalCell {
        a_star, b_star, c_star,
        alpha_star, beta_star, gamma_star,
    };

    serde_json::to_string(&rc)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}
