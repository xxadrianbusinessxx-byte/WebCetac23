#!/usr/bin/env node
/**
 * PRUEBAS FASE 2 — Importación de etiquetas desde Excel (capa adaptadora).
 *
 * Transpila los módulos puros y verifica:
 *   · Importación INDIVIDUAL: encabezados = títulos; CURP ignorada; máximo 20;
 *     títulos duplicados normalizados; solo Excel (.xlsx/.xls).
 *   · Importación GLOBAL: columna CURP + columnas de etiquetas; errores por
 *     fila sin abortar; CURP duplicadas.
 *
 * Uso: node scripts/test-importar-etiquetas.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as XLSX from "xlsx";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// 1) Transpilar módulos puros a CommonJS temporal
// ---------------------------------------------------------------------------
const tmp = path.join(__dirname, ".tmp-tests-importar-etiquetas");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const archivos = [
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/tables.ts", "tables.js"],
  ["lib/escolar/buscar-en-filas.ts", "buscar-en-filas.js"],
  ["lib/escolar/mapeo-columnas.ts", "mapeo-columnas.js"],
  ["lib/escolar/csv.ts", "csv.js"],
  ["lib/escolar/etiquetas-dinamicas.ts", "etiquetas-dinamicas.js"],
  ["lib/escolar/importar-etiquetas.ts", "importar-etiquetas.js"],
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

const imp = require(path.join(tmp, "importar-etiquetas.js"));

// ---------------------------------------------------------------------------
// 2) Mini harness de aserciones + helpers de archivos
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

/** Construye un File .xlsx a partir de una matriz. */
function archivoExcel(matriz) {
  const ws = XLSX.utils.aoa_to_sheet(matriz);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new File([buffer], "etiquetas.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function archivoCsv() {
  return new File(["CURP,Deporte\nX,1"], "etiquetas.csv", { type: "text/csv" });
}

// ---------------------------------------------------------------------------
// 3) Importación INDIVIDUAL
// ---------------------------------------------------------------------------
seccion("Importación individual (encabezados = títulos)");

const indA = await imp.leerEtiquetasDesdeArchivoIndividual(
  archivoExcel([
    ["Altura", "Deporte", "Pasatiempo", "Meta"],
    ["1.75", "Fútbol", "Música", "Universidad"],
  ]),
);
ok(indA.ok, "Excel con 4 columnas de etiquetas → parseado");
eq(indA.ok && indA.etiquetas.length, 4, "4 etiquetas");
eq(indA.ok && indA.etiquetas[0].titulo, "Altura", "Título 1 = Altura");
eq(indA.ok && indA.etiquetas[0].valor, "1.75", "Valor 1 = 1.75");
eq(indA.ok && indA.etiquetas[3].titulo, "Meta", "Título 4 = Meta");
eq(indA.ok && indA.etiquetas[3].valor, "Universidad", "Valor 4 = Universidad");
ok(
  indA.ok &&
    indA.etiquetas.every(
      (e) => e.orden === indA.etiquetas.indexOf(e),
    ),
  "Orden secuencial 0..n-1",
);

const indB = await imp.leerEtiquetasDesdeArchivoIndividual(
  archivoExcel([
    ["CURP", "Altura", "Deporte"],
    ["ABC123", "1.75", "Fútbol"],
  ]),
);
ok(indB.ok, "Excel con columna CURP → parseado");
eq(indB.ok && indB.etiquetas.length, 2, "La columna CURP se ignora (2 etiquetas)");
ok(
  indB.ok && !indB.etiquetas.some((e) => e.titulo === "CURP"),
  "No se crea etiqueta «CURP»",
);

const veintiunaCols = [["E1"]];
for (let i = 2; i <= 22; i++) veintiunaCols[0].push(`E${i}`);
veintiunaCols.push(veintiunaCols[0].map((_, i) => `V${i}`));
const indC = await imp.leerEtiquetasDesdeArchivoIndividual(archivoExcel(veintiunaCols));
ok(!indC.ok, "21 columnas → inválido (máximo 20)");
ok(!indC.ok && indC.error.includes("20"), "Error menciona el máximo de 20");

const indD = await imp.leerEtiquetasDesdeArchivoIndividual(
  archivoExcel([
    ["Deporte", " deporte "],
    ["Fútbol", "Balón"],
  ]),
);
ok(indD.ok, "Títulos duplicados normalizados → parseado sin error");
eq(indD.ok && indD.etiquetas.length, 1, "Se deduplica el título (1 etiqueta)");

const indE = await imp.leerEtiquetasDesdeArchivoIndividual(archivoCsv());
ok(!indE.ok, "Archivo .csv → rechazado (solo Excel)");
ok(!indE.ok && indE.error.includes("Excel"), "Error indica formato Excel");

// ---------------------------------------------------------------------------
// 4) Importación GLOBAL
// ---------------------------------------------------------------------------
seccion("Importación global (CURP + columnas)");

const gA = await imp.leerEtiquetasDesdeArchivoGlobal(
  archivoExcel([
    ["CURP", "Deporte", "Pasatiempo"],
    ["CURP-1", "Fútbol", "Música"],
    ["CURP-2", "Natación", "Lectura"],
    ["", "Vacío", ""],
    ["CURP-1", "Béisbol", ""],
  ]),
);
ok(gA.ok, "Excel global → parseado");
eq(gA.ok && gA.filas.length, 2, "2 filas válidas");
eq(gA.ok && gA.errores.length, 1, "1 error por CURP vacía");
ok(
  gA.ok && gA.errores[0].includes("Fila 4"),
  "El error referencia la fila del archivo",
);
eq(gA.ok && gA.duplicadosCurp.length, 1, "1 CURP duplicada detectada");
eq(gA.ok && gA.duplicadosCurp[0], "CURP-1", "Duplicado = CURP-1");
eq(gA.ok && gA.filas[0].etiquetas[0].titulo, "Deporte", "Primera etiqueta global");
eq(gA.ok && gA.filas[0].etiquetas[0].valor, "Fútbol", "Valor global 1");

const gB = await imp.leerEtiquetasDesdeArchivoGlobal(
  archivoExcel([
    ["Nombre", "Deporte"],
    ["Juan", "Fútbol"],
  ]),
);
ok(!gB.ok, "Sin columna CURP → inválido");
ok(!gB.ok && gB.error.includes("CURP"), "Error indica columna CURP");

// ---------------------------------------------------------------------------
// 5) Resumen
// ---------------------------------------------------------------------------
console.log(`\n${pasos} verificaciones, ${fallos} fallos`);

// Casos de integración (server/DB), validados con tsc/eslint y revisión manual:
//   · actionImportarEtiquetasIndividual: autorización (tutor/directivo) +
//     mezcla con las etiquetas existentes + guardarEtiquetasDinamicas.
//   · actionImportarEtiquetasGlobal: SOLO directivo; valida existencia de
//     alumnos (batch) y aplica por alumno acumulando errores.

// Limpieza del directorio temporal de transpilación
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* no crítico */
}

process.exit(fallos ? 1 : 0);

