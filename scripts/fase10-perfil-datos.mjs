#!/usr/bin/env node
/**
 * FASE 10 — PERFILADO REAL DE DATOS (Supabase/PostgREST).
 *
 * Mide la LATENCIA y el PAYLOAD de las consultas críticas que ejecuta la app,
 * replicando EXACTAMENTE los patrones de las funciones de dominio
 * (lib/escolar/*, app/actions/*). La capa medida es la de datos
 * (PostgREST + PostgreSQL), que es donde vive la hipótesis del cuello.
 *
 * Uso:
 *   node scripts/fase10-perfil-datos.mjs [--runs N] [--openapi]
 *
 * Solo LECTURA. No escribe nada. No crea índices. No modifica esquema.
 * No expone secretos (se leen desde .env.local en runtime).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const RUNS = Number(args.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 5);
const MEDIR_OPENAPI = args.includes("--openapi");

function leerEnvLocal() {
  const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = leerEnvLocal();
const urlBase = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!urlBase || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(urlBase, serviceKey);

const TABLA_ALUMNOS = "ALUMNOS";
const TABLA_PROFESORES = "PROFESORES";
const TABLA_ETIQUETAS_STATUS = "ETIQUETAS (STATUS)";

/** Ejecuta una consulta y devuelve { ms, bytes } (JSON del body). */
async function medir(tag, fn) {
  const tiempos = [];
  const tamanos = [];
  let error = null;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    try {
      const r = await fn();
      const t1 = performance.now();
      tiempos.push(t1 - t0);
      const bytes = r ? Buffer.byteLength(JSON.stringify(r), "utf8") : 0;
      tamanos.push(bytes);
    } catch (e) {
      error = e;
      break;
    }
  }
  if (error) {
    console.log(`  ✗ ${tag}: ERROR ${error?.message ?? error}`);
    return { tag, error: error?.message };
  }
  const orden = [...tiempos].sort((a, b) => a - b);
  const p50 = orden[Math.floor(orden.length / 2)];
  const min = orden[0];
  const max = orden[orden.length - 1];
  const payload = tamanos.length ? Math.round(tamanos.reduce((a, b) => a + b, 0) / tamanos.length) : 0;
  console.log(
    `  ${tag}\n    p50=${p50.toFixed(0)}ms  min=${min.toFixed(0)}ms  max=${max.toFixed(0)}ms  (${RUNS} runs)  payload≈${payload.toLocaleString()} B`,
  );
  return { tag, p50, min, max, payload };
}

/** Conteo exacto de una tabla (PostgREST count=exact). */
const COL_COUNT = {
  ALUMNOS: "CURP",
  PROFESORES: "ID",
};
async function contar(tabla) {
  const col = COL_COUNT[tabla] ?? "id";
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(col)}&limit=0`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "count=exact",
        Accept: "application/json",
      },
    },
  );
  const count = r.headers.get("content-range")?.split("/")[1] ?? "?";
  return { tabla, count, status: r.status };
}

console.log("=".repeat(78));
console.log("FASE 10 — PERFILADO REAL DE DATOS");
console.log(`URL: ${urlBase}`);
console.log(`RUNS por consulta: ${RUNS}`);
console.log("=".repeat(78));

// ---------------------------------------------------------------------------
// 1) Conteos reales de tablas críticas
// ---------------------------------------------------------------------------
console.log("\n[1] Conteos reales de tablas críticas");
const conteos = [];
for (const t of [
  TABLA_ALUMNOS,
  TABLA_PROFESORES,
  "tutores",
  "tutor_alumnos",
  "tutor_credenciales_iniciales",
  TABLA_ETIQUETAS_STATUS,
  "inscripciones_alumno",
  "asignaciones_profesor",
  "grupo_materias",
  "grupos",
  "periodos",
  "carreras",
  "materias",
  "asistencia_alumnos",
  "clases_impartidas",
  "calendario_escolar",
  "alumno_etiquetas",
]) {
  const c = await contar(t);
  conteos.push(c);
  console.log(`  ${t}: ${c.count} filas (status ${c.status})`);
}

// ---------------------------------------------------------------------------
// 2) OpenAPI (cold/warm a nivel HTTP)
// ---------------------------------------------------------------------------
if (MEDIR_OPENAPI) {
  console.log("\n[2] OpenAPI spec (costo de descarga real a nivel HTTP)");
  const specUrl = `${urlBase}/rest/v1/`;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const r = await fetch(specUrl, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
    });
    const t1 = performance.now();
    const text = await r.text();
    console.log(
      `  intento ${i + 1}: ${(t1 - t0).toFixed(0)}ms · status ${r.status} · body ${text.length.toLocaleString()} B · cache-control=${r.headers.get("cache-control") ?? "-"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3) Operaciones críticas (patrones reales de la app)
// ---------------------------------------------------------------------------
console.log("\n[3] Operaciones críticas — latencia + payload");

// Login alumno: buscarAlumnoPorNombre → ALUMNOS range(0,4999)
await medir("Login · ALUMNOS range(0,4999) [buscarAlumnoPorNombre]", () =>
  supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .range(0, 4999),
);

// Login profesor: buscarProfesorPorNombre → PROFESORES range(0,4999)
await medir("Login · PROFESORES range(0,4999) [buscarProfesorPorNombre]", () =>
  supabase
    .from(TABLA_PROFESORES)
    .select('ID, "NOMBRE/PROFESOR/DIRECTIVO", CLAVE, Permisos, debe_cambiar_credenciales')
    .range(0, 4999),
);

// Login tutor: buscarTutorPorUsuario
await medir("Login · tutores eq(usuario) [buscarTutorPorUsuario]", () =>
  supabase.from("tutores").select("*").eq("usuario", "zz-inexistente").maybeSingle(),
);

// Etiquetas status por CURP (fallback select *)
await medir("Alumno · ETIQUETAS(STATUS) eq(CURP) maybeSingle [obtenerEtiquetasStatusPorCurp]", () =>
  supabase.from(TABLA_ETIQUETAS_STATUS).select("CURP").eq("CURP", "ZZZZ999999HDFRRN00").maybeSingle(),
);

// Etiquetas status list (limit 5000) — usada en alumnos estrella/estatus
await medir("Alumno/Home · ETIQUETAS(STATUS) limit(5000) [listarEtiquetasStatus]", () =>
  supabase.from(TABLA_ETIQUETAS_STATUS).select("CURP").limit(5000),
);

// Catálogo: inscripciones por CURP
await medir("Alumno · inscripciones_alumno eq(curp, activo) [inscripción alumno]", () =>
  supabase.from("inscripciones_alumno").select("*").eq("curp", "ZZZZ999999HDFRRN00").eq("activo", true),
);

// Catálogo: asignaciones de profesor
await medir("Profesor · asignaciones_profesor eq(profesor_clave, activo) [resolverAsignacionesProfesor]", () =>
  supabase.from("asignaciones_profesor").select("*").eq("profesor_clave", "ZZZZZZ").eq("activo", true),
);

// Catálogo: grupo_materias activos
await medir("Profesor · grupo_materias eq(activo) [oferta completa]", () =>
  supabase.from("grupo_materias").select("*").eq("activo", true),
);

// Catálogo: grupos activos del periodo
await medir("Catálogo · grupos eq(activo) [resolución de grupos]", () =>
  supabase.from("grupos").select("*").eq("activo", true),
);

// Tutores: listarTutores
await medir("Directivo · tutores range(0,4999) [listarTutores]", () =>
  supabase.from("tutores").select("*").range(0, 4999),
);

// Credenciales iniciales de tutores
await medir("Directivo · tutor_credenciales_iniciales [listarCredencialesInicialesDeTutores]", () =>
  supabase.from("tutor_credenciales_iniciales").select("*"),
);

// Etiquetas personales por grado/grupo (fallback legacy de asistencias)
await medir("Profesor · ETIQUETAS PERSONALES eq(grado,grupo) [fallback legacy]", () =>
  supabase
    .from("ETIQUETAS PERSONALES")
    .select("CURP, GRADO, GRUPO, CARRERA")
    .eq("GRADO", "1RO")
    .eq("GRUPO", "A"),
);

// Materia legacy: tabla real con datos (se detecta dinámicamente desde el spec)
const spec = await fetch(`${urlBase}/rest/v1/`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  cache: "no-store",
}).then((r) => r.json());
const tablasSpec = Object.keys(spec.definitions ?? {});
const materiasReales = tablasSpec
  .filter((t) => /MAT\d+|MATEM|MATE/i.test(t))
  .slice(0, 6);
if (materiasReales.length) {
  for (const t of materiasReales) {
    const { data, error } = await supabase.from(t).select("id").limit(1);
    if (error || !data?.length) continue;
    await medir(`Alumno · ${t} select(*) order(id) [leerVistaMateriaAlumno]`, () =>
      supabase.from(t).select("*").order("id", { ascending: true }),
    );
  }
} else {
  console.log("  (no se detectaron tablas de materia con datos para medir)");
}

console.log("\nPerfilado completado. Solo lectura; sin cambios en esquema.");

