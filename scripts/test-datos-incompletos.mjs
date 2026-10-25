#!/usr/bin/env node
/**
 * test-datos-incompletos.mjs — suite de la decisión PURA de qué información
 * primordial le falta a un alumno (`lib/escolar/alumno/datos-incompletos-puro.ts`,
 * 2026-10-25).
 *
 * Reglas verificadas:
 *   1. Faltan: CURP ausente o mal formada, nombre o apellido paterno vacíos,
 *      número de control vacío. El apellido MATERNO no cuenta (el alta manual
 *      lo acepta vacío a propósito: hay alumnos que no lo tienen).
 *   2. Un alumno completo no aparece en la lista.
 *   3. El resumen cuenta por campo, y un alumno puede contar en varios.
 *   4. El mensaje es uno solo con las cifras dentro, y es `null` si no falta
 *      nada: una notificación vacía no se pinta.
 *   5. El filtro por campo devuelve solo a quien le falta ESE dato.
 */
// Node carga el `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar.
const {
  faltantesDeAlumno,
  filtrarPorCampo,
  mensajeDatosIncompletos,
  resumenDatosIncompletos,
} = await import("../lib/escolar/alumno/datos-incompletos-puro.ts");

let pasos = 0;
let fallos = 0;
function ok(cond, nombre) {
  pasos++;
  if (cond) console.log(`  OK ${nombre}`);
  else {
    fallos++;
    console.error(`  FALLA ${nombre}`);
  }
}
function seccion(t) {
  console.log(`\n${t}`);
}

const COMPLETO = {
  curp: "PELJ800101HDFRPR09",
  nombre: "JUAN",
  pApellido: "PEREZ",
  sApellido: "LOPEZ",
  numeroControl: "23222040230009",
};

seccion("qué le falta a un alumno");
ok(faltantesDeAlumno(COMPLETO).length === 0, "un alumno completo no tiene faltantes");
ok(
  faltantesDeAlumno({ ...COMPLETO, sApellido: null }).length === 0,
  "sin apellido materno sigue completo: el alta manual lo acepta vacío",
);
ok(
  faltantesDeAlumno({ ...COMPLETO, sApellido: "" }).length === 0,
  "y con el materno en cadena vacía, igual",
);
ok(faltantesDeAlumno({ ...COMPLETO, numeroControl: null }).includes("numero_control"), "sin número de control, falta");
ok(faltantesDeAlumno({ ...COMPLETO, numeroControl: "   " }).includes("numero_control"), "con espacios en blanco, también falta");
ok(faltantesDeAlumno({ ...COMPLETO, nombre: null }).includes("nombre"), "sin nombre de pila, falta el nombre");
ok(faltantesDeAlumno({ ...COMPLETO, pApellido: "" }).includes("nombre"), "sin apellido paterno, falta el nombre");
ok(faltantesDeAlumno({ ...COMPLETO, curp: "" }).includes("curp"), "sin CURP, falta la CURP");
ok(faltantesDeAlumno({ ...COMPLETO, curp: "PELJ800101HDFRPR" }).includes("curp"), "una CURP de 16 cuenta como faltante");
ok(faltantesDeAlumno({ ...COMPLETO, curp: "1234800101HDFRPR09" }).includes("curp"), "una CURP con dígitos al inicio, también");
ok(
  faltantesDeAlumno({ curp: "", nombre: "", pApellido: "", sApellido: "", numeroControl: "" }).length === 3,
  "un alumno vacío acumula los tres faltantes",
);

seccion("resumen");
{
  const lista = [
    { curp: "A", nombre: "Ana", grupo: "5TO A", faltantes: ["numero_control"] },
    { curp: "B", nombre: "Beto", grupo: null, faltantes: ["numero_control", "nombre"] },
    { curp: "C", nombre: "Caro", grupo: "3RO B", faltantes: ["curp"] },
  ];
  const r = resumenDatosIncompletos(454, lista);
  ok(r.revisados === 454, "el resumen conserva cuántos se revisaron");
  ok(r.incompletos === 3, "y cuántos están incompletos");
  ok(r.porCampo.numero_control === 2, "cuenta 2 sin número de control");
  ok(r.porCampo.nombre === 1 && r.porCampo.curp === 1, "y uno de cada uno de los otros dos");

  const m = mensajeDatosIncompletos(r);
  ok(typeof m === "string" && m.includes("3 de 454"), "el mensaje lleva las dos cifras");
  ok(m.includes("2 sin número de control"), "y el desglose por campo");

  seccion("filtro por campo");
  ok(filtrarPorCampo(lista, null).length === 3, "sin filtro salen todos");
  ok(filtrarPorCampo(lista, "numero_control").length === 2, "por número de control salen 2");
  ok(filtrarPorCampo(lista, "curp").length === 1, "por CURP sale 1");
  ok(filtrarPorCampo(lista, "nombre")[0].curp === "B", "por nombre sale el que lo tiene vacío");
}
{
  const r = resumenDatosIncompletos(454, []);
  ok(mensajeDatosIncompletos(r) === null, "sin incompletos no hay mensaje que pintar");
}

console.log(`\n${fallos === 0 ? "OK" : "FALLAN"} ${pasos - fallos}/${pasos}`);
process.exit(fallos === 0 ? 0 : 1);
