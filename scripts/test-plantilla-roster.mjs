#!/usr/bin/env node
/**
 * test-plantilla-roster.mjs — suite pura del viaje de ida y vuelta del roster
 * (`lib/escolar/alumno/plantilla-roster-puro.ts` + `materia/mapeo-columnas.ts`),
 * 2026-10-25.
 *
 * La regla que sostiene la función: **lo que se baja se tiene que poder subir
 * sin mapear nada a mano**. Si un encabezado de la plantilla dejara de ser un
 * alias reconocido, bajar-rellenar-subir seguiría «funcionando» pero obligaría
 * a asignar columnas una por una, que es la fricción que la plantilla quita.
 * Eso no lo ve `tsc` ni el build: lo ve esta suite.
 *
 * Reglas verificadas:
 *   1. Cada encabezado de la plantilla lo reconoce la carga, y lo manda al
 *      campo correcto.
 *   2. Detectar columnas sobre la plantilla entera no deja ningún campo sin
 *      asignar ni asigna dos campos a la misma columna.
 *   3. Los alias del número de control cubren cómo se escribe de verdad
 *      («No. control», «MATRÍCULA», «NUM_CONTROL»…).
 *   4. Una fila sale en el orden de los encabezados, con la CURP en mayúsculas
 *      y los huecos como celda vacía (rellenable), no como «—».
 *   5. Un mapeo guardado ANTES de que existiera el número de control sigue
 *      siendo válido: la carga vieja no se rompe.
 */
// Node carga los `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar.
const { ENCABEZADOS_PLANTILLA_ROSTER, filaPlantillaRoster } = await import(
  "../lib/escolar/alumno/plantilla-roster-puro.ts"
);
const { detectarCampoPorEncabezado, detectarColumnasRoster, mapeoRosterValido } = await import(
  "../lib/escolar/materia/mapeo-columnas.ts"
);

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

/** Encabezado de la plantilla → campo que la carga debe reconocer. */
const ESPERADO = {
  CURP: "curp",
  P_APELLIDO: "pApellido",
  S_APELLIDO: "sApellido",
  NOMBRE: "nombre",
  "NUMERO DE CONTROL": "numeroControl",
  GRADO: "grado",
  GRUPO: "grupo",
  CARRERA: "carrera",
};

seccion("lo que se baja, la carga lo reconoce");
for (const enc of ENCABEZADOS_PLANTILLA_ROSTER) {
  const d = detectarCampoPorEncabezado(enc);
  ok(d !== null && d.campo === ESPERADO[enc], `«${enc}» → ${ESPERADO[enc]}`);
}
ok(
  ENCABEZADOS_PLANTILLA_ROSTER.length === Object.keys(ESPERADO).length,
  "la plantilla no trae ningún encabezado sin comprobar",
);

seccion("detectar columnas sobre la plantilla entera");
{
  const m = detectarColumnasRoster([...ENCABEZADOS_PLANTILLA_ROSTER]);
  const campos = ["curp", "pApellido", "sApellido", "nombre", "numeroControl", "grado", "grupo", "carrera"];
  ok(
    campos.every((c) => m[c] >= 0),
    "ningún campo queda sin asignar: subir la plantilla no pide mapear nada",
  );
  const indices = campos.map((c) => m[c]);
  ok(new Set(indices).size === indices.length, "y dos campos nunca caen en la misma columna");
  ok(m.curp === 0, "la CURP es la primera columna");
  ok(m.numeroControl === 4, "el número de control es la quinta");
  ok(mapeoRosterValido(m, ENCABEZADOS_PLANTILLA_ROSTER.length), "el mapeo resultante es válido");
}

seccion("alias del número de control, como se escriben de verdad");
for (const enc of [
  "No. control",
  "NO CONTROL",
  "Número de control",
  "NUM_CONTROL",
  "num. control",
  "MATRÍCULA",
  "matricula",
]) {
  const d = detectarCampoPorEncabezado(enc);
  ok(d !== null && d.campo === "numeroControl", `«${enc}» se reconoce`);
}
ok(detectarCampoPorEncabezado("TELEFONO") === null, "una columna ajena no se confunde con ninguna");

seccion("una fila de la plantilla");
{
  const fila = filaPlantillaRoster({
    curp: " pelj800101hdfrpr09 ",
    pApellido: "PEREZ",
    sApellido: "LOPEZ",
    nombre: "JUAN",
    numeroControl: "",
    grado: "5TO",
    grupo: "A",
    carrera: "MECATRONICA",
  });
  ok(fila.length === ENCABEZADOS_PLANTILLA_ROSTER.length, "tiene tantas celdas como encabezados");
  ok(fila[0] === "PELJ800101HDFRPR09", "la CURP sale en mayúsculas y sin espacios");
  ok(fila[4] === "", "lo que falta sale como celda VACÍA, lista para rellenar");
  ok(fila[5] === "5TO" && fila[6] === "A" && fila[7] === "MECATRONICA", "grado, grupo y carrera, en su sitio");
}

seccion("compatibilidad con las cargas anteriores");
{
  // Un mapeo guardado antes del 2026-10-25: sin `numeroControl`.
  const viejo = { curp: 0, nombre: 3, pApellido: 1, sApellido: 2, grado: 4, grupo: 5, carrera: 6 };
  ok(mapeoRosterValido(viejo, 7) === true, "un mapeo sin número de control sigue siendo válido");
  const conNC = { ...viejo, numeroControl: -1 };
  ok(mapeoRosterValido(conNC, 7) === true, "y con el campo en -1 («no usar»), también");
  const choque = { ...viejo, numeroControl: 0 };
  ok(mapeoRosterValido(choque, 7) === false, "pero no si choca con la columna de otro campo");
}

console.log(`\n${fallos === 0 ? "OK" : "FALLAN"} ${pasos - fallos}/${pasos}`);
process.exit(fallos === 0 ? 0 : 1);
