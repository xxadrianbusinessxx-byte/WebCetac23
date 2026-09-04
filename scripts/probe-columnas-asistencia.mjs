// probe-columnas-asistencia.mjs — DIAGNÓSTICO (SOLO LECTURA)
// Lista las columnas reales de clases_impartidas y asistencia_alumnos (spec
// OpenAPI de PostgREST) y, para cada FK que el Prompt C (R-1) planea crear,
// cuenta las filas huérfanas actuales. NO modifica nada.
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

const TABLAS = ["clases_impartidas", "asistencia_alumnos"];

// (tabla, columna, tabla_ref, columna_ref)
const FKS_PLANEADAS = [
  ["clases_impartidas", "profesor_id", "PROFESORES", "ID"],
  ["clases_impartidas", "grupo_materia_id", "grupo_materias", "id"],
  ["clases_impartidas", "periodo_id", "periodos", "id"],
  ["clases_impartidas", "periodo_evaluacion_id", "periodos_evaluacion", "id"],
  ["asistencia_alumnos", "profesor_id", "PROFESORES", "ID"],
  ["asistencia_alumnos", "grupo_materia_id", "grupo_materias", "id"],
  ["asistencia_alumnos", "curp", "ALUMNOS", "CURP"],
  ["asistencia_alumnos", "periodo_id", "periodos", "id"],
  ["asistencia_alumnos", "periodo_evaluacion_id", "periodos_evaluacion", "id"],
];

async function get(tabla, select, extra = "") {
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const data = await r.json();
  if (!r.ok) return { __error: `${r.status} ${JSON.stringify(data).slice(0, 200)}` };
  return data;
}

async function contarHuerfanos(tabla, col, tablaRef, colRef) {
  // PostgREST no expone NOT EXISTS de otra tabla; se hace el conteo en el
  // cliente sobre los valores DISTINTOS (volumen esperado: bajo).
  const tablaN = tablaRef.replace(/"/g, "");
  const valores = await get(tabla, col, "&limit=20000");
  if (valores.__error) return `(error lectura: ${valores.__error})`;
  const refs = await get(tablaN, colRef, "&limit=20000");
  if (refs.__error) return `(error lectura ref: ${refs.__error})`;
  const refSet = new Set(refs.map((r) => String(r[colRef] ?? "").trim().toUpperCase()));
  let huerfanos = 0;
  const vistos = new Set();
  for (const f of valores) {
    const v = String(f[col] ?? "");
    if (!v.trim() || vistos.has(v.toUpperCase())) continue;
    vistos.add(v.toUpperCase());
    if (!refSet.has(v.toUpperCase())) huerfanos++;
  }
  return huerfanos;
}

async function main() {
  const r = await fetch(`${urlBase}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await r.json();
  const defs = spec.definitions ?? spec;

  for (const tabla of TABLAS) {
    const def = defs[tabla];
    if (!def) { console.log(`## ${tabla}: (no existe)\n`); continue; }
    const cols = Object.keys(def.properties ?? {});
    console.log(`## ${tabla}`);
    console.log(`   columnas (${cols.length}): ${cols.join(", ")}\n`);
  }

  console.log("=== HUÉRFANOS POR FK PLANEADA (Prompt C R-1) ===");
  for (const [tabla, col, ref, refcol] of FKS_PLANEADAS) {
    const n = await contarHuerfanos(tabla, col, ref, refcol);
    console.log(`  ${tabla}.${col} → ${ref}.${refcol}: ${typeof n === "number" ? `${n} filas huérfanas` : n}`);
  }
  console.log("\nFIN (solo lectura; no se modificó nada)");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
