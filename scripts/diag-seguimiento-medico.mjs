// diag-seguimiento-medico.mjs — DIAGNÓSTICO (SOLO LECTURA). 2026-10-01.
//
// QUÉ MIDE: el estado del seguimiento médico del alumno contra Supabase real.
//   1. Alumnos SIN fila en ETIQUETAS PERSONALES: antes del historial, guardar sus
//      datos hacía un UPDATE que no tocaba nada y respondía «Datos guardados».
//      La función `guardar_campos_personales_alumno` crea esa fila al guardar,
//      así que esta cifra solo puede bajar.
//   2. Cuántas fichas tienen algún dato médico, y cuántos valores por campo.
//   3. ¿Se ejecutó supabase/crear-historial-seguimiento-medico.sql? (la tabla
//      `seguimiento_medico_historial` y la función, vistas por PostgREST).
//   4. El historial: ediciones por rol, y las que rompen el contrato de
//      identidad (deberían ser 0: el CHECK de la tabla lo impide).
// QUÉ ESCRIBE: nada. Solo GET por PostgREST (incluida la especificación OpenAPI).
// CÓMO SE EJECUTA: node scripts/diag-seguimiento-medico.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const H = { apikey: key, Authorization: `Bearer ${key}` };

/** Todas las filas, paginando de 1 000 en 1 000. */
async function todas(tabla, select) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(
      `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}`,
      { headers: { ...H, Range: `${desde}-${desde + 999}` } },
    );
    if (!r.ok) {
      const c = await r.json().catch(() => ({}));
      return { existe: c.code !== "PGRST205", error: c.message ?? `HTTP ${r.status}`, filas };
    }
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) break;
  }
  return { existe: true, error: null, filas };
}

const MEDICOS = [
  "TIPO DE SANGRE", "ALERGIAS", "LENTES", "ENFERMEDAD CRONICA", "SALUD MENTAL",
  "NECESIDAD PSICOLOGICA", "PESO", "TALLA", "ESTATURA", "VACUNACION",
];
const norm = (s) => String(s ?? "").trim().toUpperCase();

// ── 1 y 2. Fichas de datos personales ──────────────────────────────────────
const alumnos = await todas("ALUMNOS", "CURP");
const fichas = await todas("ETIQUETAS PERSONALES", `CURP,${MEDICOS.map((c) => `"${c}"`).join(",")}`);
if (alumnos.error || fichas.error) {
  console.error("No se pudo leer:", alumnos.error ?? fichas.error);
  process.exit(1);
}
const conFicha = new Set(fichas.filas.map((f) => norm(f.CURP)));
const curpsAlumnos = new Set(alumnos.filas.map((a) => norm(a.CURP)).filter(Boolean));
const sinFicha = [...curpsAlumnos].filter((c) => !conFicha.has(c));
const noNormalizadas = alumnos.filas.filter((a) => a.CURP != null && String(a.CURP) !== norm(a.CURP)).length;

console.log("── Fichas de datos personales ──");
console.log(`  alumnos                          : ${curpsAlumnos.size}`);
console.log(`  fichas en ETIQUETAS PERSONALES   : ${fichas.filas.length}`);
console.log(`  alumnos SIN ficha                : ${sinFicha.length}`);
console.log(`  CURPs de ALUMNOS sin normalizar  : ${noNormalizadas}`);

const lleno = (v) => v != null && String(v).trim() !== "";
const porCampo = Object.fromEntries(MEDICOS.map((c) => [c, fichas.filas.filter((f) => lleno(f[c])).length]));
const conDatoMedico = fichas.filas.filter((f) => MEDICOS.some((c) => lleno(f[c]))).length;
console.log(`  fichas con algún dato médico     : ${conDatoMedico}`);
console.log("  valores por campo                :", porCampo);

// ── 3. ¿Se aplicó el SQL? ──────────────────────────────────────────────────
const spec = await fetch(`${urlBase}/rest/v1/`, { headers: H }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const hayFuncion = Boolean(spec?.paths?.["/rpc/guardar_campos_personales_alumno"]);
const historial = await todas(
  "seguimiento_medico_historial",
  "id,curp,editor_rol,editor_profesor_id,editor_tutor_id,campos,editado_at",
);
console.log("\n── crear-historial-seguimiento-medico.sql ──");
console.log(`  función guardar_campos_personales_alumno : ${hayFuncion ? "SÍ" : "NO"}`);
console.log(`  tabla seguimiento_medico_historial       : ${historial.existe && !historial.error ? "SÍ" : "NO"}`);

// ── 4. El historial ────────────────────────────────────────────────────────
if (historial.existe && !historial.error) {
  const porRol = {};
  for (const h of historial.filas) porRol[h.editor_rol] = (porRol[h.editor_rol] ?? 0) + 1;
  const sinIdentidad = historial.filas.filter((h) =>
    h.editor_rol === "tutor"
      ? !h.editor_tutor_id || h.editor_profesor_id != null
      : !h.editor_profesor_id || h.editor_tutor_id != null,
  ).length;
  const sinCampos = historial.filas.filter((h) => !Array.isArray(h.campos) || h.campos.length === 0).length;
  const alumnosConHistorial = new Set(historial.filas.map((h) => h.curp)).size;
  console.log("\n── Historial ──");
  console.log(`  ediciones registradas            : ${historial.filas.length}`);
  console.log(`  alumnos con historial            : ${alumnosConHistorial}`);
  console.log("  ediciones por rol                :", porRol);
  console.log(`  sin identidad válida (debe ser 0): ${sinIdentidad}`);
  console.log(`  sin campos (debe ser 0)          : ${sinCampos}`);
  const ultima = [...historial.filas].sort((a, b) => b.id - a.id)[0];
  if (ultima) console.log(`  última edición                   : ${ultima.editado_at} (${ultima.editor_rol})`);
} else if (!hayFuncion) {
  console.log("\n  Falta ejecutar supabase/crear-historial-seguimiento-medico.sql en el SQL Editor.");
  console.log("  Hasta entonces, guardar datos personales devuelve un error explícito y no escribe nada.");
}
