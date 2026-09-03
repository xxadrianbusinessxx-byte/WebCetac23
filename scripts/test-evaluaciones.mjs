/**
 * Pruebas de la capa FASE CICLO (periodos_evaluacion + resolución por fecha).
 *
 * Verifica funciones PURAS (sin Supabase):
 *   - validación de fechas y entradas de parcial
 *   - solapamientos y duplicados
 *   - resolución fecha → ciclo → parcial
 *   - detección de ciclo dentro del archivo de horario
 *
 * Uso (recompilar tras cambios en lib/escolar/evaluaciones.ts o
 * lib/escolar/horario-importar.ts):
 *   npx tsc lib/escolar/evaluaciones.ts lib/escolar/horario-importar.ts ^
 *     --outDir scripts/.tmp-evaluaciones --module commonjs --target es2020 ^
 *     --moduleResolution node --esModuleInterop --skipLibCheck
 *   node scripts/test-evaluaciones.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-evaluaciones");
const m = require(path.join(dir, "evaluaciones.js"));
const hor = require(path.join(dir, "horario-importar.js"));

let pasadas = 0;
let fallidas = 0;

function ok(nombre, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallidas++;
    console.error(`  ✗ ${nombre} ${detalle}`);
  }
}

function ev(id, numero, nombre, inicio, fin, activo = true) {
  return {
    id,
    periodo_id: "p1",
    numero,
    nombre,
    fecha_inicio: inicio,
    fecha_fin: fin,
    activo,
  };
}

console.log("\n1) Validación de fechas e insumos");
ok("fecha ISO válida", m.esFechaISO("2026-09-07"));
ok("fecha ISO inválida 2026-13-40", !m.esFechaISO("2026-13-40"));
ok("fecha ISO inválida texto", !m.esFechaISO("7 sep 2026"));
const invertida = m.validarInputEvaluacion({
  numero: 2,
  nombre: "Parcial 2",
  fechaInicio: "2026-12-20",
  fechaFin: "2026-12-01",
});
ok("fechas invertidas rechazadas", !invertida.ok);
const basica = m.validarInputEvaluacion({
  numero: 1,
  nombre: "Parcial 1",
  fechaInicio: "2026-09-01",
  fechaFin: "2026-10-30",
});
ok("parcial válido aceptado", basica.ok && basica.valor.numero === 1);
ok(
  "número 0 rechazado",
  !m.validarInputEvaluacion({
    numero: 0,
    nombre: "x",
    fechaInicio: "2026-09-01",
    fechaFin: "2026-09-30",
  }).ok,
);

console.log("\n2) Duplicados y solapamientos");
const p1 = ev("e1", 1, "Parcial 1", "2026-09-01", "2026-09-30");
const p2 = ev("e2", 2, "Parcial 2", "2026-10-01", "2026-11-15");
const p3 = ev("e3", 3, "Parcial 3", "2026-11-16", "2026-12-18");
const solape = m.evaluacionesEnConflicto(
  { fechaInicio: "2026-11-10", fechaFin: "2026-11-25" },
  [p1, p2, p3],
);
ok(
  "detección de solapamiento (intervalo cruza P2 y P3)",
  solape.length === 2 && solape.some((x) => x.numero === 2) && solape.some((x) => x.numero === 3),
);
ok(
  "rangos contiguos no se solapan",
  m.evaluacionesEnConflicto(
    { fechaInicio: "2026-12-19", fechaFin: "2026-12-30" },
    [p1, p2, p3],
  ).length === 0,
);
ok(
  "rango tocando el inicio es solape",
  m.evaluacionesEnConflicto(
    { fechaInicio: "2026-09-15", fechaFin: "2026-09-30" },
    [p1],
  ).length === 1,
);
const cuatro = m.validarInputEvaluacion({
  numero: 4,
  nombre: "Parcial 4",
  fechaInicio: "2026-12-19",
  fechaFin: "2026-12-30",
});
ok("más de tres parciales permitidos (configurable)", cuatro.ok);
ok("fecha inicio exacta contenida", m.evaluacionContieneFecha(p2, "2026-10-01"));
ok("fecha fin exacta contenida", m.evaluacionContieneFecha(p2, "2026-11-15"));
ok("fecha fuera no contenida", !m.evaluacionContieneFecha(p2, "2026-11-16"));

console.log("\n3) Resolución fecha → ciclo → parcial");
const ciclos = [
  { id: "cA", nombre: "2026-2027", activo: true, fecha_inicio: "2026-08-24", fecha_fin: "2027-07-16" },
  { id: "cB", nombre: "2025-2026", activo: false, fecha_inicio: "2025-08-25", fecha_fin: "2026-07-10" },
];
const porPeriodo = new Map([
  ["cA", [ev("a1", 1, "Parcial 1", "2026-09-01", "2026-10-30"), ev("a2", 2, "Parcial 2", "2026-11-02", "2026-12-18"), ev("a3", 3, "Parcial 3", "2027-01-11", "2027-03-05")]],
  ["cB", [ev("b1", 1, "Parcial 1", "2025-09-01", "2025-11-15")]],
]);
const r1 = m.resolverCicloEvaluacionLocal("2026-09-15", ciclos, porPeriodo);
ok("dentro del parcial 1", r1?.periodo.nombre === "2026-2027" && r1?.evaluacion?.numero === 1);
const r2 = m.resolverCicloEvaluacionLocal("2026-12-01", ciclos, porPeriodo);
ok("dentro del parcial 2", r2?.evaluacion?.numero === 2);
const r3 = m.resolverCicloEvaluacionLocal("2027-02-01", ciclos, porPeriodo);
ok("dentro del parcial 3", r3?.evaluacion?.numero === 3);
const rex = m.resolverCicloEvaluacionLocal("2026-10-31", ciclos, porPeriodo);
ok("fecha entre parciales: ciclo conocido, sin parcial", rex?.periodo.nombre === "2026-2027" && rex?.evaluacion === null);
const antes = m.resolverCicloEvaluacionLocal("2026-08-01", ciclos, porPeriodo);
ok("fecha antes del ciclo → null", antes === null);
const despues = m.resolverCicloEvaluacionLocal("2027-08-01", ciclos, porPeriodo);
ok("fecha después del ciclo → null", despues === null);
const enInicio = m.resolverCicloEvaluacionLocal("2026-09-01", ciclos, porPeriodo);
ok("fecha exacta en inicio", enInicio?.evaluacion?.numero === 1);
const enFin = m.resolverCicloEvaluacionLocal("2027-03-05", ciclos, porPeriodo);
ok("fecha exacta en cierre", enFin?.evaluacion?.numero === 3);
const historico = m.resolverCicloEvaluacionLocal("2025-10-01", ciclos, porPeriodo);
ok("resuelve ciclo inactivo cuando no hay otro", historico?.periodo.nombre === "2025-2026" && historico?.evaluacion?.numero === 1);

console.log("\n4) Ciclo detectado en el archivo de horario");
ok("detecta 2026-2027 en archivo", hor.detectarCicloEnFilasHorario([["Horario 2026-2027"], ["Carrera", "Grado"]]) === "2026-2027");
ok("detecta otro ciclo", hor.detectarCicloEnFilasHorario([["Ciclo escolar 2027-2028"]]) === "2027-2028");
ok("sin ciclo → null", hor.detectarCicloEnFilasHorario([["Carrera", "Grado", "Grupo"]]) === null);
ok("ciclos ambiguos → null", hor.detectarCicloEnFilasHorario([["2026-2027"], ["2027-2028"]]) === null);

console.log(`\nRESULTADO: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);

