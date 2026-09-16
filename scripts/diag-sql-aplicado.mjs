// diag-sql-aplicado.mjs — DIAGNÓSTICO (SOLO LECTURA)
// ¿Qué SQL preparado en supabase/ está realmente aplicado en la base?
// Comprueba, contra Supabase real: RPCs invocables, tablas existentes y
// columnas presentes. NO modifica nada.
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

/** RPCs reales: se leen del spec OpenAPI (/rpc/<fn>).
 *  OJO: NO sirve hacer POST {} para detectarlas — PostgREST empareja funciones
 *  por NOMBRE DE ARGUMENTO, asi que una funcion con parametros obligatorios
 *  responde PGRST202 a un body vacio aunque exista. */
let rpcsCache = null;
async function rpcExiste(fn) {
  if (!rpcsCache) {
    const r = await fetch(`${urlBase}/rest/v1/`, { headers: H });
    const sp = await r.json();
    rpcsCache = new Set(
      Object.keys(sp.paths ?? {}).filter((p) => p.startsWith("/rpc/")).map((p) => p.slice(5)),
    );
  }
  return rpcsCache.has(fn);
}

/** Columnas reales de una tabla, vía el spec OpenAPI. */
let specCache = null;
async function spec() {
  if (!specCache) {
    const r = await fetch(`${urlBase}/rest/v1/`, { headers: H });
    specCache = (await r.json()).definitions ?? {};
  }
  return specCache;
}
async function tieneColumna(tabla, col) {
  const d = await spec();
  return Boolean(d[tabla]?.properties?.[col]);
}
async function tablaExiste(tabla) {
  const d = await spec();
  return Boolean(d[tabla]);
}

// Artefacto observable por archivo SQL. Solo los que crean algo verificable.
const CHECKS = [
  ["crear-rpc-obtener-perfil-alumno.sql", { rpc: "obtener_perfil_alumno" }],
  ["crear-rpc-activar-ciclo-f4.sql", { rpc: "activar_ciclo_operativo" }],
  ["crear-rpc-eliminar-ciclo.sql", { rpc: "eliminar_ciclo" }],
  ["crear-rpc-traspasar-materia.sql", { rpc: "traspasar_materia_a_profesor" }],
  ["crear-rpc-agregar-columnas.sql", { rpc: "escolar_agregar_columnas" }],
  ["crear-rpc-escolar-sync-columns.sql", { rpc: "escolar_sync_columns" }],
  ["crear-tablas-catalogo-academico.sql", { tabla: "grupos" }],
  ["crear-tablas-tutores.sql", { tabla: "tutores" }],
  ["crear-tablas-justificaciones.sql", { tabla: "justificaciones_asistencia" }],
  ["crear-tablas-asistencias.sql", { tabla: "clases_impartidas" }],
  ["crear-tablas-semestres.sql", { tabla: "academico_semestres" }],
  ["crear-tablas-documentos.sql", { tabla: "DOCUMENTOS" }],
  ["crear-tabla-alumno-etiquetas.sql", { tabla: "alumno_etiquetas" }],
  ["crear-tabla-credenciales-iniciales.sql", { tabla: "tutor_credenciales_iniciales" }],
  ["crear-tabla-nombres-visibles-materias.sql", { tabla: "materias_nombres_visibles" }],
  ["crear-tabla-mapeo-columnas-materias.sql", { tabla: "materias_mapeo_columnas" }],
  ["crear-periodos-evaluacion.sql", { tabla: "periodos_evaluacion" }],
  ["crear-horario-semanal.sql", { tabla: "horario_semanal" }],
  ["crear-auditoria-ciclo.sql", { tabla: "ciclo_transiciones" }],
  ["agregar-estado-ciclo.sql", { col: ["periodos", "estado"] }],
  ["agregar-periodo-vigente.sql", { col: ["periodos", "vigente"] }],
  ["agregar-periodo-id-calendario.sql", { col: ["calendario_escolar", "periodo_id"] }],
  ["agregar-periodo-asistencia.sql", { col: ["asistencia_alumnos", "periodo_id"] }],
  ["agregar-profesor-id-asistencia.sql", { col: ["asistencia_alumnos", "profesor_id"] }],
  ["agregar-atribucion-profesor-asistencia.sql", { col: ["clases_impartidas", "grupo_materia_id"] }],
  ["agregar-materia-justificaciones.sql", { col: ["justificaciones_asistencia", "grupo_materia_id"] }],
  ["agregar-pesos-actividades-materia.sql", { col: ["materias_mapeo_columnas", "pesos_actividades"] }],
  ["agregar-debe-cambiar-credenciales-profesores.sql", { col: ["PROFESORES", "debe_cambiar_credenciales"] }],
  ["agregar-campos-personales-alumno.sql", { col: ["alumno_etiquetas", "id"] }],
  ["migrar-asistencia-profesor.sql", { col: ["asistencia_alumnos", "profesor_clave"] }],
  ["crear-configuracion-clases-profesor.sql", { tabla: "configuracion_clases_profesor" }],
];

async function main() {
  const existentes = new Set(fs.readdirSync(path.join(root, "supabase")).filter((f) => f.endsWith(".sql")));
  const aplicados = [];
  const noAplicados = [];
  const sinArchivo = [];

  for (const [archivo, check] of CHECKS) {
    if (!existentes.has(archivo)) { sinArchivo.push(archivo); continue; }
    let ok = false;
    let detalle = "";
    if (check.rpc) { ok = await rpcExiste(check.rpc); detalle = `rpc ${check.rpc}`; }
    else if (check.tabla) { ok = await tablaExiste(check.tabla); detalle = `tabla ${check.tabla}`; }
    else if (check.col) { ok = await tieneColumna(check.col[0], check.col[1]); detalle = `${check.col[0]}.${check.col[1]}`; }
    (ok ? aplicados : noAplicados).push([archivo, detalle]);
  }

  console.log("=== SQL APLICADO EN LA BASE ===");
  for (const [a, d] of aplicados) console.log(`  OK    ${a.padEnd(50)} (${d})`);
  console.log(`\n=== SQL PREPARADO PERO NO APLICADO (${noAplicados.length}) ===`);
  if (noAplicados.length === 0) console.log("  (ninguno)");
  for (const [a, d] of noAplicados) console.log(`  FALTA ${a.padEnd(50)} (${d} no existe)`);

  const cubiertos = new Set(CHECKS.map(([a]) => a));
  const sinCheck = [...existentes].filter((f) => !cubiertos.has(f)).sort();
  console.log(`\n=== SQL SIN COMPROBACION AUTOMATICA (${sinCheck.length}) ===`);
  console.log("  (migraciones de datos, limpiezas o renombrados: no dejan artefacto verificable)");
  for (const f of sinCheck) console.log(`  ?     ${f}`);

  if (sinArchivo.length) {
    console.log(`\n=== DECLARADOS EN EL CHECK PERO SIN ARCHIVO (${sinArchivo.length}) ===`);
    for (const f of sinArchivo) console.log(`  !!    ${f}`);
  }
  console.log(`\nTOTAL .sql en supabase/: ${existentes.size}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
