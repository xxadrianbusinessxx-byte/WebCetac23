#!/usr/bin/env node
/**
 * PRUEBAS BLOQUE 7C.2 — Actualización incremental «Actualizar / agregar avance».
 *
 * Transpila los módulos puros y verifica:
 *   - resubida (1ª/2ª/3ª) con planificación incremental;
 *   - actualizar una columna existente sin tocar el resto;
 *   - Excel parcial: columnas y alumnos ausentes se conservan;
 *   - alumno existente se actualiza (CURP / nombre normalizado, tildes);
 *   - alumno nuevo se agrega;
 *   - no se duplican alumnos;
 *   - físico ≠ normalizado ≠ etiqueta (tildes no crean columna incorrecta).
 *
 * Uso: node scripts/test-materia-avance.mjs
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
// 1) Transpilar módulos puros a CommonJS temporal
// ---------------------------------------------------------------------------
const tmp = path.join(__dirname, ".tmp-tests");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const archivos = [
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/buscar-en-filas.ts", "buscar-en-filas.js"],
  ["lib/escolar/csv.ts", "csv.js"],
  ["lib/escolar/matriz-hoja.ts", "matriz-hoja.js"],
  ["lib/escolar/schema-tabla.ts", "schema-tabla.js"],
  ["lib/escolar/excel-a-registros.ts", "excel-a-registros.js"],
  ["lib/escolar/columnas-calificaciones.ts", "columnas-calificaciones.js"],
  ["lib/escolar/mapeo-columnas-materia.ts", "mapeo-columnas-materia.js"],
  ["lib/escolar/materia-avance.ts", "materia-avance.js"],
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

const avance = require(path.join(tmp, "materia-avance.js"));

// ---------------------------------------------------------------------------
// 2) Mini harness
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
// 3) Pruebas de planificación incremental
// ---------------------------------------------------------------------------
seccion("7C.2 · Actualizar / agregar avance");

const existentes = [
  {
    id: 1,
    alumno_nombre: "JUAN PEREZ LOPEZ",
    "Actividad 1": "8",
    "Actividad 2": "9",
    Promedio: "8.5",
  },
  {
    id: 2,
    alumno_nombre: "MARIA LOPEZ GARCIA",
    "Actividad 1": "7",
    "Actividad 2": "8",
    Promedio: "7.5",
  },
];

// 1) Actualizar una columna existente (solo la que trae el avance).
const avance1 = [{ alumno_nombre: "JUAN PEREZ LOPEZ", "Actividad 2": "10" }];
const plan1 = avance.planificarActualizacionAvance(existentes, avance1, null);
eq(plan1.alumnosActualizados, 1, "1) Juan se actualiza");
eq(plan1.updates[0].id, 1, "1) Se actualiza la fila id 1");
eq(plan1.updates[0].columnas["Actividad 2"], "10", "1) Actividad 2 → 10");
ok(!("Actividad 1" in plan1.updates[0].columnas), "1) Actividad 1 NO se toca (columna ausente)");
ok(!("Promedio" in plan1.updates[0].columnas), "1) Promedio NO se toca (columna ausente)");
eq(plan1.alumnosNuevos, 0, "1) Sin alumnos nuevos");
eq(plan1.inserts.length, 0, "1) Sin inserts");

// 2) Alumno existente identificado por CURP (orden de nombre distinto).
const existentesCurp = [
  { id: 10, alumno_nombre: "JUAN PEREZ LOPEZ", CURP: "CURP-JUAN", "Act 1": "8" },
  { id: 11, alumno_nombre: "MARIA LOPEZ GARCIA", CURP: "CURP-MARIA", "Act 1": "7" },
];
const avanceCurp = [{ alumno_nombre: "PEREZ LOPEZ JUAN", CURP: "CURP-JUAN", "Act 1": "9" }];
const planCurp = avance.planificarActualizacionAvance(existentesCurp, avanceCurp, "CURP");
eq(planCurp.alumnosActualizados, 1, "2) Identificado por CURP");
eq(planCurp.updates[0].id, 10, "2) Se actualiza la fila id 10");

// 3) Nombre con tildes → normalización lo encuentra.
const avanceTilde = [{ alumno_nombre: "MARÍA LÓPEZ GARCÍA", "Actividad 2": "9" }];
const planTilde = avance.planificarActualizacionAvance(existentes, avanceTilde, null);
eq(planTilde.alumnosActualizados, 1, "3) Nombre con tildes actualiza");
eq(planTilde.updates[0].id, 2, "3) Se actualiza la fila id 2");

// 4) Alumno nuevo → INSERT.
const avanceNuevo = [{ alumno_nombre: "CARLOS LOPEZ RUIZ", "Actividad 3": "10" }];
const planNuevo = avance.planificarActualizacionAvance(existentes, avanceNuevo, null);
eq(planNuevo.alumnosNuevos, 1, "4) Alumno nuevo se agrega");
eq(planNuevo.inserts[0].alumno_nombre, "CARLOS LOPEZ RUIZ", "4) Insert con el nombre completo");
eq(planNuevo.inserts[0]["Actividad 3"], "10", "4) Insert con la columna del avance");
eq(planNuevo.alumnosActualizados, 0, "4) Sin updates");

// 5) Alumnos ausentes del avance se conservan (no aparecen en el plan).
const nombresTocados = plan1.updates.map((u) => u.id);
ok(!nombresTocados.includes(2), "5) María (ausente del avance) no se toca");

// 6) No duplicar: dos filas del mismo alumno en el avance → un solo UPDATE.
const avanceDup = [
  { alumno_nombre: "JUAN PEREZ LOPEZ", "Actividad 2": "10" },
  { alumno_nombre: "JUAN PEREZ LOPEZ", "Actividad 2": "9" },
];
const planDup = avance.planificarActualizacionAvance(existentes, avanceDup, null);
eq(planDup.alumnosActualizados, 1, "6) No duplica: una sola fila actualizada");
eq(planDup.alumnosNuevos, 0, "6) No inserta duplicado");
eq(planDup.updates[0].columnas["Actividad 2"], "9", "6) La última fila del avance gana (fusión)");

// 7) Alumno nuevo repetido en el avance → un solo INSERT.
const avanceDupNuevo = [
  { alumno_nombre: "CARLOS LOPEZ RUIZ", "Actividad 3": "10" },
  { alumno_nombre: "CARLOS LOPEZ RUIZ", "Actividad 3": "9" },
];
const planDupNuevo = avance.planificarActualizacionAvance(existentes, avanceDupNuevo, null);
eq(planDupNuevo.alumnosNuevos, 1, "7) Alumno nuevo repetido → un solo insert");

// ---------------------------------------------------------------------------
// 4) Físico vs normalizado (columnas)
// ---------------------------------------------------------------------------
seccion("7C.2 · Físico vs normalizado (columnas)");

// 8) Encabezado con variante resuelve a la columna física existente.
eq(
  avance.resolverEncabezadoAColumnaExistente("Calificación final", [
    "CALIFICACION FINAL",
  ]),
  "CALIFICACION FINAL",
  "8) «Calificación final» → físico «CALIFICACION FINAL»",
);
eq(
  avance.resolverEncabezadoAColumnaExistente("CALIFICACION FINAL", [
    "CALIFICACION FINAL",
  ]),
  "CALIFICACION FINAL",
  "8b) Coincidencia exacta se conserva",
);
eq(
  avance.resolverEncabezadoAColumnaExistente("Parcial 1", [
    "CALIFICACION FINAL",
  ]),
  "Parcial 1",
  "8c) Columna inexistente devuelve el encabezado (se creará)",
);

// 9) columnasFaltantes: no propone crear una columna que ya existe por
//    normalización (tildes/mayúsculas).
const faltantes1 = avance.columnasFaltantes(
  ["id", "alumno_nombre", "CALIFICACION FINAL"],
  ["CALIFICACION FINAL", "Actividad 1"],
);
eq(faltantes1.join("|"), "Actividad 1", "9) Solo falta «Actividad 1» (no duplica «CALIFICACION FINAL»)");

// 10) Columna nueva sí se reporta como faltante.
const faltantes2 = avance.columnasFaltantes(
  ["id", "alumno_nombre"],
  ["Actividad 3"],
);
eq(faltantes2.join("|"), "Actividad 3", "10) Columna nueva se agrega");

// 11) Ambiguo (dos columnas colisionan por normalización) → no elige
//     arbitrariamente: devuelve el encabezado exacto.
eq(
  avance.resolverEncabezadoAColumnaExistente("CALIFICACIÓN FINAL", [
    "CALIFICACION FINAL",
    "Calificación final",
  ]),
  "CALIFICACIÓN FINAL",
  "11) Variante ambigua no resuelve a ninguna (no elige arbitrariamente)",
);

// ---------------------------------------------------------------------------
// 5) Resumen
// ---------------------------------------------------------------------------
console.log(`\n${pasos} verificaciones, ${fallos} fallos`);

// `actualizarMateriaDesdeArchivo` (persistencia) requiere Supabase: se valida
// con tsc, build y revisión manual (UPDATE por id / INSERT de nuevos).

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* no crítico */
}

process.exit(fallos ? 1 : 0);



