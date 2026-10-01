#!/usr/bin/env node
/**
 * test-evaluaciones-puro.mjs — suite pura de `lib/escolar/ciclo/evaluaciones-puro.ts`.
 *
 * QUÉ MIDE: validación de fechas y rangos, solapamientos, validación de entrada
 *           y resolución local fecha→(ciclo, parcial).
 * QUÉ ESCRIBE: nada. Carga el `.ts` directamente. No toca la base ni la red.
 * CÓMO SE EJECUTA: node scripts/test-evaluaciones-puro.mjs
 */
const E = await import("../lib/escolar/ciclo/evaluaciones-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

/* ── Fechas ISO ───────────────────────────────────────────────────────── */
console.log("\nfechas");
ok("fecha válida", E.esFechaISO("2026-09-30"));
ok("año bisiesto válido", E.esFechaISO("2024-02-29"));
ok("2026 no es bisiesto", !E.esFechaISO("2026-02-29"));
ok("mes 13 no existe", !E.esFechaISO("2026-13-01"));
ok("texto no es fecha", !E.esFechaISO("not a date"));
ok("número no es fecha", !E.esFechaISO(20260930));
ok("mes sin cero no pasa", !E.esFechaISO("2026-9-30"));
eq(E.normalizarFechaEvaluacion(" 2026-09-30 "), "2026-09-30", "trim");
eq(E.normalizarFechaEvaluacion("bad"), null, "inválida → null");
eq(E.normalizarFechaEvaluacion(5), null, "no string → null");

/* ── Rangos ───────────────────────────────────────────────────────────── */
console.log("\nrangos");
const ev = (a, b) => ({ fecha_inicio: a, fecha_fin: b });
ok("fecha en el borde inicial", E.evaluacionContieneFecha(ev("2026-01-01", "2026-01-31"), "2026-01-01"));
ok("fecha en el borde final", E.evaluacionContieneFecha(ev("2026-01-01", "2026-01-31"), "2026-01-31"));
ok("fuera del rango", !E.evaluacionContieneFecha(ev("2026-01-01", "2026-01-31"), "2026-02-01"));
ok("ciclo con rango contiene", E.cicloContieneFecha({ fecha_inicio: "2026-01-01", fecha_fin: "2026-06-30" }, "2026-03-01"));
ok("ciclo sin rango no contiene", !E.cicloContieneFecha({ fecha_inicio: null, fecha_fin: null }, "2026-03-01"));
ok("solapamiento", E.rangosSeSolapan(ev("2026-01-01", "2026-01-15"), ev("2026-01-10", "2026-01-20")));
ok("tocarse cuenta como solape", E.rangosSeSolapan(ev("2026-01-01", "2026-01-10"), ev("2026-01-10", "2026-01-20")));
ok("disjunto no solapa", !E.rangosSeSolapan(ev("2026-01-01", "2026-01-05"), ev("2026-01-06", "2026-01-10")));

/* ── Conflictos ───────────────────────────────────────────────────────── */
console.log("\nconflictos");
const otras = [
  { id: "a", numero: 1, nombre: "P1", fecha_inicio: "2026-01-01", fecha_fin: "2026-01-15" },
  { id: "b", numero: 2, nombre: "P2", fecha_inicio: "2026-02-01", fecha_fin: "2026-02-10" },
];
eq(E.evaluacionesEnConflicto({ fechaInicio: "2026-01-10", fechaFin: "2026-01-20" }, otras).map((o) => o.id), ["a"], "detecta el parcial en conflicto");
eq(E.evaluacionesEnConflicto({ fechaInicio: "2026-01-10", fechaFin: "2026-01-20" }, otras, "a").length, 0, "ignorarId excluye");

/* ── Validación de entrada ────────────────────────────────────────────── */
console.log("\nvalidación de entrada");
const okVal = E.validarInputEvaluacion({ numero: 1, nombre: "Parcial 1", fechaInicio: "2026-01-01", fechaFin: "2026-01-31" });
ok("entrada válida", okVal.ok);
ok("activo por defecto true", okVal.ok && okVal.valor.activo === true);
ok("activo explícito false", E.validarInputEvaluacion({ numero: 1, nombre: "P", fechaInicio: "2026-01-01", fechaFin: "2026-01-31", activo: false }).valor.activo === false);
ok("número 0 rechazado", !E.validarInputEvaluacion({ numero: 0, nombre: "P", fechaInicio: "2026-01-01", fechaFin: "2026-01-31" }).ok);
ok("nombre vacío rechazado", !E.validarInputEvaluacion({ numero: 1, nombre: "", fechaInicio: "2026-01-01", fechaFin: "2026-01-31" }).ok);
ok("cierre anterior a inicio", !E.validarInputEvaluacion({ numero: 1, nombre: "P", fechaInicio: "2026-01-31", fechaFin: "2026-01-01" }).ok);
ok("fecha inválida rechazada", !E.validarInputEvaluacion({ numero: 1, nombre: "P", fechaInicio: "x", fechaFin: "2026-01-31" }).ok);

/* ── Resolución local ─────────────────────────────────────────────────── */
console.log("\nresolución");
const parcial1 = { id: "e1", periodo_id: "p1", numero: 1, nombre: "P1", fecha_inicio: "2026-01-01", fecha_fin: "2026-01-31", activo: true };
const parcialInactivo = { ...parcial1, id: "e0", activo: false };
eq(E.resolverEvaluacionPorFechaLocal("2026-01-15", [parcialInactivo, parcial1])?.id, "e1", "salta inactivo y encuentra activo");
const p1 = { id: "p1", nombre: "2026-2027", activo: true, fecha_inicio: "2026-01-01", fecha_fin: "2026-12-31" };
const resConRango = E.resolverCicloEvaluacionLocal("2026-01-15", [p1], new Map([["p1", [parcial1]]]));
ok("ciclo con rango resuelto", resConRango?.periodo.id === "p1");
ok("parcial resuelto", resConRango?.evaluacion?.id === "e1");
const p2 = { id: "p2", nombre: "2026-2027", activo: true, fecha_inicio: null, fecha_fin: null };
const resSinRango = E.resolverCicloEvaluacionLocal("2026-01-15", [p2], new Map([["p2", [parcial1]]]));
ok("ciclo sin rango resuelto por parcial", resSinRango?.periodo.id === "p2");
ok("sin coincidencia → null", E.resolverCicloEvaluacionLocal("2027-01-01", [p1], new Map([["p1", [parcial1]]])) === null);

/* ── Orden estable ────────────────────────────────────────────────────── */
console.log("\norden");
const desorden = [{ numero: 2, nombre: "B" }, { numero: 1, nombre: "A" }];
eq(E.ordenarEvaluacionesPorNumero(desorden).map((e) => e.numero), [1, 2], "ordena por número");
eq(desorden.map((e) => e.numero), [2, 1], "no muta el original");

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
