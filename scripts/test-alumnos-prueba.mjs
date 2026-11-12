#!/usr/bin/env node
/**
 * test-alumnos-prueba.mjs — suite de `lib/escolar/alumno/alumnos-prueba-puro.ts`
 * y de la lectura `alumnos-prueba.ts`, 2026-11-12 (PROMPT AC).
 *
 * La regla que sostiene la función: **el alumno de prueba sale de las listas
 * del personal y nadie más sale**. Si el filtro quitara de más, un alumno real
 * desaparecería del padrón, de la plantilla de asistencia o de su boleta, y
 * nadie lo notaría porque «falta uno» no rompe nada. Eso no lo ve `tsc`.
 *
 * Reglas verificadas:
 *   1. Conjunto vacío (hoy, y sin columna) → la lista sale igual, en copia.
 *   2. Quita por CURP sin importar mayúsculas ni espacios, y conserva el orden.
 *   3. No muta la entrada.
 *   4. `quitarCurpsDePrueba` devuelve un Set nuevo, sin los de prueba.
 *   5. La lectura nunca lanza: error, columna ausente o excepción → Set vacío;
 *      y pregunta exactamente por `es_prueba = true`.
 */
// Node carga los `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar.
const P = await import("../lib/escolar/alumno/alumnos-prueba-puro.ts");
const L = await import("../lib/escolar/alumno/alumnos-prueba.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) {
    pasadas++;
    console.log(`  ok  ${nombre}`);
  } else {
    fallos++;
    console.error(`  FALLA ${nombre} ${detalle}`);
  }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const filas = [
  { curp: "AAAA000101HDFXXX01", n: 1 },
  { curp: " zzzz000101hdfxxx09 ", n: 2 },
  { curp: "BBBB000101HDFXXX02", n: 3 },
];
const prueba = new Set(["ZZZZ000101HDFXXX09"]);

console.log("\n── 1. conjunto vacío no cambia nada ──\n");
{
  const r = P.quitarAlumnosDePrueba(filas, (f) => f.curp, new Set());
  eq(r, filas, "mismas filas, mismo orden");
  ok("es una copia, no la misma referencia", r !== filas);
}

console.log("\n── 2. quita solo al de prueba ──\n");
{
  const r = P.quitarAlumnosDePrueba(filas, (f) => f.curp, prueba);
  eq(r.map((f) => f.n), [1, 3], "quita al de prueba aunque venga en minúsculas y con espacios");
  const nadie = P.quitarAlumnosDePrueba(filas, (f) => f.curp, new Set(["XXXX000101HDFXXX00"]));
  eq(nadie.length, 3, "una CURP de prueba que no está en la lista no quita a nadie");
}

console.log("\n── 3. no muta la entrada ──\n");
{
  const copia = JSON.stringify(filas);
  P.quitarAlumnosDePrueba(filas, (f) => f.curp, prueba);
  eq(JSON.stringify(filas), copia, "la entrada queda intacta");
}

console.log("\n── 4. quitarCurpsDePrueba ──\n");
{
  const entrada = new Set(["AAAA000101HDFXXX01", "ZZZZ000101HDFXXX09"]);
  const r = P.quitarCurpsDePrueba(entrada, prueba);
  ok("devuelve un Set nuevo", r instanceof Set && r !== entrada);
  eq([...r], ["AAAA000101HDFXXX01"], "sin la de prueba");
  eq(entrada.size, 2, "el Set de entrada no se toca");
  eq([...P.quitarCurpsDePrueba(entrada, new Set())].length, 2, "conjunto vacío → las mismas");
  eq(
    [...P.conjuntoDeCurpsPrueba([{ CURP: " zzzz000101hdfxxx09 " }, { CURP: null }, {}])],
    ["ZZZZ000101HDFXXX09"],
    "conjuntoDeCurpsPrueba normaliza y descarta vacías",
  );
}

console.log("\n── 5. la lectura nunca lanza ──\n");
{
  function doble(resultado, lanza = false) {
    const reg = { tabla: null, select: null, filtros: [] };
    const api = {
      select(s) { reg.select = s; return api; },
      eq(k, v) { reg.filtros.push([k, v]); return api; },
      then: (res, rej) => (lanza ? Promise.reject(new Error("red")) : Promise.resolve(resultado)).then(res, rej),
    };
    return { reg, from(t) { reg.tabla = t; return api; } };
  }

  const bien = doble({ data: [{ CURP: "zzzz000101hdfxxx09" }], error: null });
  const r = await L.leerCurpsDePrueba(bien);
  eq([...r], ["ZZZZ000101HDFXXX09"], "devuelve las CURP marcadas, normalizadas");
  eq(bien.reg.tabla, "ALUMNOS", "lee ALUMNOS");
  eq(bien.reg.filtros, [["es_prueba", true]], "pregunta solo por es_prueba = true");

  const sinColumna = doble({ data: null, error: { code: "42703", message: "column ALUMNOS.es_prueba does not exist" } });
  eq((await L.leerCurpsDePrueba(sinColumna)).size, 0, "columna ausente → vacío");
  eq((await L.leerCurpsDePrueba(doble({ data: null, error: { message: "x" } }))).size, 0, "otro error → vacío");
  eq((await L.leerCurpsDePrueba(doble(null, true))).size, 0, "excepción → vacío, no lanza");
}

console.log(`\n${pasadas} ok · ${fallos} fallos`);
if (fallos > 0) process.exit(1);
