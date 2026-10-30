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
 *   6. (PROMPT AB) La marca «Pendiente de administración» mete en la revisión a
 *      quien no tiene grupo; le falta el grupo, y se lista mientras la marca
 *      exista aunque ya esté completo («por confirmar»). Nadie cuenta dos veces.
 */
// Node carga el `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar.
const {
  TITULO_ETIQUETA_PENDIENTE,
  curpsARevisar,
  debeListarse,
  esEtiquetaPendiente,
  faltantesDeAlumno,
  filtrarPorCampo,
  mensajeDatosIncompletos,
  notasDePendientes,
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

seccion("PROMPT AB — marcados como pendientes de administración");
ok(esEtiquetaPendiente(TITULO_ETIQUETA_PENDIENTE), "el título de la constante es la marca");
ok(esEtiquetaPendiente("  PENDIENTE   de  Administración "), "sin distinguir mayúsculas ni espacios de más");
ok(!esEtiquetaPendiente("Pendiente"), "un título parecido no es la marca");
ok(!esEtiquetaPendiente(null), "ni un título vacío");
ok(
  faltantesDeAlumno({ ...COMPLETO, tieneGrupo: false }).join() === "grupo",
  "sin inscripción en el ciclo operativo, falta el grupo",
);
ok(
  faltantesDeAlumno({ ...COMPLETO, tieneGrupo: true }).length === 0 &&
    !faltantesDeAlumno({ ...COMPLETO, numeroControl: null }).includes("grupo"),
  "un inscrito (o la fila del roster, sin el campo) no pierde el grupo",
);
{
  const notas = notasDePendientes([
    { curp: "nuevo1", titulo: "Pendiente de administración", valor: "Excel: 1er semestre" },
    { curp: "CONF1", titulo: "pendiente de administración ", valor: "Confirmar grupo" },
    { curp: "CONF1", titulo: "Pendiente de administración", valor: "Y su número" },
    { curp: "SINVALOR", titulo: "Pendiente de administración", valor: null },
    { curp: "OTRO", titulo: "Domicilio", valor: "Calle 1" },
  ]);
  ok(notas.get("NUEVO1") === "Excel: 1er semestre", "la nota es el valor de la etiqueta, con la CURP en mayúsculas");
  ok(notas.get("CONF1") === "Confirmar grupo · Y su número", "dos marcas del mismo alumno juntan sus notas");
  ok(notas.get("SINVALOR") === "", "una marca sin valor deja al alumno marcado, con nota vacía");
  ok(!notas.has("OTRO"), "otra etiqueta no marca a nadie");

  const curps = curpsARevisar(["CONF1", "INSCRITO"], notas.keys());
  ok(curps.length === 4, "roster + marcados: cada CURP una sola vez (CONF1 está en las dos fuentes)");
  ok(curps[0] === "CONF1" && curps[1] === "INSCRITO", "el roster va primero");
}
ok(!debeListarse([], null), "un inscrito sin marca y completo no sale");
ok(debeListarse([], "Confirmar grupo"), "una marcada completa sí sale: la marca manda hasta que se quita");
ok(debeListarse(["grupo"], null), "a quien le falta algo, sale");
{
  const lista = [
    { curp: "N", nombre: "Nuevo", grupo: null, faltantes: ["grupo", "numero_control"], nota: "Excel: 1er semestre" },
    { curp: "C", nombre: "Conf", grupo: "2DO A", faltantes: [], nota: "Confirmar grupo" },
    { curp: "I", nombre: "Inscrito", grupo: "5TO A", faltantes: ["numero_control"], nota: null },
  ];
  const r = resumenDatosIncompletos(367, lista);
  ok(r.incompletos === 2 && r.porConfirmar === 1, "la marcada completa cuenta como por confirmar, no como incompleta");
  ok(r.porCampo.grupo === 1 && r.porCampo.numero_control === 2, "y el grupo se cuenta como un campo más");
  const m = mensajeDatosIncompletos(r);
  ok(m.includes("1 sin grupo, grado y carrera") && m.includes("1 alumno marcado por confirmar"), "el mensaje dice las dos cosas");
  ok(filtrarPorCampo(lista, "grupo").map((a) => a.curp).join() === "N", "el filtro por grupo deja solo al que no tiene");
  ok(
    mensajeDatosIncompletos(resumenDatosIncompletos(10, [lista[1]])) === "1 alumno marcado por confirmar.",
    "con solo marcados completos, el mensaje no se calla",
  );
}

console.log(`\n${fallos === 0 ? "OK" : "FALLAN"} ${pasos - fallos}/${pasos}`);
process.exit(fallos === 0 ? 0 : 1);
