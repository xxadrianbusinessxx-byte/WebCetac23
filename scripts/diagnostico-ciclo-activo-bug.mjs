// diagnostico-ciclo-activo-bug.mjs — SOLO LECTURA.
// Diagnóstico: estado de periodos vs inscripciones activas de alumnos.
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

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  // 1) Periodos completos.
  const periodos = await get("periodos", "id,nombre,activo,created_at,updated_at", "&limit=50&order=created_at.asc");
  console.log("=== 1) PERIODOS (orden created_at) ===");
  for (const p of periodos) {
    console.log(`[${p.id}] "${p.nombre}"  activo=${p.activo}  creado=${String(p.created_at).slice(0, 19)}`);
  }
  const activos = periodos.filter((p) => p.activo);
  console.log(`\nPeriodos con activo=true: ${activos.length} -> ${activos.map((a) => `"${a.nombre}"`).join(", ") || "(ninguno)"}`);

  // Cargar grupos e inscripciones.
  const grupos = await get("grupos", "id,periodo_id,grado,nombre", "&limit=5000");
  const ins = await get("inscripciones_alumno", "id,curp,grupo_id,activo,created_at", "&activo=eq.true&limit=30000");
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const periodoPorId = new Map(periodos.map((p) => [p.id, p]));

  // 2) Muestra de 5 CURP reales.
  console.log("\n=== 2) MUESTRA 5 ALUMNOS (credencial real en ALUMNOS) ===");
  const alumnos = await get("ALUMNOS", "*", "&limit=2000");
  const muestra = alumnos.slice(0, 5);
  for (const a of muestra) {
    const curp = String(a.CURP ?? "").toUpperCase();
    const filas = ins.filter((i) => i.curp.toUpperCase() === curp);
    if (filas.length === 0) {
      console.log(`${curp} | (sin inscripción activa) | — | — | —`);
      continue;
    }
    for (const i of filas) {
      const g = grupoPorId.get(i.grupo_id);
      const p = g ? periodoPorId.get(g.periodo_id) : null;
      console.log(`${curp} | ${i.grupo_id} | ${g?.periodo_id ?? "?"} | ${p?.nombre ?? "?"} | ${p?.activo ?? "?"}`);
    }
  }

  // 3) Alcance total: inscripciones activas cuyo periodo NO está activo.
  let ok = 0;
  let roto = 0;
  const rotoPorPeriodo = new Map();
  for (const i of ins) {
    const g = grupoPorId.get(i.grupo_id);
    const p = g ? periodoPorId.get(g.periodo_id) : null;
    if (p?.activo) ok++;
    else { roto++; rotoPorPeriodo.set(p?.nombre ?? "(sin periodo)", (rotoPorPeriodo.get(p?.nombre ?? "(sin periodo)") ?? 0) + 1); }
  }
  console.log("\n=== 3) ALCANCE DEL BUG ===");
  console.log(`Inscripciones ACTIVAS totales: ${ins.length}`);
  console.log(`Con periodo activo=true  : ${ok}`);
  console.log(`Con periodo activo=false : ${roto}`);
  for (const [k, v] of rotoPorPeriodo) console.log(`   ${k}: ${v}`);

  // 4) ¿Más de un periodo activo simultáneo?
  console.log("\n=== 4) PERIODOS ACTIVOS SIMULTÁNEOS ===");
  console.log(`Cantidad con activo=true ahora: ${activos.length}`);
  console.log(activos.length > 1 ? "⚠ HIPÓTESIS: hay más de un periodo activo." : activos.length === 0 ? "⚠ HIPÓTESIS: no hay ningún periodo activo." : "OK: exactamente un periodo activo.");
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
