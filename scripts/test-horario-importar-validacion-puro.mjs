#!/usr/bin/env node
/**
 * test-horario-importar-validacion-puro.mjs — suite pura de
 * `lib/escolar/horario/horario-importar-validacion-puro.ts`.
 *
 * QUÉ MIDE: validación dentro del archivo de horario (forma, duplicados,
 *           solapamientos), el conteo del detalle, las advertencias contra la
 *           hoja resumen, el alias de carrera y la detección del ciclo escolar.
 * QUÉ ESCRIBE: nada. Carga el `.ts` directamente. No toca la base ni la red.
 * CÓMO SE EJECUTA: node scripts/test-horario-importar-validacion-puro.mjs
 */
const V = await import("../lib/escolar/horario/horario-importar-validacion-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const fila = (over = {}) => ({
  filaOrigen: 1,
  carreraOriginal: "MC",
  gradoOriginal: "3",
  grupoOriginal: "A",
  gradoGrupoOriginal: "3A",
  dia: "lunes",
  horaInicio: "07:00",
  horaFin: "08:00",
  duracionDeclarada: 60,
  materia: "Matemáticas",
  materiaClave: "MATEMATICAS",
  profesor: "",
  tipoClase: "academica",
  errores: [],
  ...over,
});

/* ── Alias de carrera ──────────────────────────────────────────────────── */
console.log("\ncarrera");
eq(V.normalizarCarreraHorario("MC"), "MECATRONICA", "MC → MECATRONICA");
eq(V.normalizarCarreraHorario("Recursos Humanos"), "RH", "Recursos Humanos → RH");
eq(V.normalizarCarreraHorario("SIN CARRERA"), "", "sin carrera → vacío");
eq(V.normalizarCarreraHorario("MECATRONICA"), "MECATRONICA", "ya normalizado se conserva");
eq(V.normalizarCarreraHorario("algo"), "ALGO", "desconocido → normalizado");

/* ── Detección de ciclo ────────────────────────────────────────────────── */
console.log("\nciclo");
eq(V.detectarCicloEnFilasHorario([["CICLO 2026-2027"]]), "2026-2027", "guion");
eq(V.detectarCicloEnFilasHorario([["2026/2027"]]), "2026-2027", "barra");
eq(V.detectarCicloEnFilasHorario([["2026–2027"]]), "2026-2027", "guion largo");
eq(V.detectarCicloEnFilasHorario([["2026-2027"], ["2027-2028"]]), null, "dos ciclos → null");
eq(V.detectarCicloEnFilasHorario([["hola"]]), null, "sin ciclo → null");

/* ── Análisis de filas ─────────────────────────────────────────────────── */
console.log("\nanálisis de filas");
const una = V.analizarFilasHorario([fila({ filaOrigen: 1 })]);
eq([una.totalValidas, una.totalRechazadas], [1, 0], "una fila válida");
const conError = V.analizarFilasHorario([fila({ filaOrigen: 1, errores: ["Falta materia"] })]);
eq([conError.totalValidas, conError.totalRechazadas], [0, 1], "error de forma rechaza");
const dup = V.analizarFilasHorario([fila({ filaOrigen: 1 }), fila({ filaOrigen: 2 })]);
eq([dup.totalValidas, dup.totalRechazadas], [1, 1], "duplicado rechaza la segunda");
ok("duplicado lo dice", dup.erroresPorFila[0].errores.includes("Fila duplicada dentro del archivo"));
const solape = V.analizarFilasHorario([
  fila({ filaOrigen: 1, horaInicio: "07:00", horaFin: "08:00" }),
  fila({ filaOrigen: 2, horaInicio: "07:30", horaFin: "09:00" }),
]);
eq([solape.totalValidas, solape.totalRechazadas], [0, 2], "solape rechaza ambos");
const tocando = V.analizarFilasHorario([
  fila({ filaOrigen: 1, horaInicio: "07:00", horaFin: "08:00" }),
  fila({ filaOrigen: 2, horaInicio: "08:00", horaFin: "09:00" }),
]);
eq([tocando.totalValidas, tocando.totalRechazadas], [2, 0], "tocar (sin solape) es válido");

/* ── Conteo del detalle ────────────────────────────────────────────────── */
console.log("\nconteo del detalle");
const detalle = V.conteoDetallePorDia([
  fila({ filaOrigen: 1, dia: "lunes" }),
  fila({ filaOrigen: 2, dia: "lunes" }),
  fila({ filaOrigen: 3, dia: "martes" }),
]);
eq(detalle.get("3|A"), { lunes: 2, martes: 1 }, "conteo por día del grupo");

/* ── Advertencias resumen vs detalle ───────────────────────────────────── */
console.log("\nadvertencias resumen");
eq(V.advertenciasResumenVsDetalle(new Map(), ["Detalle"], []), [], "sin hoja resumen → sin avisos");
const hojaResumen = [
  ["", "", "GRADO", "GRUPO", "LUNES", "MARTES"],
  ["", "", "3", "A", "1", "1"],
];
const filasValidas = [
  fila({ filaOrigen: 1, dia: "lunes" }),
  fila({ filaOrigen: 2, dia: "lunes" }),
  fila({ filaOrigen: 3, dia: "martes" }),
];
const adv = V.advertenciasResumenVsDetalle(
  new Map([["Resumen Clases por Día", hojaResumen]]),
  ["Resumen Clases por Día"],
  filasValidas,
);
eq(adv.length, 1, "un aviso (el lunes difiere)");
ok("el aviso cita el detalle como fuente oficial", adv[0].includes("DETALLE"));

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
