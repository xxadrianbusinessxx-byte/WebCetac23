/**
 * test-asistencia-marcador.mjs - Pruebas PURAS del PROMPT S (Parte A), sin
 * Supabase:
 *
 *   A1 · marcador MATERIA (falta / distinto / válido);
 *   A5 · elección de la fila a anular (con materia / una fila / varias filas).
 *
 * Ejecutar (Node carga los .ts de lib/ directamente):
 *   node scripts/test-asistencia-marcador.mjs
 */

const M = await import("../lib/escolar/asistencia/asistencia-marcador.ts");

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log("  OK " + nombre);
  } else {
    fallidas++;
    console.error("  FALLA " + nombre + (detalle ? " — " + detalle : ""));
  }
}

const GM_MAT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GM_FIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// A1 · marcador MATERIA
// ---------------------------------------------------------------------------
const filasConMarcador = [
  ["CLASES", "Profe", "2", "0"],
  ["MATERIA", "Matemáticas", GM_MAT],
  ["ZAFA100523MVZPMMA6", "Alumno Demo", "2", ""],
];

console.log("1) Marcador MATERIA presente y válido");
{
  const marcador = M.extraerMarcadorMateria(filasConMarcador, 0, 1);
  ok("extrae el marcador", marcador !== null);
  ok(
    "extrae el grupoMateriaId",
    marcador && marcador.grupoMateriaId === GM_MAT,
  );
  ok(
    "extrae el nombre visible",
    marcador && marcador.nombreVisible === "Matemáticas",
  );
  const r = M.validarMarcadorMateria(marcador, {
    grupoMateriaId: GM_MAT,
    nombreVisible: "Matemáticas",
  });
  ok("marcador válido => ok", r.ok === true);
}

console.log("2) Marcador MATERIA ausente => plantilla de versión anterior");
{
  const filas = [["CLASES", "Profe", "2", "0"]];
  const marcador = M.extraerMarcadorMateria(filas, 0, 1);
  ok("sin marcador => null", marcador === null);
  const r = M.validarMarcadorMateria(marcador, {
    grupoMateriaId: GM_MAT,
    nombreVisible: "Matemáticas",
  });
  ok("rechazada sin marcador", r.ok === false);
  ok(
    "mensaje de versión anterior",
    !r.ok && /versión anterior/.test(r.error),
  );
}

console.log("3) Marcador MATERIA con uuid distinto => archivo de otra materia");
{
  const filas = [["MATERIA", "Física", GM_FIS]];
  const marcador = M.extraerMarcadorMateria(filas, 0, 1);
  const r = M.validarMarcadorMateria(marcador, {
    grupoMateriaId: GM_MAT,
    nombreVisible: "Matemáticas",
  });
  ok("rechazada por uuid distinto", r.ok === false);
  ok(
    "mensaje con ambos nombres visibles",
    !r.ok && r.error.includes("Física") && r.error.includes("Matemáticas"),
  );
}

// ---------------------------------------------------------------------------
// A5 · elección de la fila a anular
// ---------------------------------------------------------------------------
const filaMat = { id: "1", clases_asistidas: 2, grupo_materia_id: GM_MAT };
const filaFis = { id: "2", clases_asistidas: 1, grupo_materia_id: GM_FIS };

console.log("4) Anular con materia => solo esa fila");
{
  const r = M.elegirFilaParaAnular([filaMat, filaFis], GM_FIS);
  ok("elige la fila de la materia pedida", r.ok === true && r.fila.id === "2");
}

console.log("5) Anular sin materia y UNA sola fila => esa fila");
{
  const r = M.elegirFilaParaAnular([filaMat], null);
  ok("elige la única fila", r.ok === true && r.fila.id === "1");
}

console.log("6) Anular sin materia y VARIAS filas => pide la materia");
{
  const r = M.elegirFilaParaAnular([filaMat, filaFis], null);
  ok("rechazada por ambigüedad", r.ok === false);
  ok(
    "mensaje pide indicar la materia",
    !r.ok && /indica la materia/i.test(r.error),
  );
}

console.log("7) Anular con materia no registrada => error");
{
  const r = M.elegirFilaParaAnular([filaMat], GM_FIS);
  ok("rechazada por materia ausente", r.ok === false);
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);
