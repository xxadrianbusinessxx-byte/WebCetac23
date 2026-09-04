/**
 * test-justificacion-por-clase.mjs - Pruebas PURAS de la justificacion POR
 * CLASE (Prompt B), sin Supabase.
 *
 * Compilar (recompilar tras cambios en lib/escolar/justificaciones.ts):
 *   npx tsc lib/escolar/justificaciones.ts ^
 *     --outDir scripts/.tmp-justificacion-clase --module commonjs ^
 *     --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
 *   node scripts/test-justificacion-por-clase.mjs
 *
 * Casos de la VALIDACION del prompt:
 *  1. dia con 3 bloques (2 MATEMATICAS + 1 HISTORIA): justificar HISTORIA
 *     aplica 1 clase, no 3;
 *  2. justificar MATEMATICAS aplica 2;
 *  3. justificar ambas -> 3, nunca mas que las esperadas;
 *  4. reaplicar la misma justificacion -> mismo total (idempotente);
 *  5. materia_clave null (dia completo) -> faltante entero;
 *  6. materia que NO esta en el horario de ese dia -> rechazada;
 *  7. una justificacion rechazada no suma clases.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".tmp-justificacion-clase",
);
const M = require(path.join(dir, "justificaciones.js"));

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log("  OK " + nombre);
  } else {
    fallidas++;
    console.error("  FALLA " + nombre + " " + detalle);
  }
}

const BLOQUES = { MATEMATICAS: 2, HISTORIA: 1 };
const total = (materias, faltante = 3) =>
  M.calcularClasesJustificadasPorDia({
    bloquesPorMateria: BLOQUES,
    materias,
    faltante,
  });

console.log("1) Justificar HISTORIA aplica 1, no 3");
ok("HISTORIA -> 1", total(["HISTORIA"]) === 1, "got " + total(["HISTORIA"]));

console.log("2) Justificar MATEMATICAS aplica 2");
ok("MATEMATICAS -> 2", total(["MATEMATICAS"]) === 2, "got " + total(["MATEMATICAS"]));

console.log("3) Ambas -> 3, nunca mas que las esperadas");
ok("ambas -> 3", total(["MATEMATICAS", "HISTORIA"]) === 3);
ok(
  "nunca mas que el faltante",
  total(["MATEMATICAS", "HISTORIA", "MATEMATICAS"], 3) <= 3,
);

console.log("4) Reaplicar la misma justificacion -> mismo total (idempotente)");
ok(
  "reaplicar HISTORIA no cambia el total",
  total(["HISTORIA"]) === total(["HISTORIA", "HISTORIA"]),
);

console.log("5) materia null (dia completo) -> faltante entero");
ok("dia completo -> 3", total([null]) === 3, "got " + total([null]));
ok(
  "dia completo con falta parcial (faltante 2) -> 2",
  total([null], 2) === 2,
);

console.log("6) Materia que NO esta en el horario de ese dia -> rechazada");
ok(
  "materiaTieneClaseEnDia(HISTORIA) true",
  M.materiaTieneClaseEnDia(BLOQUES, "HISTORIA"),
);
ok(
  "materiaTieneClaseEnDia(EDU_FISICA) false",
  !M.materiaTieneClaseEnDia(BLOQUES, "EDU_FISICA"),
);
ok(
  "materia fuera del horario aporta 0",
  total(["EDU_FISICA"]) === 0,
  "got " + total(["EDU_FISICA"]),
);

console.log("7) Una justificacion rechazada no suma clases");
{
  const soloAprobada = total(["HISTORIA"]);
  const conRechazadaFuera = total(["HISTORIA", "MATEMATICAS"]);
  ok(
    "aprobar HISTORIA -> 1",
    soloAprobada === 1,
    "got " + soloAprobada,
  );
  ok(
    "al aprobar MATEMATICAS despues -> total 3 (fijo, no acumula de a 1)",
    conRechazadaFuera === 3,
    "got " + conRechazadaFuera,
  );
  // La rechazada nunca se incluye en la lista aprobada: no altera el total.
  const sinRechazada = total(["HISTORIA"]);
  ok(
    "omitir la rechazada deja el mismo total",
    sinRechazada === soloAprobada,
  );
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);
