#!/usr/bin/env node
/**
 * test-documentos-permisos.mjs — suite pura de
 * `lib/escolar/documentos-permisos-puro.ts`.
 *
 * QUÉ MIDE: los tres predicados de nivel, la jerarquía y las migas de pan.
 * QUÉ ESCRIBE: nada. Transpila el módulo a `.tmp-documentos/` y lo compara.
 * CÓMO SE EJECUTA: node scripts/test-documentos-permisos.mjs
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * `puedeVer`, `puedeSubir` y `puedeEliminar` deciden qué controles ve el
 * usuario en Documentos, y hasta el 2026-09-17 NINGÚN test las cubría: vivían
 * dentro de `documentos.ts`, entre 14 funciones que hablan con Supabase, y un
 * módulo que necesita una base para cargarse no se puede probar.
 *
 * `puedeSubir` son cuatro líneas y un `||`. Invertirlo enseña un botón de subir
 * a quien solo puede ver — un control que el servidor rechaza, que es lo que la
 * regla 4 del PROMPT-3 prohíbe. Esta suite es la red que faltaba debajo.
 *
 * Las pruebas se escribieron contra el comportamiento ACTUAL, no contra el
 * deseable: fijan lo que hay para que un refactor no lo mueva sin querer.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const tmp = path.join(__dirname, ".tmp-documentos");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

// `tables.ts` entra porque el módulo importa de él el tipo NivelPermiso. No
// hace I/O: es constantes y tipos.
for (const [src, out] of [
  ["lib/escolar/tables.ts", "tables.js"],
  ["lib/escolar/documentos-permisos-puro.ts", "documentos-permisos-puro.js"],
]) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, src), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  fs.writeFileSync(path.join(tmp, out), outputText, "utf8");
}

const M = require(path.join(tmp, "documentos-permisos-puro.js"));
const { NIVELES_PERMISO } = require(path.join(tmp, "tables.js"));

let fallos = 0;
let pasadas = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// ── 1) El módulo es PURO ───────────────────────────────────────────────────
console.log("\npureza");
const fuente = fs.readFileSync(path.join(root, "lib/escolar/documentos-permisos-puro.ts"), "utf8");
ok("no importa supabase", !/from\s+["'][^"']*supabase/.test(fuente));
ok("no importa node:fs", !/node:fs/.test(fuente));
ok("no llama a createClient", !/createClient\s*\(/.test(fuente));
ok("importa por ruta relativa, no «@/»", !/from\s+["']@\//.test(fuente));

// ── 2) La tabla COMPLETA de niveles ────────────────────────────────────────
// Los cuatro valores posibles, `null` incluido. `null` es el que decide si
// alguien SIN permiso ve la carpeta: es el caso que más importa y el que un
// «test feliz» se salta.
console.log("\npredicados de nivel — la tabla completa");
const TABLA = [
  //  nivel        ver     subir   eliminar
  [null, false, false, false],
  ["ver", true, false, false],
  ["subir", true, true, false],
  ["eliminar", true, true, true],
];
for (const [nivel, ver, subir, eliminar] of TABLA) {
  const n = nivel === null ? "null" : `"${nivel}"`;
  ok(`puedeVer(${n}) === ${ver}`, M.puedeVer(nivel) === ver);
  ok(`puedeSubir(${n}) === ${subir}`, M.puedeSubir(nivel) === subir);
  ok(`puedeEliminar(${n}) === ${eliminar}`, M.puedeEliminar(nivel) === eliminar);
}

// Sin permiso NO se ve nada. Es la aserción que separa «no tiene acceso» de
// «tiene el acceso más bajo», y confundirlas abre la carpeta a cualquiera.
ok("sin nivel no se puede nada", !M.puedeVer(null) && !M.puedeSubir(null) && !M.puedeEliminar(null));

// ── 3) La jerarquía: eliminar ⊃ subir ⊃ ver ────────────────────────────────
// Si alguien invierte un `||` o reordena ORDEN_NIVEL, la relación se rompe y
// sin esto no se enteraría nadie.
console.log("\njerarquía");
ok("eliminar implica subir", M.puedeEliminar("eliminar") && M.puedeSubir("eliminar"));
ok("subir implica ver", M.puedeSubir("subir") && M.puedeVer("subir"));
ok("ver NO implica subir", M.puedeVer("ver") && !M.puedeSubir("ver"));
ok("subir NO implica eliminar", M.puedeSubir("subir") && !M.puedeEliminar("subir"));

// La misma jerarquía, por el otro camino: nivelMayor.
eq(M.nivelMayor("ver", "subir"), "subir", "nivelMayor(ver, subir) = subir");
eq(M.nivelMayor("eliminar", "ver"), "eliminar", "nivelMayor(eliminar, ver) = eliminar");
eq(M.nivelMayor("subir", "subir"), "subir", "nivelMayor es idempotente");
for (const a of NIVELES_PERMISO) {
  for (const b of NIVELES_PERMISO) {
    ok(`nivelMayor(${a}, ${b}) es conmutativo`, M.nivelMayor(a, b) === M.nivelMayor(b, a));
  }
}

// Los tres predicados cubren los NIVELES_PERMISO declarados: si mañana se añade
// un cuarto nivel a `tables.ts`, esta prueba avisa de que hay que decidirlo.
ok(
  `los ${NIVELES_PERMISO.length} niveles declarados son visibles`,
  NIVELES_PERMISO.every((n) => M.puedeVer(n)),
  NIVELES_PERMISO.join(","),
);

// ── 4) rutaCarpeta — las migas de pan ──────────────────────────────────────
console.log("\nrutaCarpeta");
const c = (id, parent_id, nombre = id) => ({ id, nombre, parent_id, creado_por: null, created_at: null });
const ARBOL = [c("raiz", null), c("hijo", "raiz"), c("nieto", "hijo"), c("suelta", null)];
const ids = (r) => r.map((x) => x.id);

eq(ids(M.rutaCarpeta(ARBOL, null)), [], "sin carpeta la ruta está vacía");
eq(ids(M.rutaCarpeta(ARBOL, "raiz")), ["raiz"], "una raíz es su propia ruta");
eq(ids(M.rutaCarpeta(ARBOL, "hijo")), ["raiz", "hijo"], "un nivel");
eq(ids(M.rutaCarpeta(ARBOL, "nieto")), ["raiz", "hijo", "nieto"], "varios niveles, de raíz a hoja");
eq(ids(M.rutaCarpeta(ARBOL, "suelta")), ["suelta"], "una carpeta sin padre");
eq(ids(M.rutaCarpeta(ARBOL, "fantasma")), [], "una carpeta que no existe da ruta vacía");
eq(ids(M.rutaCarpeta([], "hijo")), [], "sin catálogo no hay ruta");

// COMPORTAMIENTO ACTUAL, fijado a propósito: si el padre no está en la lista,
// la ruta se corta y devuelve lo reconstruido. Una lista parcial es preferible
// a una excepción en pantalla; si algún día se decide otra cosa, que sea una
// decisión y no un descuido.
eq(
  ids(M.rutaCarpeta([c("nieto", "hijo"), c("hijo", "ausente")], "nieto")),
  ["hijo", "nieto"],
  "padre ausente: la ruta se corta y devuelve lo que pudo",
);

// ── HALLAZGO (2026-09-17) — NO SE PRUEBA AQUÍ, Y NO ES UN DESCUIDO ─────────
//
// `rutaCarpeta` entra en BUCLE INFINITO si `parent_id` forma un ciclo
// (a→b→a): la lista crece sin fin hasta agotar la memoria. Se descubrió al
// escribir esta suite, ejecutando exactamente esto:
//
//     M.rutaCarpeta([c("a", "b"), c("b", "a")], "a")   // nunca vuelve
//
// La prueba está DESACTIVADA a propósito: ejecutarla cuelga la suite y con
// ella el CI. Y la función NO se ha arreglado, también a propósito — el
// PROMPT B4 es un movimiento de código con su red de pruebas, y meter aquí un
// arreglo de comportamiento mezclaría dos cambios: si algo se rompiera
// después, no se sabría cuál de los dos fue.
//
// Qué haría falta: un `Set` de ids visitados, o un tope de profundidad. Va en
// su propio cambio, con su propia prueba, y entonces esta se reactiva.
//
// Riesgo real: BAJO pero no nulo. `parent_id` viene de la base y ahí nada
// impide el ciclo; hoy las carpetas las crea la UI, que no ofrece forma de
// crearlo. Un UPDATE a mano o una futura función de «mover carpeta» sí puede.

// No muta lo que recibe.
const copia = JSON.stringify(ARBOL);
M.rutaCarpeta(ARBOL, "nieto");
ok("no muta la lista de entrada", JSON.stringify(ARBOL) === copia);


console.log(`
Resultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
