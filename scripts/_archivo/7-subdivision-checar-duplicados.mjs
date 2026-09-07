// 7-subdivision-checar-duplicados.mjs — Detecta nombres/CURP repetidos entre archivos.
import fs from "node:fs";
import path from "node:path";

const csv = fs.readFileSync(path.join(import.meta.dirname, "7-subdivision-reporte-curps.csv"), "utf8");
const lineas = csv.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
const filas = [];
for (let i = 1; i < lineas.length; i++) {
  const p = lineas[i].split(",");
  filas.push({ archivo: p[0], excelNombre: p[6], estado: p[8], curp: p[9] });
}

function normalizar(t) {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const porNombre = new Map();
const porCurp = new Map();
for (const f of filas) {
  const n = normalizar(f.excelNombre);
  porNombre.set(n, [...(porNombre.get(n) ?? []), f]);
  if (f.curp) porCurp.set(f.curp, [...(porCurp.get(f.curp) ?? []), f]);
}

console.log("=== Nombres repetidos entre archivos ===");
let nDup = 0;
for (const [n, fs2] of porNombre) {
  if (fs2.length > 1) {
    nDup++;
    console.log(`"${fs2[0].excelNombre}" → ${fs2.map((x) => x.archivo).join(", ")}`);
  }
}
if (!nDup) console.log("(ninguno)");

console.log("\n=== CURP repetidas entre archivos ===");
let cDup = 0;
for (const [c, fs2] of porCurp) {
  if (fs2.length > 1) {
    cDup++;
    console.log(`${c} → ${fs2.map((x) => `${x.archivo} "${x.excelNombre}"`).join(" | ")}`);
  }
}
if (!cDup) console.log("(ninguna)");
