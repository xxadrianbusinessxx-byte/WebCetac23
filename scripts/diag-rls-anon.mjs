// diag-rls-anon.mjs — DIAGNÓSTICO (SOLO LECTURA) — pendiente rls-tablas-publicas.
//
// ¿Qué ve la clave anon/publicable y qué ve el servidor (service_role)?
//   - por tabla con contraseñas o datos personales: filas visibles con cada
//     clave (HEAD + count=exact: no se descarga ninguna fila).
// Se corre antes y después de supabase/crear-rls-cerrar-anon.sql. Esperado
// después: anon ve 0 en todas; service_role, lo mismo que antes. Imprime
// CONTEOS y nombres de tabla: ni CURP, ni claves, ni nombres.
// LO QUE NO MIDE: qué RPC puede ejecutar anon. Con la clave publicable Supabase
// ya no sirve el spec OpenAPI (401), y probarlas exigiría ejecutarlas (dos
// cambian el esquema). Eso lo dice la consulta de verificación del .sql
// (`definer_anon`). Tampoco las ~384 tablas físicas de materia, casi todas
// vacías: las cubre el bloque 2 del .sql, que recorre el catálogo entero.
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
const claveAnon = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const claveServicio = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!urlBase || !claveAnon || !claveServicio) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, la clave anon/publicable o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

const TABLAS_SENSIBLES = [
  "PROFESORES", "ALUMNOS", "tutores", "tutor_credenciales_iniciales", "tutor_alumnos",
  "ETIQUETAS PERSONALES", "alumno_etiquetas", "seguimiento_medico_historial",
  "COMENTARIOS", "reportes_alumno", "asistencia_alumnos", "justificaciones_asistencia",
  "mensajes_justificacion", "calificaciones", "inscripciones_alumno", "citas",
  "solicitudes_constancia", "grupos", "periodos", "portada_ajustes", "carreras",
];

const cabeceras = (clave) => ({ apikey: clave, Authorization: `Bearer ${clave}` });

/** Filas que ve esa clave, sin traerlas. «error N» si PostgREST la rechaza. */
async function visibles(tabla, clave) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=*`, {
    method: "HEAD",
    headers: { ...cabeceras(clave), Prefer: "count=exact" },
  });
  if (!r.ok) return `error ${r.status}`;
  return Number((r.headers.get("content-range") ?? "").split("/")[1] ?? NaN);
}

const tablas = TABLAS_SENSIBLES;

console.log("=".repeat(72));
console.log("RLS · qué ve anon frente al servidor (filas visibles; HEAD, sin datos)");
console.log("=".repeat(72));
console.log(`${"tabla".padEnd(36)} ${"anon".padStart(10)} ${"service_role".padStart(13)}`);
let abiertas = 0;
for (const t of tablas) {
  const [a, s] = await Promise.all([visibles(t, claveAnon), visibles(t, claveServicio)]);
  if (typeof a === "number" && a > 0) abiertas++;
  console.log(`${t.padEnd(36)} ${String(a).padStart(10)} ${String(s).padStart(13)}`);
}
console.log(`\nTablas de la lista con filas visibles para anon: ${abiertas} de ${tablas.length}`);

