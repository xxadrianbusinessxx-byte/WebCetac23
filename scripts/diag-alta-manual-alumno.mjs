// diag-alta-manual-alumno.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT W.
//
// Mide lo que el alta manual de alumno toca, antes y después del cambio:
//   - filas de ALUMNOS y cuántas tienen numero_control;
//   - inscripciones ACTIVAS (inscripciones_alumno);
//   - relaciones tutor↔alumno ACTIVAS (tutor_alumnos);
//   - el periodo OPERATIVO y sus grupos activos.
// Solo GET por REST. Imprime CONTEOS: ni CURP, ni claves, ni nombres.
// Lee .env.local igual que scripts/diag-calendario-periodo.mjs.
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

/** Total de filas que cumplen el filtro, sin traerlas (Content-Range). */
async function contar(tabla, filtro = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=*${filtro}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  const rango = r.headers.get("content-range") ?? "";
  return Number(rango.split("/")[1] ?? NaN);
}

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  const alumnos = await contar("ALUMNOS");
  const conNumero = await contar("ALUMNOS", "&numero_control=not.is.null");
  const inscripciones = await contar("inscripciones_alumno", "&activo=eq.true");
  const relaciones = await contar("tutor_alumnos", "&activo=eq.true");

  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const operativos = periodos.filter((p) => String(p.estado ?? "").toLowerCase() === "operativo");
  const operativo = operativos.length === 1 ? operativos[0] : periodos.filter((p) => p.activo).length === 1 ? periodos.find((p) => p.activo) : null;
  const grupos = operativo ? await get("grupos", "id", `&periodo_id=eq.${operativo.id}&activo=eq.true`) : [];

  console.log("=== ALTA MANUAL DE ALUMNO — MEDICIÓN ===");
  console.log(`ALUMNOS                         ${alumnos}`);
  console.log(`ALUMNOS con numero_control      ${conNumero}`);
  console.log(`inscripciones_alumno activas    ${inscripciones}`);
  console.log(`tutor_alumnos activas           ${relaciones}`);
  console.log(`periodo operativo               ${operativo ? operativo.nombre : "(ninguno único)"}`);
  console.log(`grupos activos del operativo    ${grupos.length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
