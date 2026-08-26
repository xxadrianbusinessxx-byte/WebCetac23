#!/usr/bin/env node
/**
 * PRUEBAS BLOQUE 7A — Identidad + Nombres visibles de materias.
 *
 * Transpila los módulos puros (sin dependencias de servidor) y ejecuta las
 * verificaciones obligatorias: parsing de identidad (1RO sin carrera / 2DO
 * MECATRONICA / 2DO RH), fallback sin alias, alias aplicado, renombrar dos
 * veces (solo cambia nombreVisible), búsqueda por nombre visible / ID técnico
 * y validaciones.
 *
 * Las pruebas de integración (roles + Supabase) se validan con
 * `npx tsc --noEmit`, `npm run build` y la revisión manual del informe.
 * Uso: node scripts/test-materia-identidad.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// 1) Transpilar los módulos puros a CommonJS temporal
// ---------------------------------------------------------------------------
const tmp = path.join(__dirname, ".tmp-tests");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const archivos = [
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/materia-identidad.ts", "materia-identidad.js"],
  ["lib/escolar/nombres-visibles.ts", "nombres-visibles.js"],
  ["lib/escolar/materias-list.ts", "materias-list.js"],
];

for (const [src, out] of archivos) {
  const ruta = path.join(root, src);
  const codigo = fs.readFileSync(ruta, "utf8");
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

const identidad = require(path.join(tmp, "materia-identidad.js"));
const visibles = require(path.join(tmp, "nombres-visibles.js"));
const { normalizarNombre } = require(path.join(tmp, "nombres.js"));
const { MATERIAS_ESCOLAR } = require(path.join(tmp, "materias-list.js"));

// ---------------------------------------------------------------------------
// 2) Mini harness de aserciones
// ---------------------------------------------------------------------------
let pasos = 0;
let fallos = 0;

function ok(cond, nombre) {
  pasos++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else {
    fallos++;
    console.error(`  ✗ ${nombre}`);
  }
}

function eq(real, esperado, nombre) {
  ok(real === esperado, `${nombre} → "${real}" (esperado "${esperado}")`);
}

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

// ---------------------------------------------------------------------------
// 3) Prueba 1-3: parsing de identidad
// ---------------------------------------------------------------------------
seccion("1-3. Parsing de identidad");

const t1 = identidad.materiaIdDesdeNombreTabla("1RO A INGLES");
eq(t1?.grado, "1RO", "1) 1RO A INGLES → grado");
eq(t1?.grupo, "A", "1) 1RO A INGLES → grupo");
eq(t1?.carrera, null, "1) 1RO A INGLES → carrera null");
eq(t1?.asignatura, "INGLES", "1) 1RO A INGLES → asignatura");
eq(t1?.idInterno, "1RO A INGLES", "1) 1RO A INGLES → idInterno");

const t2 = identidad.materiaIdDesdeNombreTabla(
  "2DO A MECATRONICA CONCIENCIA HISTORICA",
);
eq(t2?.grado, "2DO", "2) 2DO A MECATRONICA CONCIENCIA HISTORICA → grado");
eq(t2?.grupo, "A", "2) … → grupo");
eq(t2?.carrera, "MECATRONICA", "2) … → carrera");
eq(t2?.asignatura, "CONCIENCIA HISTORICA", "2) … → asignatura");
eq(
  t2?.idInterno,
  "2DO A MECATRONICA CONCIENCIA HISTORICA",
  "2) … → idInterno",
);

const t3 = identidad.materiaIdDesdeNombreTabla("2DO B RH MATEMATICAS");
eq(t3?.grado, "2DO", "3) 2DO B RH MATEMATICAS → grado");
eq(t3?.grupo, "B", "3) … → grupo");
eq(t3?.carrera, "RH", "3) … → carrera");
eq(t3?.asignatura, "MATEMATICAS", "3) … → asignatura");

// Asignaturas compuestas y nombres reales del proyecto
const t4 = identidad.materiaIdDesdeNombreTabla(
  "1RO A PENSAMIENTO MATEMATICO",
);
eq(t4?.asignatura, "PENSAMIENTO MATEMATICO", "Asignatura compuesta (1RO)");
const t5 = identidad.materiaIdDesdeNombreTabla(
  "3RO B RH PENSAMIENTO FILOSOFICO",
);
eq(t5?.carrera, "RH", "Carrera RH en asignatura compuesta");
eq(t5?.asignatura, "PENSAMIENTO FILOSOFICO", "Asignatura compuesta con carrera");

// ---------------------------------------------------------------------------
// 4) Detección dinámica de carreras con datos reales del proyecto
// ---------------------------------------------------------------------------
seccion("Detección dinámica de carreras");

const muestraReal = [
  "1RO A CIENCIAS NATURALES",
  "1RO A CIENCIAS SOCIALES",
  "1RO A CONCIENCIA HISTORICA",
  "1RO A INGLES",
  "1RO A PENSAMIENTO MATEMATICO",
  "2DO A MECATRONICA INGLES",
  "2DO A RH INGLES",
  "2DO B MECATRONICA CONCIENCIA HISTORICA",
  "3RO A MECATRONICA PENSAMIENTO FILOSOFICO",
  "4TO B RH CIENCIAS NATURALES",
  "5TO A MECATRONICA CIENCIAS SOCIALES",
  "6TO B RH MODULO",
];

const carreras = identidad.carrerasDesdeTablas(muestraReal);
ok(carreras.has("MECATRONICA"), "Detección dinámica incluye MECATRONICA");
ok(carreras.has("RH"), "Detección dinámica incluye RH");
ok(!carreras.has("CIENCIAS"), "No detecta CIENCIAS como carrera");
ok(!carreras.has("PENSAMIENTO"), "No detecta PENSAMIENTO como carrera");

// ---------------------------------------------------------------------------
// 5) Pruebas 4-5 y 14-15: fallback, alias y búsqueda
// ---------------------------------------------------------------------------
seccion("19. Todas las tablas reales del proyecto se parsean correctamente");

const carrerasReales = identidad.carrerasDesdeTablas(MATERIAS_ESCOLAR);
ok(carrerasReales.has("MECATRONICA"), "Carreras reales incluyen MECATRONICA");
ok(carrerasReales.has("RH"), "Carreras reales incluyen RH");
ok(MATERIAS_ESCOLAR.length >= 200, `Cantidad real de materias: ${MATERIAS_ESCOLAR.length}`);

let sinAsignatura = 0;
let idDistinto = 0;
const asignaturas = new Set();
for (const tabla of MATERIAS_ESCOLAR) {
  const id = identidad.materiaIdDesdeNombreTabla(tabla, carrerasReales);
  if (!id || !id.asignatura) sinAsignatura++;
  if (id && id.idInterno !== tabla) idDistinto++;
  if (id?.asignatura) asignaturas.add(id.asignatura);
}
ok(sinAsignatura === 0, "Todas las tablas reales tienen asignatura (0 sin parsear)");
ok(idDistinto === 0, "idInterno siempre es el nombre exacto de la tabla");
ok(
  asignaturas.size >= 8 && asignaturas.size <= 12,
  `Asignaturas únicas detectadas: ${asignaturas.size} (rango esperado 8-12)`,
);

seccion("4-5. Fallback sin alias y alias aplicado");

const sinAlias = visibles.materiasConNombreVisible(["1RO A INGLES"], new Map());
eq(sinAlias[0]?.nombreVisible, "1RO A INGLES", "4) Sin alias → nombreVisible = idInterno");
eq(sinAlias[0]?.idInterno, "1RO A INGLES", "4) Sin alias → idInterno intacto");

const idHist = "2DO A MECATRONICA CONCIENCIA HISTORICA";
const conAlias = visibles.materiasConNombreVisible(
  [idHist],
  new Map([[idHist, "Conciencia histórica"]]),
);
eq(conAlias[0]?.nombreVisible, "Conciencia histórica", "5) Con alias → nombreVisible = alias");
eq(conAlias[0]?.idInterno, idHist, "5) Con alias → idInterno intacto");

seccion("6-7. Renombrar dos veces: solo cambia nombreVisible");

let aliases = new Map([[idHist, "Conciencia histórica"]]);
let m = visibles.materiasConNombreVisible([idHist], aliases)[0];
eq(m.nombreVisible, "Conciencia histórica", "6a) 1er renombre → Conciencia histórica");
eq(m.idInterno, idHist, "6a) idInterno intacto");

aliases = new Map([[idHist, "Historia universal"]]);
m = visibles.materiasConNombreVisible([idHist], aliases)[0];
eq(m.nombreVisible, "Historia universal", "6b) 2º renombre → Historia universal");
eq(m.idInterno, idHist, "6b) idInterno intacto (nunca cambia)");

// Resolución por normalización (alias guardado con otra mayúscula/espacio)
const aliasNorm = visibles.materiasConNombreVisible(
  [idHist],
  new Map([["2DO A MECATRONICA CONCIENCIA HISTORICA ", "Conciencia histórica"]]),
);
eq(aliasNorm[0]?.nombreVisible, "Conciencia histórica", "Alias resuelto por normalización");

// ---------------------------------------------------------------------------
// 6) Búsqueda por nombre visible y por ID técnico
// ---------------------------------------------------------------------------
seccion("14-15. Búsqueda por nombre visible y por ID técnico");

const nombreVisible = "Conciencia histórica";
ok(
  normalizarNombre(nombreVisible).includes(normalizarNombre("conciencia")),
  "14) Buscar «conciencia» encuentra el nombre visible",
);
ok(
  normalizarNombre(idHist).includes(normalizarNombre("MECATRONICA")),
  "15) Buscar «MECATRONICA» encuentra el ID técnico",
);
ok(
  normalizarNombre(idHist).includes(normalizarNombre("2DO A")),
  "15b) Buscar «2DO A» encuentra el ID técnico",
);

seccion("16. Seleccionar resuelve al ID técnico correcto");

const lista = visibles.materiasConNombreVisible(
  [idHist, "1RO A INGLES"],
  new Map([[idHist, "Conciencia histórica"]]),
);
const porVisible = lista.find((x) => x.nombreVisible === "Conciencia histórica");
eq(porVisible?.idInterno, idHist, "16) Selección «Conciencia histórica» → idInterno real");

// ---------------------------------------------------------------------------
// 7) Validación del nombre visible
// ---------------------------------------------------------------------------
seccion("Validación del nombre visible");

ok(visibles.validarNombreVisible("   ") !== null, "Nombre visible vacío → error");
ok(visibles.validarNombreVisible("Conciencia histórica") === null, "Nombre visible válido → ok");
ok(
  visibles.validarNombreVisible("x".repeat(121)) !== null,
  "Nombre visible > 120 → error",
);
ok(
  visibles.validarNombreVisible("x".repeat(120)) === null,
  "Nombre visible = 120 → ok",
);

// ---------------------------------------------------------------------------
// 8) Resumen
// ---------------------------------------------------------------------------
console.log(`\n${pasos} verificaciones, ${fallos} fallos`);

// Limpieza del directorio temporal de transpilación
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* no crítico */
}

process.exit(fallos ? 1 : 0);


