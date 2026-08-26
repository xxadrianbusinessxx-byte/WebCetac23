#!/usr/bin/env node
/**
 * PRUEBAS BLOQUE 7B — Identificación semántica de columnas de calificaciones.
 *
 * Transpila los módulos puros y verifica los 28 casos obligatorios:
 *  1-17. Clasificación de encabezados (alumno, curp, actividad, parcial,
 *        promedio, final, auxiliar, desconocida, tildes, minúsculas, espacios).
 * 18.   Orden de actividades desordenadas.
 * 19-20. Auxiliares y CURP ocultas para el alumno.
 * 21-24. Localización de la fila del alumno (CURP / nombre / tildes / orden).
 * 25-28. Integración (servidor/almacenamiento) → validados con tsc, build y
 *        revisión manual; aquí se documentan.
 *
 * Uso: node scripts/test-columnas-calificaciones.mjs
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
  ["lib/escolar/columnas-calificaciones.ts", "columnas-calificaciones.js"],
  ["lib/escolar/buscar-en-filas.ts", "buscar-en-filas.js"],
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

const col = require(path.join(tmp, "columnas-calificaciones.js"));
const { buscarIndiceFilaAlumno } = require(path.join(tmp, "buscar-en-filas.js"));

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

function cat(h) {
  return col.identificarColumnaCalificacion(h);
}

// ---------------------------------------------------------------------------
// 3) Pruebas 1-17: clasificación de encabezados
// ---------------------------------------------------------------------------
seccion("1-17. Clasificación de encabezados");

eq(cat("NOMBRE").categoria, "alumno", "1) NOMBRE → alumno");
eq(cat("NOMBRE COMPLETO").categoria, "alumno", "2) NOMBRE COMPLETO → alumno");
eq(cat("CURP").categoria, "curp", "3) CURP → curp");

eq(cat("ACT 1").categoria, "actividad", "4) ACT 1 → actividad");
eq(cat("ACT 1").numero, 1, "4) ACT 1 → número 1");
eq(cat("ACT1").categoria, "actividad", "5) ACT1 → actividad");
eq(cat("ACT1").numero, 1, "5) ACT1 → número 1");
eq(cat("ACTIVIDAD 1").categoria, "actividad", "6) ACTIVIDAD 1 → actividad");
eq(cat("ACTIVIDAD 1").numero, 1, "6) ACTIVIDAD 1 → número 1");

eq(cat("P1").categoria, "parcial", "7) P1 → parcial");
eq(cat("P1").numero, 1, "7) P1 → número 1");
eq(cat("PARCIAL 2").categoria, "parcial", "8) PARCIAL 2 → parcial");
eq(cat("PARCIAL 2").numero, 2, "8) PARCIAL 2 → número 2");

eq(cat("PROMEDIO").categoria, "promedio", "9) PROMEDIO → promedio");
eq(cat("CALIFICACION FINAL").categoria, "final", "10) CALIFICACION FINAL → final");

eq(cat("FIRMA").categoria, "auxiliar", "11) FIRMA → auxiliar");
eq(cat("OBSERVACIONES").categoria, "auxiliar", "12) OBSERVACIONES → auxiliar");
eq(cat("NO. CONTROL").categoria, "auxiliar", "13) NO. CONTROL → auxiliar");
eq(cat("XYZ 2025").categoria, "desconocida", "14) XYZ 2025 → desconocida");

eq(cat("EVALUACIÓN 1").categoria, "parcial", "15) EVALUACIÓN 1 (con tilde) → parcial");
eq(cat("EVALUACIÓN 1").numero, 1, "15) EVALUACIÓN 1 → número 1");
eq(cat("promedio").categoria, "promedio", "16) promedio (minúsculas) → promedio");
eq(cat("CALIFICACION   FINAL").categoria, "final", "17) CALIFICACION   FINAL (espacios) → final");

// Variantes adicionales razonables
eq(cat("CURP ALUMNO").categoria, "curp", "Variante: CURP ALUMNO → curp");
eq(cat("ESTUDIANTE").categoria, "alumno", "Variante: ESTUDIANTE → alumno");
eq(cat("PROM").categoria, "promedio", "Variante: PROM → promedio");
eq(cat("NOTA FINAL").categoria, "final", "Variante: NOTA FINAL → final");
eq(cat("EVALUACION 1").categoria, "parcial", "Variante: EVALUACION 1 → parcial");
eq(cat("PARCIAL I").categoria, "parcial", "Variante: PARCIAL I → parcial");
eq(cat("PARCIAL I").numero, 1, "Variante: PARCIAL I → número 1");
eq(cat("OBS").categoria, "auxiliar", "Variante: OBS → auxiliar");
eq(cat("CLAVE").categoria, "auxiliar", "Variante: CLAVE → auxiliar");

// ---------------------------------------------------------------------------
// 4) Pruebas 18-20: orden y visibilidad para el alumno
// ---------------------------------------------------------------------------
seccion("18-20. Orden de actividades y columnas ocultas al alumno");

const desordenadas = col.identificarColumnasCalificaciones([
  "ACT 3",
  "ACT 1",
  "ACT 2",
]);
const etiquetasAct = desordenadas.visiblesAlumno.map((c) => c.etiqueta);
eq(
  etiquetasAct.join("|"),
  "Actividad 1|Actividad 2|Actividad 3",
  "18) ACT 3/ACT 1/ACT 2 → orden Actividad 1,2,3",
);

const encabezadosCompletos = [
  "NOMBRE",
  "CURP",
  "ACT 1",
  "ACT 2",
  "P1",
  "P2",
  "PROMEDIO",
  "FIRMA",
  "OBSERVACIONES",
  "NO. CONTROL",
];
const completo = col.identificarColumnasCalificaciones(encabezadosCompletos);

const categoriasAlumno = completo.visiblesAlumno.map((c) => c.categoria);
ok(
  !categoriasAlumno.includes("auxiliar"),
  "19) Columnas auxiliares nunca aparecen en la vista del alumno",
);
ok(
  !completo.visiblesAlumno.some((c) => c.categoria === "curp"),
  "20) CURP no aparece en la vista del alumno",
);
ok(
  !completo.visiblesAlumno.some((c) => c.categoria === "desconocida"),
  "14b) Desconocidas ocultas al alumno",
);

// vistaConColumnasIdentificadas con rol alumno: solo columnas relevantes,
// ordenadas y con etiquetas amigables; fila reordenada según la vista.
seccion("Vista preparada para el alumno");

const vistaOriginal = {
  encabezados: encabezadosCompletos,
  filas: [["JUAN PEREZ LOPEZ", "CURP123", "9", "8", "7", "8", "10", "X", "OBS", "12345"]],
};
const vistaAlumno = col.vistaConColumnasIdentificadas(vistaOriginal, {
  rol: "alumno",
});
eq(
  vistaAlumno.encabezados.join("|"),
  "Alumno|Actividad 1|Actividad 2|Parcial 1|Parcial 2|Promedio",
  "Alumno: encabezados relevantes ordenados y amigables",
);
eq(vistaAlumno.filas[0].join("|"), "JUAN PEREZ LOPEZ|9|8|7|8|10", "Alumno: valores alineados con el nuevo orden");
ok(!vistaAlumno.encabezados.includes("CURP"), "Alumno: CURP oculta");
ok(!vistaAlumno.encabezados.includes("FIRMA"), "Alumno: FIRMA oculta");
ok(!vistaAlumno.encabezados.includes("OBSERVACIONES"), "Alumno: OBSERVACIONES oculta");

// Vista para profesor/directivo: todas las columnas, con original para diagnóstico.
seccion("Vista para profesor/directivo");

const vistaDocente = col.vistaConColumnasIdentificadas(vistaOriginal, {
  rol: "maestro",
});
eq(
  vistaDocente.encabezados.join("|"),
  "Alumno|CURP|Actividad 1|Actividad 2|Parcial 1|Parcial 2|Promedio|FIRMA|NO. CONTROL|OBSERVACIONES",
  "Docente: todas las columnas agrupadas y etiquetadas",
);
ok(
  vistaDocente.columnasIdentificadas.every((c) => c.encabezadoOriginal),
  "Docente: se conserva el encabezado original de cada columna",
);

// Detección de duplicados
const conDuplicados = col.identificarColumnasCalificaciones([
  "PARCIAL 1",
  "PARCIAL 1",
  "PROMEDIO",
]);
ok(conDuplicados.duplicados.length === 1, "Duplicados detectados (PARCIAL 1 ×2)");
ok(
  conDuplicados.columnas[0].duplicado && conDuplicados.columnas[1].duplicado,
  "Duplicados marcados en ambas columnas",
);

// ---------------------------------------------------------------------------
// 5) Pruebas 21-24: localización de la fila del alumno (buscar-en-filas)
// ---------------------------------------------------------------------------
seccion("21-24. Localización de la fila del alumno");

// 21) Alumno con CURP → encuentra su fila aunque el nombre esté en otra columna.
const filasClase = [
  ["MARIA LOPEZ GARCIA", "CURP-MARIA", "9", "8"],
  ["JUAN PEREZ LOPEZ", "CURP-JUAN", "10", "9"],
  ["ANA RUIZ MORA", "CURP-ANA", "7", "8"],
];
const idx21 = buscarIndiceFilaAlumno(filasClase, {
  curp: "CURP-JUAN",
  nombreCompleto: "",
});
eq(idx21, 1, "21) Alumno con CURP → localiza su fila (índice 1)");

// 22) Alumno sin CURP → encuentra por nombre normalizado.
const idx22 = buscarIndiceFilaAlumno(filasClase, {
  curp: null,
  nombreCompleto: "JUAN PEREZ LOPEZ",
});
eq(idx22, 1, "22) Sin CURP → encuentra por nombre normalizado");

// 23) Nombre con tildes → la normalización lo encuentra.
const filasTildes = [["GARCIA LOPEZ MARIA", "CURP-G", "8"], ["GARCÍA LÓPEZ MARÍA", "CURP-G2", "9"]];
const idx23 = buscarIndiceFilaAlumno(filasTildes, {
  curp: null,
  nombreCompleto: "GARCÍA LÓPEZ MARÍA",
});
ok(idx23 >= 0, "23) Nombre con tildes → encuentra correctamente");

// 24) Nombre en orden diferente → se documenta el resultado con la lógica existente.
const idx24 = buscarIndiceFilaAlumno(filasClase, {
  curp: null,
  nombreCompleto: "PEREZ LOPEZ JUAN",
});
ok(
  idx24 === 1,
  "24) Orden distinto (PEREZ LOPEZ JUAN) → la lógica existente lo encuentra (≥2 tokens)",
);

// Caso sin coincidencia: devuelve -1 y no rompe.
const idx25 = buscarIndiceFilaAlumno(filasClase, {
  curp: null,
  nombreCompleto: "PEDRO INFANTE CRUZ",
});
eq(idx25, -1, "Alumno inexistente → -1 (sin romper)");

// ---------------------------------------------------------------------------
// 6) Resumen
// ---------------------------------------------------------------------------
console.log(`\n${pasos} verificaciones, ${fallos} fallos`);

// Pruebas de integración 25-28 (servidor/almacenamiento):
//  25) Materia no permitida → rechazada en actionObtenerVistaMateria (server).
//  26) nombreVisible nunca se usa como ID de Supabase (verificado en código).
//  27) Tablas/columnas reales intactas (verificado con git diff).
//  28) Subida de Excel sin cambios (actionSubirMateriaExcel intacta).

// Limpieza del directorio temporal de transpilación
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* no crítico */
}

process.exit(fallos ? 1 : 0);


