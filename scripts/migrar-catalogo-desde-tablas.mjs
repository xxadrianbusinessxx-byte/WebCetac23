#!/usr/bin/env node
/**
 * C2 — MIGRACIÓN/SEMILLA DEL CATÁLOGO ACADÉMICO
 *
 * Modos:
 *   node scripts/migrar-catalogo-desde-tablas.mjs --preview [--periodo 2026-2027]
 *       → previsualiza la semilla (plan) y el matching ETIQUETAS → grupos.
 *         SOLO LECTURA (SELECT). No escribe nada.
 *   node scripts/migrar-catalogo-desde-tablas.mjs --semilla --periodo 2026-2027
 *       [--crear-periodo] --confirm
 *       → aplica la semilla del catálogo (idempotente). REQUIERE --confirm.
 *   node scripts/migrar-catalogo-desde-tablas.mjs --inscripciones
 *       [--periodo 2026-2027] [--una-activa] --confirm
 *       → aplica inscripciones con match inequívoco. REQUIERE --confirm.
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 * NO ejecutar sin aprobación explícita del responsable del proyecto.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/* ---------------------------------------------------------------------------
 * 1) Env local (.env.local)
 * ------------------------------------------------------------------------- */
function leerEnvLocal() {
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
  return env;
}

/* ---------------------------------------------------------------------------
 * 2) Descubrimiento de tablas legacy (materias), excluyendo sistema y catálogo
 * ------------------------------------------------------------------------- */
const TABLAS_NO_MATERIA = new Set([
  "ALUMNOS", "PROFESORES", "COMENTARIOS", "COMENTARIOS PROFESORES",
  "ETIQUETAS (STATUS)", "ETIQUETAS PERSONALES", "BOLETA", "mensajes_chat",
  "periodos", "carreras", "materias", "grupos", "grupo_materias",
  "inscripciones_alumno", "asignaciones_profesor",
]);

async function descubrirTablasLegacy(urlBase, key) {
  const r = await fetch(`${urlBase}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await r.json();
  const defs = spec.definitions ?? spec;
  return Object.keys(defs)
    .filter((k) => !k.startsWith("rpc_"))
    .filter((t) => !TABLAS_NO_MATERIA.has(t) && !/REGISTRO DE CALIFICACIONES FINALES/i.test(t))
    .sort((a, b) => a.localeCompare(b, "es"));
}

/* ---------------------------------------------------------------------------
 * 3) Transpilar módulos TS a CommonJS temporal (patrón del proyecto)
 * ------------------------------------------------------------------------- */
const tmp = path.join(__dirname, ".tmp-c2");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const MODULOS = [
  ["lib/escolar/tables.ts", "tables.js"],
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/mapeo-columnas.ts", "mapeo-columnas.js"],
  ["lib/escolar/materia-identidad.ts", "materia-identidad.js"],
  ["lib/escolar/buscar-en-filas.ts", "buscar-en-filas.js"],
  ["lib/escolar/csv.ts", "csv.js"],
  ["lib/escolar/alumnos.ts", "alumnos.js"],
  ["lib/escolar/catalogo-academico.ts", "catalogo-academico.js"],
  ["lib/escolar/migracion-catalogo.ts", "migracion-catalogo.js"],
];

for (const [src, out] of MODULOS) {
  const codigo = fs.readFileSync(path.join(root, src), "utf8");
  const { outputText } = ts.transpileModule(codigo, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: src,
  });
  fs.writeFileSync(path.join(tmp, out), outputText);
}

const mig = require(path.join(tmp, "migracion-catalogo.js"));

/* ---------------------------------------------------------------------------
 * 4) CLI
 * ------------------------------------------------------------------------- */
function argsParse(processArgs) {
  const a = processArgs.slice(2);
  const get = (name) => {
    const i = a.indexOf(name);
    return i >= 0 && i + 1 < a.length ? a[i + 1] : undefined;
  };
  return {
    preview: a.includes("--preview"),
    semilla: a.includes("--semilla"),
    inscripciones: a.includes("--inscripciones"),
    confirm: a.includes("--confirm"),
    crearPeriodo: a.includes("--crear-periodo"),
    unaActiva: a.includes("--una-activa"),
    periodo: get("--periodo"),
  };
}

function mostrarResumenSemilla(plan) {
  console.log(`\n[Semilla] periodo="${plan.periodoNombre}" crearPeriodoSiFalta=${plan.crearPeriodoSiFalta}`);
  console.log(`  tablas totales: ${plan.tablasTotales}`);
  console.log(`  tablas sin mapear: ${plan.tablasSinMapear.length}`);
  for (const t of plan.tablasSinMapear) console.log(`    SIN MAPEAR: ${t}`);
  console.log(`  colisiones de materia: ${plan.colisionesMateria.length}`);
  for (const c of plan.colisionesMateria) console.log(`    COLISIÓN ${c.clave}: ${c.nombres.join(" | ")}`);
  console.log(`  materias: ${plan.materias.length} | carreras: ${plan.carreras.length} | grupos: ${plan.grupos.length} | grupo_materias: ${plan.grupoMaterias.length}`);
}

function mostrarResumenPreview(p) {
  console.log(`\n[Preview inscripciones] periodo="${p.periodoSeleccionado}" inexistente=${p.periodoInexistente}`);
  console.log(`  total: ${p.totalRegistros} | con CURP válida: ${p.conCurpValida} | sin CURP: ${p.sinCurp}`);
  console.log(`  CURPs duplicadas: ${p.curpsDuplicadas.length} | alumnos existentes: ${p.alumnosExistentes} | por crear: ${p.alumnosPorCrear}`);
  console.log(`  matches: ${p.matches} | grupos inexistentes: ${p.gruposInexistentes} | ambiguos: ${p.matchesAmbiguos}`);
  console.log(`  inscripciones ya existentes: ${p.inscripcionesYaExistentes} | listos para insertar: ${p.listosParaInsertar}`);
  const errores = p.detalle.filter((d) => d.resultado === "sin_match" || d.resultado === "ambiguo");
  for (const d of errores.slice(0, 40)) {
    console.log(`    [${d.resultado}] ${d.curp} → ${d.gradoOriginal}/${d.grupoOriginal}/${d.carreraOriginal} (norm: ${d.gradoNormalizado}/${d.grupoNormalizado}/${d.carreraNormalizada}) candidatos=${d.candidatos.length}`);
  }
  if (errores.length > 40) console.log(`    … y ${errores.length - 40} más`);
}

async function main() {
  const o = argsParse(process.argv);
  const env = leerEnvLocal();
  const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlBase || !key) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL o la clave en .env.local.");
    process.exit(1);
  }
  const supabase = createClient(urlBase, key, { auth: { persistSession: false } });

  if (o.semilla) {
    if (!o.periodo) {
      console.error("--semilla requiere --periodo <nombre>.");
      process.exit(1);
    }
    if (!o.confirm) {
      console.error("--semilla requiere --confirm. No se ejecuta nada.");
      process.exit(1);
    }
    const tablas = await descubrirTablasLegacy(urlBase, key);
    const r = await mig.aplicarSemillaCatalogo(supabase, tablas, {
      periodoNombre: o.periodo,
      crearPeriodoSiFalta: o.crearPeriodo,
    });
    mostrarResumenSemilla(r.plan);
    console.log(`\n[Semilla aplicada] ok=${r.ok} ${r.error ?? ""}`);
    console.log(`  carreras creadas: ${r.carrerasCreadas} | materias creadas: ${r.materiasCreadas} | grupos creados: ${r.gruposCreados}`);
    console.log(`  grupo_materias creados: ${r.grupoMateriasCreados} | sin cambio: ${r.grupoMateriasSinCambio} | conflictos: ${r.grupoMateriasConflicto.length}`);
    for (const c of r.grupoMateriasConflicto) console.log(`    CONFLICTO tabla_legacy: ${c.grupo}/${c.materia} → ${c.tablaLegacy}`);
    if (!r.ok) process.exit(2);
    return;
  }

  if (o.inscripciones) {
    if (!o.confirm) {
      console.error("--inscripciones requiere --confirm. No se ejecuta nada.");
      process.exit(1);
    }
    const p = await mig.previsualizarInscripcionesDesdeEtiquetas(supabase, { periodoNombre: o.periodo });
    mostrarResumenPreview(p);
    if (p.periodoInexistente) {
      console.error("Periodo inexistente; no se inserta nada.");
      process.exit(2);
    }
    const r = await mig.aplicarInscripcionesDesdeEtiquetas(supabase, p, { unaActiva: o.unaActiva });
    console.log(`\n[Inscripciones aplicadas] ok=${r.ok} ${r.error ?? ""} insertadas=${r.insertadas} yaExistentes=${r.yaExistentes} alumnosCreados=${r.alumnosCreados}`);
    if (!r.ok) process.exit(2);
    return;
  }

  // Modo por defecto: PREVIEW (solo lectura).
  const tablas = await descubrirTablasLegacy(urlBase, key);
  const plan = mig.planSemillaCatalogo(tablas, {
    periodoNombre: o.periodo ?? "2026-2027",
    crearPeriodoSiFalta: false,
  });
  mostrarResumenSemilla(plan);
  const p = await mig.previsualizarInscripcionesDesdeEtiquetas(supabase, { periodoNombre: o.periodo });
  mostrarResumenPreview(p);
  console.log("\n[PREVIEW] No se escribió nada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

