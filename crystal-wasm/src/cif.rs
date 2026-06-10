use serde::Serialize;
use wasm_bindgen::JsValue;

#[derive(Serialize)]
struct CIFData {
    a: f64,
    b: f64,
    c: f64,
    alpha: f64,
    beta: f64,
    gamma: f64,
    space_group: String,
    atoms: Vec<CIFAtom>,
}

#[derive(Serialize)]
struct CIFAtom {
    element: String,
    x: f64,
    y: f64,
    z: f64,
    occupancy: f64,
    biso: f64,
}

pub fn parse_cif(cif_text: &str) -> Result<String, JsValue> {
    let lines: Vec<&str> = cif_text.lines().collect();
    let mut data = CIFData {
        a: 0.0, b: 0.0, c: 0.0,
        alpha: 90.0, beta: 90.0, gamma: 90.0,
        space_group: "P1".to_string(),
        atoms: Vec::new(),
    };

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();

        if line.starts_with("_cell_length_a") {
            data.a = parse_cif_value(line);
        } else if line.starts_with("_cell_length_b") {
            data.b = parse_cif_value(line);
        } else if line.starts_with("_cell_length_c") {
            data.c = parse_cif_value(line);
        } else if line.starts_with("_cell_angle_alpha") {
            data.alpha = parse_cif_value(line);
        } else if line.starts_with("_cell_angle_beta") {
            data.beta = parse_cif_value(line);
        } else if line.starts_with("_cell_angle_gamma") {
            data.gamma = parse_cif_value(line);
        } else if line.starts_with("_space_group_name_H-M") || line.starts_with("_symmetry_space_group_name_H-M") {
            data.space_group = parse_cif_string_value(line);
        }

        if line == "loop_" {
            parse_loop(&lines, &mut i, &mut data);
            continue;
        }

        i += 1;
    }

    serde_json::to_string(&data)
        .map_err(|e| JsValue::from_str(&format!("Serialize error: {}", e)))
}

fn parse_cif_value(line: &str) -> f64 {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 2 {
        let val_str = parts[1].trim_matches(|c: char| !c.is_numeric() && c != '.' && c != '-' && c != 'e' && c != 'E' && c != '+');
        val_str.parse().unwrap_or(0.0)
    } else {
        0.0
    }
}

fn parse_cif_string_value(line: &str) -> String {
    let idx = line.find(char::is_whitespace).unwrap_or(line.len());
    let val = line[idx..].trim();
    val.trim_matches('\'').trim_matches('"').to_string()
}

fn parse_loop(lines: &[&str], i: &mut usize, data: &mut CIFData) {
    let start = *i;
    let mut tags: Vec<String> = Vec::new();
    let mut j = start + 1;

    while j < lines.len() {
        let line = lines[j].trim();
        if line.is_empty() {
            j += 1;
            continue;
        }
        if line.starts_with('_') {
            tags.push(line.split_whitespace().next().unwrap_or("").to_string());
            j += 1;
        } else {
            break;
        }
    }

    let type_label_idx = tags.iter().position(|t| t == "_atom_site_type_symbol" || t == "_atom_site_label");
    let x_idx = tags.iter().position(|t| t == "_atom_site_fract_x");
    let y_idx = tags.iter().position(|t| t == "_atom_site_fract_y");
    let z_idx = tags.iter().position(|t| t == "_atom_site_fract_z");
    let occ_idx = tags.iter().position(|t| t == "_atom_site_occupancy");
    let biso_idx = tags.iter().position(|t| t == "_atom_site_B_iso_or_equiv" || t == "_atom_site_U_iso_or_equiv");

    if type_label_idx.is_none() || x_idx.is_none() || y_idx.is_none() || z_idx.is_none() {
        *i = j;
        return;
    }

    while j < lines.len() {
        let line = lines[j].trim();
        if line.is_empty() || line.starts_with('_') || line.starts_with("loop_") || line.starts_with("data_") {
            break;
        }
        let vals: Vec<&str> = line.split_whitespace().collect();
        if vals.len() < tags.len() {
            j += 1;
            continue;
        }

        let element_raw = vals[type_label_idx.unwrap()].to_string();
        let element = element_raw.chars().take_while(|c| c.is_alphabetic()).collect::<String>();

        let x = parse_val_with_unc(vals[x_idx.unwrap()]);
        let y = parse_val_with_unc(vals[y_idx.unwrap()]);
        let z = parse_val_with_unc(vals[z_idx.unwrap()]);
        let occ = occ_idx.map_or(1.0, |idx| parse_val_with_unc(vals[idx]));
        let biso = biso_idx.map_or(1.0, |idx| parse_val_with_unc(vals[idx]));

        data.atoms.push(CIFAtom {
            element,
            x, y, z,
            occupancy: if occ == 0.0 { 1.0 } else { occ },
            biso: if biso == 0.0 { 1.0 } else { biso },
        });

        j += 1;
    }

    *i = j;
}

fn parse_val_with_unc(val: &str) -> f64 {
    let clean = if val.contains('(') {
        &val[..val.find('(').unwrap_or(val.len())]
    } else {
        val
    };
    clean.parse().unwrap_or(0.0)
}
