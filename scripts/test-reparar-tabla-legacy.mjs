/**
 * test-reparar-tabla-legacy.mjs - Pruebas PURAS de la reparacion de
 * grupo_materias.tabla_legacy (Prompt A), sin Supabase.
 *
 * Compilar (recompilar tras cambios en lib/escolar/contexto-ciclo.ts):
 *   npx tsc lib/escolar/contexto-ciclo.ts ^
 *     --outDir scripts/.tmp-reparar-tabla-legacy --module commonjs ^
 *     --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
 *   node scripts/test-reparar-tabla-legacy.mjs
 *
 * Cubre los 6 puntos de la VALIDACION del prompt:
 *  1. match 1:1 por identidad (grado|grupo|carrera) + materia_id;
 *  2. fila destino que YA tiene tabla_legacy -> ya_tiene, nunca se pisa;
 *  3. dos candidatos distintos -> ambiguo, no se elige ninguno;
 *  4. materia del destino sin equivalente en origen -> sin_origen;
 *  5. idempotencia: aplicar el plan dos veces -> 0 cambios la segunda;
 *  6. grupos que difieren solo por carrera no se confunden entre si.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".tmp-reparar-tabla-legacy",
);
const M = require(path.join(dir, "contexto-ciclo.js"));

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

function grupo(id, grado, grupo, carrera) {
  return { id, grado, nombre: grupo, carreraId: null, carreraClave: carrera };
}
function gm(id, grupoId, materiaId, tabla) {
  return { id, grupo_id: grupoId, materia_id: materiaId, tabla_legacy: tabla };
}
function estados(plan) {
  const res = {};
  for (const i of plan) res[i.estado] = (res[i.estado] ?? 0) + 1;
  return res;
}

console.log("1) Match 1:1 por identidad + materia_id");
{
  const plan = M.planRepararTablaLegacy(
    [gm("dg1-m1", "dg1", "m1", null)],
    [grupo("dg1", "3RO", "A", "MECATRONICA")],
    [gm("og1-m1", "og1", "m1", "3ROMECAMAT001")],
    [grupo("og1", "3RO", "A", "MECATRONICA")],
  );
  ok("exactamente un item", plan.length === 1, JSON.stringify(plan));
  ok("estado match", plan[0] && plan[0].estado === "match", JSON.stringify(plan));
  ok(
    "propone el valor del origen",
    plan[0] && plan[0].tablaLegacy === "3ROMECAMAT001",
    JSON.stringify(plan),
  );
}

console.log("2) Fila que YA tiene tabla_legacy -> ya_tiene, nunca se pisa");
{
  const plan = M.planRepararTablaLegacy(
    [gm("dg1-m1", "dg1", "m1", "YA_TIENE")],
    [grupo("dg1", "3RO", "A", "MECATRONICA")],
    [gm("og1-m1", "og1", "m1", "ORIGEN_DISTINTO")],
    [grupo("og1", "3RO", "A", "MECATRONICA")],
  );
  ok("un item ya_tiene", plan.length === 1 && plan[0].estado === "ya_tiene", JSON.stringify(plan));
  ok("no propone pisar", plan[0] && plan[0].tablaLegacy === null, JSON.stringify(plan));
}

console.log("3) Dos candidatos distintos -> ambiguo, no se elige ninguno");
{
  const plan = M.planRepararTablaLegacy(
    [gm("dg1-m1", "dg1", "m1", null)],
    [grupo("dg1", "3RO", "A", "MECATRONICA")],
    [
      gm("og1-m1a", "og1", "m1", "LEGACY_A"),
      gm("og1-m1b", "og1", "m1", "LEGACY_B"),
    ],
    [grupo("og1", "3RO", "A", "MECATRONICA")],
  );
  ok("un item ambiguo", plan.length === 1 && plan[0].estado === "ambiguo", JSON.stringify(plan));
  ok("no elige ninguno (sin valor)", plan[0] && plan[0].tablaLegacy === null, JSON.stringify(plan));
  ok("detalle menciona ambos candidatos", plan[0] && /LEGACY_A \| LEGACY_B/.test(plan[0].detalle ?? ""), JSON.stringify(plan));
}

console.log("4) Materia sin equivalente en origen -> sin_origen");
{
  const sinGrupo = M.planRepararTablaLegacy(
    [gm("dg5-m1", "dg5", "m1", null)],
    [grupo("dg5", "5TO", "A", "MECATRONICA")],
    [gm("og1-m1", "og1", "m1", "3ROMECAMAT001")],
    [grupo("og1", "3RO", "A", "MECATRONICA")],
  );
  ok("sin grupo equivalente -> sin_origen", sinGrupo[0] && sinGrupo[0].estado === "sin_origen", JSON.stringify(sinGrupo));
  const sinMateria = M.planRepararTablaLegacy(
    [gm("dg1-m9", "dg1", "m9", null)],
    [grupo("dg1", "3RO", "A", "MECATRONICA")],
    [gm("og1-m1", "og1", "m1", "3ROMECAMAT001")],
    [grupo("og1", "3RO", "A", "MECATRONICA")],
  );
  ok("sin materia en origen -> sin_origen", sinMateria[0] && sinMateria[0].estado === "sin_origen", JSON.stringify(sinMateria));
}

console.log("5) Idempotencia: aplicar el plan dos veces -> 0 cambios la segunda");
{
  const destino = [gm("dg1-m1", "dg1", "m1", null)];
  const gruposDestino = [grupo("dg1", "3RO", "A", "MECATRONICA")];
  const origen = [gm("og1-m1", "og1", "m1", "3ROMECAMAT001")];
  const gruposOrigen = [grupo("og1", "3RO", "A", "MECATRONICA")];
  const primero = M.planRepararTablaLegacy(destino, gruposDestino, origen, gruposOrigen);
  ok("primera pasada: 1 match", primero.length === 1 && primero[0].estado === "match", JSON.stringify(primero));
  destino[0].tabla_legacy = primero[0].tablaLegacy;
  const segunda = M.planRepararTablaLegacy(destino, gruposDestino, origen, gruposOrigen);
  const e = estados(segunda);
  ok("segunda pasada: 0 match", (e.match ?? 0) === 0, JSON.stringify(segunda));
  ok("segunda pasada: 1 ya_tiene", (e.ya_tiene ?? 0) === 1, JSON.stringify(segunda));
}

console.log("6) Grupos que difieren solo por carrera no se confunden");
{
  const gruposDestino = [
    grupo("dg-meca", "3RO", "A", "MECATRONICA"),
    grupo("dg-rh", "3RO", "A", "RH"),
  ];
  const gruposOrigen = [
    grupo("og-meca", "3RO", "A", "MECATRONICA"),
    grupo("og-rh", "3RO", "A", "RH"),
  ];
  const plan = M.planRepararTablaLegacy(
    [
      gm("dg-meca-m1", "dg-meca", "m1", null),
      gm("dg-rh-m1", "dg-rh", "m1", null),
    ],
    gruposDestino,
    [
      gm("og-meca-m1", "og-meca", "m1", "MECA_LEGACY"),
      gm("og-rh-m1", "og-rh", "m1", "RH_LEGACY"),
    ],
    gruposOrigen,
  );
  const meca = plan.find((i) => i.id === "dg-meca-m1");
  const rh = plan.find((i) => i.id === "dg-rh-m1");
  ok("MECATRONICA recibe su propio valor", meca && meca.estado === "match" && meca.tablaLegacy === "MECA_LEGACY", JSON.stringify(plan));
  ok("RH recibe su propio valor", rh && rh.estado === "match" && rh.tablaLegacy === "RH_LEGACY", JSON.stringify(plan));
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);

