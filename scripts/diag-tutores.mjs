// diag-tutores.mjs — DIAGNÓSTICO (SOLO LECTURA) — 2026-10-25.
//
// Mide el estado del roster de TUTORES, que es lo que verifican los pendientes
// `tutores-sin-contacto` y `probar-roster-tutores-con-sesion`:
//   - cuántas cuentas hay y cuántas están activas;
//   - de las activas, cuántas no tienen nombre, teléfono, correo ni CURP
//     (las que creó «Generar automáticos» no traen ninguno de los cuatro);
//   - vínculos tutor↔alumno activos y cuántos alumnos distintos cubren;
//   - cuentas activas sin ningún alumno (huérfanas) y alumnos sin tutor.
//
// Solo GET por REST. Imprime CONTEOS: ni CURP, ni claves, ni nombres.
// Lee .env.local igual que scripts/diag-alta-manual-alumno.mjs.
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
  return Number((r.headers.get("content-range") ?? "").split("/")[1] ?? NaN);
}

async function get(tabla, select, extra = "") {
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const fila = (etiqueta, valor) => console.log(`  ${String(etiqueta).padEnd(44)} ${String(valor).padStart(6)}`);

console.log("========================================================================");
console.log("TUTORES · estado del roster (solo lectura, solo conteos)");
console.log("========================================================================");

const tutoresTotal = await contar("tutores");
const tutoresActivos = await contar("tutores", "&activo=eq.true");
fila("cuentas de tutor", tutoresTotal);
fila("· activas", tutoresActivos);
fila("· desactivadas", tutoresTotal - tutoresActivos);

console.log("\nDe las ACTIVAS, cuántas no tienen cada dato de contacto:");
for (const campo of ["nombre", "apellidos", "curp", "telefono", "correo"]) {
  fila(`· sin ${campo}`, await contar("tutores", `&activo=eq.true&or=(${campo}.is.null,${campo}.eq.)`));
}

const relaciones = await contar("tutor_alumnos", "&activo=eq.true");
const filasRel = await get("tutor_alumnos", "curp_alumno,tutor_id", "&activo=eq.true");
const alumnosConTutor = new Set(filasRel.map((r) => String(r.curp_alumno ?? "").toUpperCase())).size;
const tutoresConAlumno = new Set(filasRel.map((r) => r.tutor_id)).size;

console.log("\nVínculos tutor↔alumno:");
fila("vínculos activos", relaciones);
fila("· alumnos distintos cubiertos", alumnosConTutor);
fila("· cuentas con al menos un alumno", tutoresConAlumno);
fila("cuentas activas SIN ningún alumno (huérfanas)", tutoresActivos - tutoresConAlumno);

const alumnos = await contar("ALUMNOS");
fila("alumnos en ALUMNOS", alumnos);
fila("· sin tutor activo", alumnos - alumnosConTutor);

console.log("\nLectura: una cuenta activa sin ningún dato de contacto es de las que");
console.log("creó «Generar automáticos». Corregirlas: Personas › Tutores › Editar.");
console.log("Solo lectura: este script no escribe nada.");
