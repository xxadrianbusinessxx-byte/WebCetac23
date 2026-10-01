#!/usr/bin/env node
/**
 * test-calificaciones-puro.mjs — suite de `materia/calificaciones-puro.ts`.
 *
 * QUÉ MIDE: la conversión del Excel del profesor a filas normalizadas, y la
 *           lectura que ve el alumno.
 * QUÉ ESCRIBE: nada. Importa el fuente `.ts` directo; no toca la base.
 * CÓMO SE EJECUTA: node scripts/test-calificaciones-puro.mjs
 *
 * ── Por qué esta suite es la que decide ────────────────────────────────────
 * La Opción B de `docs/sistema/MIGRACION-MATERIAS-A-ID.md` cambia dónde viven
 * las calificaciones: de 241 tablas físicas a una tabla normalizada. El riesgo
 * no está en la tabla —es un CREATE TABLE— sino en la CONVERSIÓN: si una nota
 * acaba en el alumno equivocado, nadie lo nota hasta que alguien reclama.
 *
 * Por eso aquí se prueban sobre todo los casos que hacen daño en silencio:
 * celda vacía contra cero, CURP repetida, mapeo de otro archivo, y el filtro
 * por alumno.
 */
// Se importa el FUENTE `.ts` directo: Node 24 quita los tipos, y el único
// import del módulo es `import type`, que TypeScript borra. No se transpila a
// una carpeta temporal porque `eslint.config.mjs` retiró el ignore de
// `scripts/.tmp-*/**` el 2026-09-23 advirtiendo que necesitarlo otra vez
// significaría haber reintroducido un paso de compilación.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const M = await import("../lib/escolar/materia/calificaciones-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

/** Mapeo de ejemplo, con la forma real de `MapeoColumnasMateria`. */
const mapeo = (p = {}) => ({
  columnasNombreAlumno: ["alumno_nombre"],
  columnaCurp: "CURP",
  columnasActividades: ["Act 1", "Act 2"],
  columnasParciales: ["P1"],
  columnaPromedio: "Promedio",
  columnaFinal: "Final",
  columnasOcultas: [],
  pesosActividades: null,
  ...p,
});

/* ── 1) El módulo es puro ───────────────────────────────────────────────── */
console.log("\npureza");
const fuente = fs.readFileSync(path.join(root, "lib/escolar/materia/calificaciones-puro.ts"), "utf8");
ok("no importa supabase", !/from\s+["'][^"']*supabase/.test(fuente));
ok("no llama a createClient ni fetch", !/createClient\s*\(|\bfetch\s*\(/.test(fuente.replace(/\/\*[\s\S]*?\*\//g, "")));
// `match` con un patrón corto devuelve el TROZO, no la línea: hay que capturar
// la línea completa para poder comprobar que empieza por `import type`.
const lineasImport = (fuente.match(/^import .*$/gm) ?? []);
ok("hay exactamente un import", lineasImport.length === 1, lineasImport.join(" | "));
ok("y es de tipo, así que se borra al compilar", lineasImport.every((l) => l.startsWith("import type")), lineasImport.join(" | "));

/* ── 2) valorNota: el caso que hace daño en silencio ────────────────────── */
console.log("\nvalorNota — vacío NO es cero");
eq(M.valorNota("90"), 90, "lee un entero");
eq(M.valorNota("90.5"), 90.5, "lee un decimal con punto");
eq(M.valorNota("90,5"), 90.5, "lee coma decimal (Excel en español)");
eq(M.valorNota(77), 77, "acepta número ya tipado");
eq(M.valorNota("  88  "), 88, "recorta espacios");
// LA aserción de esta suite: una celda vacía es «no hay nota», no un cero.
// Confundirlas convierte una actividad no entregada en un cero que baja el
// promedio de un alumno que quizá la entregó en papel.
eq(M.valorNota(""), null, "celda vacía es null, NO cero");
eq(M.valorNota("   "), null, "solo espacios es null");
eq(M.valorNota(null), null, "null es null");
eq(M.valorNota(undefined), null, "undefined es null");
eq(M.valorNota("N/A"), null, "texto no numérico es null");
eq(M.valorNota("0"), 0, "pero un cero escrito SÍ es cero");
eq(M.valorNota(NaN), null, "NaN es null");
eq(M.valorNota(Infinity), null, "Infinity es null");

console.log("\nnotaEnRango");
ok("0 está en rango", M.notaEnRango(0));
ok("100 está en rango", M.notaEnRango(100));
ok("null está en rango (es ausencia)", M.notaEnRango(null));
ok("101 NO está en rango", !M.notaEnRango(101));
ok("-1 NO está en rango", !M.notaEnRango(-1));

console.log("\ncurpCanonica");
eq(M.curpCanonica(" abc123 "), "ABC123", "recorta y pasa a mayúsculas");
eq(M.curpCanonica(""), null, "vacía es null");
eq(M.curpCanonica(42), null, "un número no es CURP");

/* ── 3) El reparto de columnas ──────────────────────────────────────────── */
console.log("\ntipoDeColumna — lo decide el MAPEO, no este módulo");
eq(M.tipoDeColumna("Act 1", mapeo()), "actividad", "actividad");
eq(M.tipoDeColumna("P1", mapeo()), "parcial", "parcial");
eq(M.tipoDeColumna("Promedio", mapeo()), "promedio", "promedio");
eq(M.tipoDeColumna("Final", mapeo()), "final", "final");
eq(M.tipoDeColumna("alumno_nombre", mapeo()), null, "el nombre no es una nota");
eq(M.tipoDeColumna("Col rara", mapeo()), null, "una columna sin clasificar no produce nada");
// Las ocultas NO se normalizan: el mapeo dice que el alumno no las ve, y la
// tabla nueva es justo la que el alumno consulta.
eq(
  M.tipoDeColumna("Act 1", mapeo({ columnasOcultas: ["Act 1"] })),
  null,
  "una columna OCULTA no se normaliza, aunque sea actividad",
);

eq(
  M.columnasConvertibles(["alumno_nombre", "CURP", "Act 1", "P1", "Final"], mapeo()).map((c) => c.tipo),
  ["actividad", "parcial", "final"],
  "solo las clasificadas, en orden de aparición",
);

/* ── 4) convertirTabla: los tres fallos deliberados ─────────────────────── */
console.log("\nconvertirTabla — falla ENTERA cuando debe");
const tabla = (filas, enc = ["alumno_nombre", "CURP", "Act 1", "Act 2", "Final"]) => ({ encabezados: enc, filas });

let r = M.convertirTabla(tabla([["A", "CURP1", "90", "80", "85"]]), mapeo({ columnaCurp: null }));
ok("sin columna de CURP declarada: NO convierte", r.ok === false);
ok("…y lo explica", /CURP/.test(r.error ?? ""));

r = M.convertirTabla(tabla([["A", "CURP1", "90", "80", "85"]]), mapeo({ columnaCurp: "CURP_OTRA" }));
ok("si la CURP del mapeo no está en el archivo: NO convierte", r.ok === false);
ok("…y sugiere que el mapeo es de otro archivo", /otro archivo/.test(r.error ?? ""));

r = M.convertirTabla(tabla([["A", "CURP1", "90", "80", "85"]]), mapeo({
  columnasActividades: [], columnasParciales: [], columnaPromedio: null, columnaFinal: null,
}));
ok("sin ninguna columna clasificada: NO convierte", r.ok === false);

/* ── 5) convertirTabla: el camino feliz y los saltos ────────────────────── */
console.log("\nconvertirTabla — conversión");
r = M.convertirTabla(tabla([
  ["ALVAREZ DIEGO", "curp-uno", "90", "80", "85"],
  ["BENITEZ ANA", "CURP-DOS", "70", "", "75"],
]), mapeo());
ok("convierte", r.ok === true);
// 3 notas de la primera fila + 2 de la segunda (su Act 2 está vacía y no
// genera fila: guardar null por cada actividad sin entregar llenaría la tabla
// de nada).
eq(r.filas.length, 5, "una fila por nota con valor, no por celda");
eq(r.filas.filter((f) => f.curp === "CURP-UNO").length, 3, "la CURP se canoniza a mayúsculas");
eq(r.filas.find((f) => f.claveColumna === "Final").tipo, "final", "el tipo viaja con la fila");
eq(
  r.filas.find((f) => f.curp === "CURP-DOS" && f.claveColumna === "Act 2"),
  undefined,
  "la celda vacía NO produjo una fila con cero",
);
// `claveColumna` es la trazabilidad al archivo del profesor: sin ella no se
// puede explicar de dónde salió un número.
ok("conserva el encabezado real como clave", r.filas.every((f) => typeof f.claveColumna === "string" && f.claveColumna.length > 0));

console.log("\nconvertirTabla — filas que se SALTAN con aviso");
r = M.convertirTabla(tabla([
  ["ALVAREZ", "CURP1", "90", "80", "85"],
  ["TOTALES", "", "", "", ""],
  ["ALVAREZ OTRA VEZ", "CURP1", "50", "50", "50"],
]), mapeo());
ok("convierte aunque haya filas malas", r.ok === true);
eq(r.filas.filter((f) => f.curp === "CURP1").length, 3, "solo la PRIMERA aparición de la CURP");
ok("avisa de la fila sin CURP", r.avisos.some((a) => /sin CURP/.test(a)));
// Una CURP repetida no se resuelve callando: la segunda pisaría a la primera
// en el upsert y nadie sabría cuál quedó.
ok("avisa de la CURP repetida", r.avisos.some((a) => /ya apareció/.test(a)));
ok("avisa de una nota fuera de rango", M.convertirTabla(tabla([["A", "C1", "150", "", ""]]), mapeo()).avisos.some((a) => /fuera de 0-100/.test(a)));

/* ── 6) notasDeAlumno: el filtro que protege al alumno ──────────────────── */
console.log("\nnotasDeAlumno");
const todas = [
  { curp: "MIA", tipo: "actividad", clave_columna: "Act 1", valor: 90 },
  { curp: "MIA", tipo: "actividad", clave_columna: "Act 2", valor: 70 },
  { curp: "MIA", tipo: "final", clave_columna: "Final", valor: 85 },
  { curp: "AJENA", tipo: "actividad", clave_columna: "Act 1", valor: 10 },
  { curp: "AJENA", tipo: "final", clave_columna: "Final", valor: 20 },
];
const n = M.notasDeAlumno(todas, "MIA");
eq(n.actividades.length, 2, "dos actividades mías");
eq(n.final, 85, "mi final");
// La aserción que de verdad protege: nada de otro alumno se cuela.
ok("NO devuelve nada de otra CURP", JSON.stringify(n).indexOf("AJENA") === -1);
ok("ni su final", n.final !== 20);
eq(M.notasDeAlumno(todas, "NO-EXISTE").actividades.length, 0, "una CURP sin notas da listas vacías");
eq(M.notasDeAlumno([], "MIA").promedio, null, "sin datos, promedio null");

/* ── 7) promedioActividades ─────────────────────────────────────────────── */
console.log("\npromedioActividades");
const act = (clave, valor) => ({ curp: "MIA", tipo: "actividad", clave_columna: clave, valor });
eq(M.promedioActividades([act("A", 90), act("B", 70)], null), 80, "media simple sin pesos");
eq(M.promedioActividades([], null), null, "sin actividades, null");
eq(M.promedioActividades([act("A", null)], null), null, "solo nulos, null");
// Con pesos a medio configurar, se normaliza por lo declarado: no se castiga al
// alumno por lo que el profesor aún no ha puesto.
eq(M.promedioActividades([act("A", 90), act("B", 70)], { A: 50, B: 50 }), 80, "pesos iguales = media");
eq(M.promedioActividades([act("A", 100), act("B", 0)], { A: 80, B: 20 }), 80, "pondera de verdad");
eq(
  M.promedioActividades([act("A", 90), act("B", 50)], { A: 20 }),
  90,
  "solo cuentan las que tienen peso declarado",
);
eq(M.promedioActividades([act("A", 90)], { OTRA: 50 }), null, "si ningún peso aplica, null");
eq(M.promedioActividades([act("A", 85.555)], null), 85.56, "redondea a dos decimales");

/* ── 8) El tipo coincide con el check de la tabla ───────────────────────── */
console.log("\ncontrato con la base");
const sql = fs.readFileSync(path.join(root, "supabase/crear-calificaciones-normalizadas.sql"), "utf8");
for (const t of M.TIPOS_CALIFICACION) {
  ok(`«${t}» está en el check de la tabla`, sql.includes(`'${t}'`));
}
ok(
  "la tabla exige curp not null, como el módulo",
  /curp\s+text\s+not null/.test(sql),
);
ok(
  "la unicidad incluye clave_columna, que es lo que distingue dos notas del mismo tipo",
  /ux_calificaciones_identidad[\s\S]{0,200}clave_columna/.test(sql),
);

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
