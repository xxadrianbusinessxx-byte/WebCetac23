/**
 * test-asistencia-parciales.mjs - Pruebas PURAS del recorte POR PARCIAL de
 * asistencias (ciclo global + parciales), sin Supabase.
 *
 * Compilar (recompilar tras cambios en lib/escolar/asistencia-parcial.ts):
 *   npx tsc lib/escolar/asistencia-parcial.ts ^
 *     --outDir scripts/.tmp-asistencia-parciales --module commonjs ^
 *     --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
 *   node scripts/test-asistencia-parciales.mjs
 *
 * Cubre los 6 puntos de la seccion VALIDACION del prompt:
 *  1. filtrado de fechas de calendario al rango de un parcial (bordes inclusive);
 *  2. fecha justo fuera del parcial, excluida;
 *  3. fecha que no cae en ningun parcial, etiquetada null (sin_parcial), nunca
 *     asignada arbitrariamente;
 *  4. resumenAsistenciaPorParcial: pendientes fuera del denominador
 *     (18 asistio + 2 falta + 5 pendiente -> 90%);
 *  5. parciales solapados -> se reporta el conflicto, no se elige uno al azar;
 *  6. un parcial sin dias de clase -> resumen en cero, sin excepcion.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".tmp-asistencia-parciales",
);
const M = require(path.join(dir, "asistencia-parcial.js"));

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

function parcial(id, numero, nombre, inicio, fin, activo = true) {
  return { id, numero, nombre, fecha_inicio: inicio, fecha_fin: fin, activo };
}

function dia(fecha, tipo = "clase", estado = "pendiente") {
  return { fecha, tipo, estado };
}

const P1 = parcial("ev1", 1, "Parcial 1", "2026-08-31", "2026-09-25");
const P2 = parcial("ev2", 2, "Parcial 2", "2026-09-28", "2026-11-06");
const P3 = parcial("ev3", 3, "Parcial 3", "2026-11-02", "2026-12-11");

console.log("1) Filtrado de fechas al rango de un parcial (bordes inclusive)");
{
  const dias = [
    dia("2026-08-30"),
    dia("2026-08-31"),
    dia("2026-09-01"),
    dia("2026-09-25"),
    dia("2026-09-26"),
  ];
  const filtrados = M.filtrarDiasDeParcial(dias, P1).map((d) => d.fecha);
  ok("borde inferior (31 ago) incluido", filtrados.includes("2026-08-31"), JSON.stringify(filtrados));
  ok("borde superior (25 sep) incluido", filtrados.includes("2026-09-25"), JSON.stringify(filtrados));
  ok("fecha interior incluida", filtrados.includes("2026-09-01"), JSON.stringify(filtrados));
  ok("fecha justo fuera (26 sep) excluida", !filtrados.includes("2026-09-26"), JSON.stringify(filtrados));
  ok("fecha anterior al inicio excluida", !filtrados.includes("2026-08-30"), JSON.stringify(filtrados));
}

console.log("2) Fecha sin parcial: etiqueta null, nunca se asigna");
{
  const etiqueta = M.etiquetarFechaConParcial([P1, P2, P3], "2026-08-15");
  ok("fecha fuera de todo parcial: sin_parcial", etiqueta.caso === "sin_parcial", JSON.stringify(etiqueta));
  const conDias = M.etiquetarDiasConParcial(
    [{ fecha: "2026-08-15" }, { fecha: "2026-09-10" }, { fecha: "2026-12-20" }],
    [P1, P2, P3],
  );
  const asignados = conDias.filter((d) => d.etiqueta.caso === "en_parcial");
  const sin = conDias.filter((d) => d.etiqueta.caso === "sin_parcial");

}

console.log("3) resumenAsistenciaPorParcial: pendientes fuera del denominador");
{
  const dias = [];
  for (let i = 0; i < 18; i++) dias.push(dia("2026-10-05", "clase", "asistio"));
  for (let i = 0; i < 2; i++) dias.push(dia("2026-10-06", "clase", "falta"));
  for (let i = 0; i < 5; i++) dias.push(dia("2026-10-07", "clase", "pendiente"));
  dias.push(dia("2026-10-10", "festivo", "sin_clase"));
  dias.push(dia("2026-09-10", "clase", "falta"));
  const r = M.resumenAsistenciaPorParcial(dias, [P1, P2, P3]);
  const r2 = r.resumenes.find((x) => x.parcial.id === "ev2");
  ok("existe entrada del parcial 2", Boolean(r2), JSON.stringify(r));
  ok("parcial 2: 18 asistencias", r2 && r2.asistencias === 18, JSON.stringify(r2));
  ok("parcial 2: 2 faltas", r2 && r2.faltas === 2, JSON.stringify(r2));
  ok("parcial 2: 5 pendientes", r2 && r2.pendientes === 5, JSON.stringify(r2));
  ok("parcial 2: 1 sin clase", r2 && r2.sinClase === 1, JSON.stringify(r2));
  ok("parcial 2: 90% (pendientes fuera del denominador)", r2 && r2.porcentaje === 90, JSON.stringify(r2));
  const r1 = r.resumenes.find((x) => x.parcial.id === "ev1");
  ok("dias de otro parcial no contaminan el resumen", r1 && r1.faltas === 1 && r2 && r2.faltas === 2,
    "r1=" + JSON.stringify(r1) + " r2=" + JSON.stringify(r2));
}

console.log("4) Parciales solapados: conflicto reportado, no eleccion al azar");
{
  const evA = parcial("A", 1, "A SEP-NOV", "2026-09-28", "2026-11-06");
  const evB = parcial("B", 2, "B NOV-DIC", "2026-11-02", "2026-12-11");
  const fechaSolape = "2026-11-04";
  const etiqueta = M.etiquetarFechaConParcial([evA, evB], fechaSolape);
  ok("fecha en dos parciales: caso conflicto", etiqueta.caso === "conflicto", JSON.stringify(etiqueta));
  if (etiqueta.caso === "conflicto") {
    ok("el conflicto reporta AMBOS candidatos",
      etiqueta.parciales.length === 2 &&
        etiqueta.parciales.some((p) => p.id === "A") &&
        etiqueta.parciales.some((p) => p.id === "B"),
      JSON.stringify(etiqueta.parciales));
  }
  const res = M.resumenAsistenciaPorParcial(
    [dia("2026-11-04", "clase", "asistio"), dia("2026-10-10", "clase", "falta")],
    [evA, evB],
  );
  ok("resumen reporta el conflicto",
    res.conflictos.length === 1 && res.conflictos[0] && res.conflictos[0].fecha === "2026-11-04",
    JSON.stringify(res.conflictos));
  const totalAsistencias = res.resumenes.reduce((s, x) => s + x.asistencias + x.faltas, 0);
  ok("el dia conflictivo NO se cuenta en ningun parcial (no doble conteo)",
    totalAsistencias === 1,
    "total=" + totalAsistencias + " " + JSON.stringify(res.resumenes));
}

console.log("5) Parcial sin dias de clase: resumen en cero, sin excepcion");
{
  const res = M.resumenAsistenciaPorParcial([], [P1, P2, P3]);
  ok("los 3 parciales aparecen con ceros", res.resumenes.length === 3, JSON.stringify(res.resumenes));
  const todosCero = res.resumenes.every(
    (x) => x.asistencias === 0 && x.faltas === 0 && x.pendientes === 0 && x.sinClase === 0 && x.porcentaje === 0,
  );
  ok("todos los contadores en cero sin excepcion", todosCero, JSON.stringify(res.resumenes));
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);

