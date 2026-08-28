#!/usr/bin/env node
/**
 * C4.28 — GENERADOR DEL RENAME FÍSICO DE TABLAS DE MATERIAS
 *
 * Regla de renombrado (determinista y documentada):
 *   - El identificador físico NUEVO = [GRADO][CARRERA][GRUPO]MAT###:
 *       GRADO   → 1RO, 2DO, 3RO, 4TO, 5TO, 6TO
 *       CARRERA → código corto de la carrera (MECATRONICA→"MC", RH→"RH");
 *                 1RO (sin carrera) → segmento vacío.
 *       GRUPO   → letra del grupo (A, B, …).
 *       MAT###  → número secuencial de 3 dígitos POR (grado, carrera, grupo).
 *   - MAT### NO significa "Matemáticas" ni lleva semántica: es solo el ID
 *     técnico permanente. La identidad académica (materia, alias, periodo)
 *     vive en grupo_materias → grupos/materias y en materias_nombres_visibles;
 *     el nombre físico NUNCA se parsea en la aplicación.
 *   - Ejemplos:
 *       1RO A CIENCIAS NATURALES        → 1ROAMAT001
 *       2DO A RH CIENCIAS NATURALES     → 2DORHAMAT001
 *       2DO A MECATRONICA CIENCIAS NAT. → 2DOMCAMAT001
 *       5TO A MECATRONICA INGLES        → 5TOMCAMAT001
 *   - Cada (grado, carrera, grupo) reinicia su numeración en 001 (máximo 10
 *     materias por grupo) y el prefijo completo garantiza unicidad global.
 *
 * Salidas:
 *   supabase/renombrar-tablas-materias.sql   (ALTER TABLE + UPDATE + validación)
 *   supabase/mapa-renombrado-materias.json   (viejo → nuevo → contexto)
 *
 * Uso: node scripts/migrar-nombres-fisicos.mjs
 * (NO ejecuta nada contra Supabase: solo genera archivos.)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** Código corto de carrera usado en el nombre físico (solo identificación). */
const CARRERA_CODIGO = new Map([
  ["MECATRONICA", "MC"],
  ["RH", "RH"],
]);

/** Código de carrera o "" si no aplica; fallback: 2 primeras letras. */
function codigoCarrera(carrera) {
  if (!carrera) return "";
  const c = carrera.toUpperCase();
  return CARRERA_CODIGO.get(c) ?? c.slice(0, 2);
}

/* ---------------------------------------------------------------------------
 * 1) Leer la lista estática de materias (fuente: OpenAPI sincronizado)
 * ------------------------------------------------------------------------- */
const src = fs.readFileSync(
  path.join(root, "lib", "escolar", "materias-list.ts"),
  "utf8",
);
const m = src.match(
  /export const MATERIAS_ESCOLAR: readonly string\[\] = \[([\s\S]*?)\] as const;/,
);
if (!m) {
  console.error("No se pudo leer MATERIAS_ESCOLAR desde lib/escolar/materias-list.ts");
  process.exit(1);
}
const nombres = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
if (!nombres.length) {
  console.error("Lista de materias vacía.");
  process.exit(1);
}

/* ---------------------------------------------------------------------------
 * 2) Transpilar módulos TS puros a CommonJS temporal (patrón del proyecto)
 * ------------------------------------------------------------------------- */
const tmp = path.join(__dirname, ".tmp-rename");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

for (const [rel, out] of [
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/materia-identidad.ts", "materia-identidad.js"],
]) {
  const codigo = fs.readFileSync(path.join(root, rel), "utf8");
  const { outputText } = ts.transpileModule(codigo, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: rel,
  });
  fs.writeFileSync(path.join(tmp, out), outputText);
}

const identidad = require(path.join(tmp, "materia-identidad.js"));

/* ---------------------------------------------------------------------------
 * 3) Construir el mapa viejo → nuevo
 * ------------------------------------------------------------------------- */
const carreras = identidad.carrerasDesdeTablas(nombres);
const mapa = new Map(); // nombreViejo -> { nuevo, grado, grupo, carrera, asignatura }
const contadorPorGrupo = new Map(); // clave "grado|carrera|grupo" -> nº
const sinParsear = [];

for (const nombre of nombres) {
  const id = identidad.materiaIdDesdeNombreTabla(nombre, carreras);
  if (!id || !id.asignatura) {
    sinParsear.push(nombre);
    continue;
  }
  const grado = id.grado;
  const codCarrera = codigoCarrera(id.carrera);
  const grupo = id.grupo;
  const claveGrupo = `${grado}|${id.carrera ?? ""}|${grupo}`;
  const n = (contadorPorGrupo.get(claveGrupo) ?? 0) + 1;
  contadorPorGrupo.set(claveGrupo, n);
  // Formato C4.28: [GRADO][CARRERA][GRUPO]MAT###
  const nuevo = `${grado}${codCarrera}${grupo}MAT${String(n).padStart(3, "0")}`;
  mapa.set(nombre, {
    nuevo,
    grado,
    grupo,
    carrera: id.carrera,
    asignatura: id.asignatura,
  });
}

if (sinParsear.length) {
  console.error("Nombres sin parsear (no se renombrarán):", sinParsear);
}
if (!mapa.size) {
  console.error("No se generó ningún mapeo.");
  process.exit(1);
}

/* Validar unicidad de los nombres nuevos */
const duplicados = new Set();
const visto = new Set();
for (const v of mapa.values()) {
  if (visto.has(v.nuevo)) duplicados.add(v.nuevo);
  visto.add(v.nuevo);
}
if (duplicados.size) {
  console.error("COLISIÓN de nombres nuevos:", [...duplicados]);
  process.exit(1);
}

const pares = [...mapa.entries()].map(([viejo, v]) => ({ viejo, nuevo: v.nuevo }));
/* ---------------------------------------------------------------------------
 * 4) Escribir supabase/renombrar-tablas-materias.sql
 * ------------------------------------------------------------------------- */
const paresSql = pares
  .map((p) => `'${p.viejo}' || chr(2) || '${p.nuevo}'`)
  .join(", ");

const sql = `-- ============================================================================
-- C4.28 — RENAME FÍSICO DE TABLAS DE MATERIAS (GENERADO AUTOMÁTICAMENTE)
--
-- Generado por: scripts/migrar-nombres-fisicos.mjs
-- Fecha: ${new Date().toISOString()}
-- Total de tablas: ${pares.length}
--
-- REGLA:
--   * Nuevo nombre físico = [GRADO][CARRERA][GRUPO]MAT### (identificador
--     técnico permanente, único y explícito):
--       GRADO   → 1RO, 2DO, 3RO, 4TO, 5TO, 6TO
--       CARRERA → código corto (MECATRONICA→"MC", RH→"RH"); 1RO → vacío.
--       GRUPO   → letra del grupo (A, B, …).
--       MAT###  → nº secuencial de 3 dígitos POR (grado, carrera, grupo).
--   * MAT### NO significa la materia: es SOLO el ID técnico. NO derivar
--     materia/alias/periodo desde el nombre físico en la aplicación; la
--     identidad académica vive en grupo_materias → grupos → carreras y en
--     grupo_materias → materias, y el almacenamiento físico en
--     grupo_materias.tabla_legacy.
--   * Ejemplos: 1ROAMAT001 · 2DORHAMAT001 · 2DOMCAMAT001 · 5TOMCAMAT001
--
-- OPERACIÓN:
--   1) ALTER TABLE "viejo" RENAME TO "nuevo" (solo si existe; error si el
--      destino ya está ocupado).
--   2) UPDATE grupo_materias.tabla_legacy → nuevo nombre exacto.
--   3) UPDATE materias_nombres_visibles.materia_id → nuevo nombre (el ALIAS
--      textual NO cambia; solo se re-apunta la clave física).
--   4) UPDATE materias_mapeo_columnas.materia_id → nuevo nombre.
--   5) Validación: cada tabla_legacy apunta a una tabla física existente.
--
-- NO borra tablas, NO recrea tablas, NO copia datos, NO altera columnas.
-- Re-ejecutable (idempotente): las tablas ya renombradas se omiten.
-- Aplicar en Supabase → SQL Editor.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) RENAME FÍSICO (explícito y seguro)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  par text;
  viejo text;
  nuevo text;
  sep integer;
BEGIN
  FOREACH par IN ARRAY ARRAY[${paresSql}]
  LOOP
    sep := position(chr(2) in par);
    viejo := left(par, sep - 1);
    nuevo := substring(par from sep + 1);

    IF to_regclass(format('public.%I', viejo)) IS NULL THEN
      RAISE NOTICE 'RENAME omitido (la tabla no existe): %', viejo;
      CONTINUE;
    END IF;

    IF to_regclass(format('public.%I', nuevo)) IS NOT NULL THEN
      RAISE EXCEPTION 'RENAME ABORTADO: el nombre destino % ya existe (revisar mapa).', nuevo;
    END IF;

    EXECUTE format('ALTER TABLE public.%I RENAME TO %I', viejo, nuevo);
    RAISE NOTICE 'RENOMBRADA: % → %', viejo, nuevo;
  END LOOP;
END $$;
-- ----------------------------------------------------------------------------
-- 2) Referencias operativas → nuevo nombre exacto
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  par text;
  viejo text;
  nuevo text;
  sep integer;
BEGIN
  FOREACH par IN ARRAY ARRAY[${paresSql}]
  LOOP
    sep := position(chr(2) in par);
    viejo := left(par, sep - 1);
    nuevo := substring(par from sep + 1);

    EXECUTE format(
      'UPDATE public.grupo_materias SET tabla_legacy = %L WHERE tabla_legacy = %L',
      nuevo, viejo
    );
    EXECUTE format(
      'UPDATE public.materias_nombres_visibles SET materia_id = %L WHERE materia_id = %L',
      nuevo, viejo
    );
    EXECUTE format(
      'UPDATE public.materias_mapeo_columnas SET materia_id = %L WHERE materia_id = %L',
      nuevo, viejo
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Validación post-migración
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  n text;
BEGIN
  FOR t IN
    SELECT DISTINCT tabla_legacy
    FROM public.grupo_materias
    WHERE tabla_legacy IS NOT NULL AND tabla_legacy <> ''
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'VALIDACIÓN: tabla_legacy sin tabla física → %', t;
    END IF;
  END LOOP;

  FOR n IN
    SELECT DISTINCT materia_id
    FROM public.materias_nombres_visibles
    WHERE materia_id IS NOT NULL AND materia_id <> ''
  LOOP
    IF to_regclass(format('public.%I', n)) IS NULL THEN
      RAISE NOTICE 'VALIDACIÓN: alias con materia_id sin tabla física → %', n;
    END IF;
  END LOOP;
END $$;

COMMIT;
`;

/* ---------------------------------------------------------------------------
 * 5) Escribir supabase/mapa-renombrado-materias.json
 * ------------------------------------------------------------------------- */
const json = {
  regla:
    "[GRADO][CARRERA][GRUPO]MAT### — código de carrera (MECATRONICA=MC, RH=RH; 1RO sin carrera) y número secuencial por (grado, carrera, grupo).",
  generado: new Date().toISOString(),
  total: pares.length,
  mapa: pares.map((p) => ({
    viejo: p.viejo,
    nuevo: p.nuevo,
    grupo: mapa.get(p.viejo).grupo,
    carrera: mapa.get(p.viejo).carrera,
    asignatura: mapa.get(p.viejo).asignatura,
  })),
};
fs.writeFileSync(
  path.join(root, "supabase", "mapa-renombrado-materias.json"),
  JSON.stringify(json, null, 2),
);
fs.writeFileSync(path.join(root, "supabase", "renombrar-tablas-materias.sql"), sql);

/* ---------------------------------------------------------------------------
 * 6) Resumen
 * ------------------------------------------------------------------------- */
console.log(`Mapeo generado: ${pares.length} tablas.`);
console.log("Ejemplos:");
for (const p of pares.slice(0, 3)) console.log(`  ${p.viejo} → ${p.nuevo}`);
console.log("  …");
const porGrado = new Map();
for (const p of pares) {
  porGrado.set(p.nuevo.slice(0, 3), (porGrado.get(p.nuevo.slice(0, 3)) ?? 0) + 1);
}
for (const [grado, n] of porGrado) console.log(`  ${grado}: ${n} tablas`);
console.log("Archivos:");
console.log("  supabase/renombrar-tablas-materias.sql");
console.log("  supabase/mapa-renombrado-materias.json");

// Limpieza del directorio temporal de transpilación.
fs.rmSync(tmp, { recursive: true, force: true });

