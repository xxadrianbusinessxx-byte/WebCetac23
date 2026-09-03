// 7-subdivision-corregir-6to-a-5to.mjs — Corrección: TODOS los alumnos de
// 6TOMCA.xlsx (inscritos en 6TO A MECATRONICA) van a 5TO A MECATRONICA.
// Misma semántica que inscribirAlumno({ unaActiva: true }).
//
// DRY-RUN por defecto. Aplicar: node scripts/7-subdivision-corregir-6to-a-5to.mjs --apply
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const root = path.join(import.meta.dirname, "..");

const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function request(method, pathApi, body) {
  const r = await fetch(`${urlBase}/rest/v1/${pathApi}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const texto = await r.text();
    throw new Error(`${method} ${pathApi} → ${r.status} ${texto}`);
  }
  return r;
}

// --- Grupo destino: 5TO A MECATRONICA (verificado contra el catálogo) ---
const GRUPO_5TO_MECATRONICA = "d2ad83a3-0db2-499b-b493-774c58e07b42";
const GRUPO_6TO_MECATRONICA = "5f95c525-83d6-48d5-8af0-835b6ddfcce1";

// 1) CURPs de 6TOMCA.xlsx desde el reporte
const csv = fs.readFileSync(path.join(import.meta.dirname, "7-subdivision-reporte-curps.csv"), "utf8");
const lineas = csv.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
const alumnos6to = [];
for (let i = 1; i < lineas.length; i++) {
  const p = lineas[i].split(",");
  if (p[0] === "6TOMCA.xlsx" && p[8] !== "SIN_MATCH" && p[9]) {
    alumnos6to.push({ curp: p[9], excelNombre: p[6], grupoActualId: p[4] });
  }
}
console.log(`Modo: ${APPLY ? "APLICAR" : "DRY-RUN (sin cambios)"}`);
console.log(`Alumnos de 6TOMCA.xlsx con CURP: ${alumnos6to.length}`);

// 2) Inscripciones activas actuales
const curpsActivas = new Map();
{
  let desde = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await fetch(
      `${urlBase}/rest/v1/inscripciones_alumno?select=curp,grupo_id,activo&order=curp&offset=${desde}&limit=${PAGE}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const ins of data) if (ins.activo) curpsActivas.set(ins.curp.toUpperCase(), ins.grupo_id);
    if (data.length < PAGE) break;
    desde += PAGE;
  }
}

// 3) Plan
const plan = [];
for (const a of alumnos6to) {
  const actual = curpsActivas.get(a.curp.toUpperCase());
  const accion =
    actual === GRUPO_5TO_MECATRONICA
      ? "SIN_CAMBIO"
      : actual === GRUPO_6TO_MECATRONICA || actual
        ? "CAMBIO_5TO"
        : "NUEVA_INSCRIPCION_5TO";
  plan.push({ ...a, actual, accion });
}
const resumen = {};
for (const p of plan) resumen[p.accion] = (resumen[p.accion] ?? 0) + 1;
console.log("Plan:", JSON.stringify(resumen));

let en6to = 0;
let ya5to = 0;
for (const p of plan) {
  if (p.actual === GRUPO_6TO_MECATRONICA) en6to++;
  if (p.actual === GRUPO_5TO_MECATRONICA) ya5to++;
  const marca = p.accion === "SIN_CAMBIO" ? "=" : p.accion === "CAMBIO_5TO" ? "→" : "+";
  console.log(`  ${marca} ${p.curp}  actual=${p.actual === GRUPO_6TO_MECATRONICA ? "6TO A MEC" : p.actual === GRUPO_5TO_MECATRONICA ? "5TO A MEC" : p.actual ? "OTRO" : "ninguna"}  ${p.excelNombre}`);
}
console.log(`\nActivos en 6TO A MEC: ${en6to} · ya en 5TO A MEC: ${ya5to}`);

// 4) Aplicar
if (APPLY) {
  let ok = 0;
  let err = 0;
  for (const p of plan) {
    if (p.accion === "SIN_CAMBIO") continue;
    try {
      // Desactivar cualquier inscripción ACTIVA que no sea el grupo 5TO.
      const q = `inscripciones_alumno?curp=eq.${encodeURIComponent(p.curp)}&activo=eq.true&grupo_id=neq.${encodeURIComponent(GRUPO_5TO_MECATRONICA)}`;
      await request("PATCH", q, { activo: false });
      // UPSERT (curp, 5TO A MECATRONICA) activo=true.
      await request("POST", "inscripciones_alumno?on_conflict=curp,grupo_id", {
        curp: p.curp,
        grupo_id: GRUPO_5TO_MECATRONICA,
        activo: true,
      });
      ok++;
    } catch (e) {
      err++;
      console.error("  ✘ ERROR:", p.curp, e.message);
    }
  }
  console.log(`\nAplicado: OK=${ok} · ERROR=${err}`);
} else {
  console.log("\n(No se modificó nada. Usa --apply para aplicar.)");
}
