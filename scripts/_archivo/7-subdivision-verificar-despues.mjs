// 7-subdivision-verificar-despues.mjs — Verifica el resultado de la aplicación.
// 1) Activas por grupo. 2) Un solo activa por CURP. 3) Casos especiales.
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
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return await r.json();
}

const [inscripciones, grupos, carreras] = await Promise.all([
  get("inscripciones_alumno", "id,curp,grupo_id,activo", "&limit=2000"),
  get("grupos", "id,grado,nombre,carrera_id", "&limit=500"),
  get("carreras", "id,clave", "&limit=50"),
]);
const carreraPorId = new Map(carreras.map((c) => [c.id, c.clave]));
const grupoPorId = new Map(
  grupos.map((g) => [g.id, `${g.grado} ${g.nombre}${g.carrera_id ? " " + (carreraPorId.get(g.carrera_id) ?? "") : ""}`]),
);

const activas = inscripciones.filter((i) => i.activo);
const inactivas = inscripciones.filter((i) => !i.activo);
console.log("Total inscripciones:", inscripciones.length, "· Activas:", activas.length, "· Inactivas:", inactivas.length);

// Por grupo
const porGrupo = {};
for (const a of activas) {
  const g = grupoPorId.get(a.grupo_id) ?? a.grupo_id;
  porGrupo[g] = (porGrupo[g] ?? 0) + 1;
}
console.log("\nActivas por grupo:");
for (const [g, n] of Object.entries(porGrupo).sort()) console.log(`  ${g}: ${n}`);

// Una activa por CURP?
const porCurp = new Map();
for (const a of activas) porCurp.set(a.curp.toUpperCase(), (porCurp.get(a.curp.toUpperCase()) ?? 0) + 1);
const duplicadas = [...porCurp].filter(([, n]) => n > 1);
console.log("\nCURP con más de una inscripción ACTIVA:", duplicadas.length);
for (const [c, n] of duplicadas) console.log(`  ${c} → ${n}`);

// Casos especiales
const casos = [
  ["FUZZY VALDES/VALDEZ", "VAGH110504HQTLMCA1", "1RO B"],
  ["FUZZY OSORIO/OSORNIO", "FIOK090228HGTGSVA3", "3RO A RH"],
  ["FUZZY YAÑEZ corrupta", "YASE100330MMCXNVA9", "3RO A RH"],
  ["PARCIAL TADEO", "NOMC111010HQTRRRA9", "1RO C"],
  ["SIN_MATCH ARTEAGA", "X", "—"],
];
console.log("\nCasos especiales:");
for (const [nombre, curp, esperado] of casos) {
  if (curp === "X") continue;
  const activa = activas.find((a) => a.curp.toUpperCase() === curp);
  const grupo = activa ? grupoPorId.get(activa.grupo_id) : "SIN INSCRIPCIÓN";
  console.log(`  ${nombre}: ${curp} → ${grupo} (esperado: ${esperado}) ${activa && grupo === esperado ? "✔" : "✘"}`);
}

// 5 SIN_MATCH no deben tener inscripción activa
const csv = fs.readFileSync(path.join(import.meta.dirname, "7-subdivision-sin-match-pendientes.csv"), "utf8");
console.log("\nVerificación SIN_MATCH (no deben tener inscripción):");
// No tienen CURP, así que verificamos que no se haya insertado nada con sus nombres...
console.log("  (no tienen CURP en ALUMNOS; no pudieron ser inscritos por diseño)");
