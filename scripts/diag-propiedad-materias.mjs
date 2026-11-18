// diag-propiedad-materias.mjs — DIAGNÓSTICO (SOLO LECTURA). 2026-11-17.
//
// ¿Quién es dueño de cada materia, y está la base lista para que capturar
// asistencia NO cambie ese dueño?
//
// Desde 2026-11-17 la propiedad de una materia vive SOLO en
// `asignaciones_profesor` (la asigna el técnico) y subir asistencia es CAPTURAR:
// la fila guarda quién la capturó y se escribe contra la clave NATURAL
// (alumno + materia + día), sin `profesor_id`. Este script mide:
//   1. asignaciones activas, y materias con MÁS DE UN dueño activo (debe ser 0);
//   2. recuerda cómo comprobar las dos claves naturales de la subida: son índices
//      UNIQUE y PostgREST no los expone (ver el punto 2 del código).
// La unicidad «un dueño activo por materia» también es un índice; su efecto se
// mide en el punto 1.
//
// No escribe nada. Uso: node scripts/diag-propiedad-materias.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
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
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!urlBase || !key) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const H = { apikey: key, Authorization: `Bearer ${key}` };

// 1) Dueños activos.
const res = await fetch(
  `${urlBase}/rest/v1/asignaciones_profesor?select=grupo_materia_id,profesor_id&activo=eq.true`,
  { headers: H },
);
const activas = await res.json();
if (!Array.isArray(activas)) {
  console.log("ERROR lectura asignaciones:", JSON.stringify(activas).slice(0, 200));
} else {
  const porMateria = new Map();
  for (const a of activas) {
    porMateria.set(a.grupo_materia_id, (porMateria.get(a.grupo_materia_id) ?? 0) + 1);
  }
  const conVarios = [...porMateria.values()].filter((n) => n > 1).length;
  console.log(`asignaciones activas: ${activas.length} · materias con dueño: ${porMateria.size}`);
  console.log(`materias con MÁS DE UN dueño activo: ${conVarios}${conVarios ? "  ← debe ser 0" : ""}`);
}

// 2) Las dos claves naturales de la subida —`clases_impartidas (grupo_materia_id,
//    fecha)` y `asistencia_alumnos (curp, grupo_materia_id, fecha)`— son índices
//    UNIQUE, y PostgREST no expone pg_indexes. Un script de diagnóstico no puede
//    sondearlas con un UPSERT (C6: diag- nunca escribe, ni con cuerpo vacío), así
//    que se comprueban con SQL de solo lectura en el SQL Editor:
console.log("");
console.log("Unicidad de la subida (comprobar en el SQL Editor, solo lectura):");
console.log(
  "  select indexname from pg_indexes where schemaname = 'public' and indexname in " +
    "('clases_impartidas_gm_fecha_uidx', 'asistencia_alumnos_curp_gm_fecha_uidx');",
);
console.log("  → deben salir las DOS. Sin la de clases, cada subida de asistencia responde 42P10.");
