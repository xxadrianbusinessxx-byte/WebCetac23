#!/usr/bin/env node
/**
 * test-tutores-borrado.mjs — suite de la decisión PURA de administrar el roster
 * de tutores (`lib/escolar/tutores/tutores-borrado-puro.ts`, 2026-10-25).
 *
 * Reglas verificadas:
 *   1. Normalizar: espacios colapsados, mayúsculas donde toca, correo en
 *      minúsculas, teléfono sin separadores, vacío → null.
 *   2. Validar: los cinco campos son opcionales, pero lo que se escribe tiene
 *      forma (CURP de 18, teléfono de 10 dígitos, correo con arroba y punto).
 *   3. Quitar tutor: avisa si la cuenta se queda huérfana, si quedan hermanos
 *      y si el tutor ya entró. Nunca bloquea.
 *   4. Vaciar roster: bloquea solo si ya está vacío, y la confirmación escrita
 *      lleva dentro el número de tutores previsualizado.
 */
// Node carga el `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar.
const {
  avisosQuitarTutor,
  bloqueosBorrarRosterTutores,
  confirmacionRosterCorrecta,
  confirmacionRosterEsperada,
  normalizarDatosTutor,
  tutorQuedaHuerfano,
  validarDatosTutor,
} = await import("../lib/escolar/tutores/tutores-borrado-puro.ts");

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

const vacio = { nombre: "", apellidos: "", curp: "", telefono: "", correo: "" };

seccion("normalizar");
{
  const n = normalizarDatosTutor({
    nombre: "  maría   josé ",
    apellidos: " pérez lópez ",
    curp: " pelj800101mdfrpr09 ",
    telefono: " 442 123-45-67 ",
    correo: "  MARIA@Correo.MX ",
  });
  ok(n.nombre === "MARÍA JOSÉ", "el nombre colapsa espacios y sube a mayúsculas");
  ok(n.apellidos === "PÉREZ LÓPEZ", "los apellidos igual");
  ok(n.curp === "PELJ800101MDFRPR09", "la CURP queda sin espacios y en mayúsculas");
  ok(n.telefono === "4421234567", "el teléfono pierde espacios y guiones");
  ok(n.correo === "maria@correo.mx", "el correo baja a minúsculas");
}
{
  const n = normalizarDatosTutor(vacio);
  ok(
    n.nombre === null && n.apellidos === null && n.curp === null && n.telefono === null && n.correo === null,
    "un campo vacío se guarda como null, no como cadena vacía",
  );
}

seccion("validar");
ok(validarDatosTutor(vacio).ok === true, "los cinco campos son opcionales: todo vacío es válido");
ok(
  validarDatosTutor({ ...vacio, curp: "PELJ800101MDFRPR09" }).ok === true,
  "una CURP de 18 con formato correcto pasa",
);
ok(validarDatosTutor({ ...vacio, curp: "PELJ800101MDFRPR" }).ok === false, "una CURP de 16 se rechaza");
ok(validarDatosTutor({ ...vacio, curp: "1234800101MDFRPR09" }).ok === false, "una CURP que empieza con dígitos se rechaza");
ok(validarDatosTutor({ ...vacio, telefono: "4421234567" }).ok === true, "un teléfono de 10 dígitos pasa");
ok(validarDatosTutor({ ...vacio, telefono: "44212345" }).ok === false, "un teléfono de 8 dígitos se rechaza");
ok(validarDatosTutor({ ...vacio, correo: "maria@correo.mx" }).ok === true, "un correo con arroba y punto pasa");
ok(validarDatosTutor({ ...vacio, correo: "maria@correo" }).ok === false, "un correo sin punto se rechaza");
ok(validarDatosTutor({ ...vacio, correo: "mariacorreo.mx" }).ok === false, "un correo sin arroba se rechaza");
ok(validarDatosTutor({ ...vacio, nombre: "A".repeat(121) }).ok === false, "un nombre de 121 caracteres se rechaza");
{
  const r = validarDatosTutor({ ...vacio, nombre: " ana ", telefono: "442 123 4567" });
  ok(r.ok === true && r.datos.nombre === "ANA" && r.datos.telefono === "4421234567", "lo válido vuelve ya normalizado");
}

seccion("quitar el tutor de un alumno");
{
  const sinTutor = { tieneTutor: false, alumnosDelTutor: 0, tutorYaEntro: false };
  ok(avisosQuitarTutor(sinTutor).length === 0, "un alumno sin tutor no genera avisos");
  ok(tutorQuedaHuerfano(sinTutor) === false, "y no deja ninguna cuenta huérfana");
}
{
  const unico = { tieneTutor: true, alumnosDelTutor: 1, tutorYaEntro: false };
  const avisos = avisosQuitarTutor(unico);
  ok(tutorQuedaHuerfano(unico) === true, "si es su único alumno, la cuenta queda huérfana");
  ok(avisos.some((a) => a.includes("único alumno")), "y el aviso lo dice");
  ok(avisos.length === 1, "sin avisos de más si el tutor nunca entró");
}
{
  const hermanos = { tieneTutor: true, alumnosDelTutor: 3, tutorYaEntro: false };
  const avisos = avisosQuitarTutor(hermanos);
  ok(tutorQuedaHuerfano(hermanos) === false, "con hermanos, la cuenta NO queda huérfana");
  ok(avisos.some((a) => a.includes("otros 2")), "el aviso cuenta los hermanos que la conservan");
}
{
  const entro = { tieneTutor: true, alumnosDelTutor: 2, tutorYaEntro: true };
  ok(
    avisosQuitarTutor(entro).some((a) => a.includes("contraseña inicial")),
    "si el tutor ya entró, se avisa de que la cuenta está en uso",
  );
}

seccion("vaciar el roster de tutores");
{
  const lleno = { tutoresActivos: 460, relacionesActivas: 458, alumnosConTutor: 458 };
  ok(bloqueosBorrarRosterTutores(lleno).length === 0, "un roster con tutores no bloquea");
  ok(confirmacionRosterEsperada(lleno) === "BORRAR 460", "la confirmación lleva dentro el número de tutores");
  ok(confirmacionRosterCorrecta(lleno, "BORRAR 460") === true, "la confirmación exacta vale");
  ok(confirmacionRosterCorrecta(lleno, "  borrar 460 ") === true, "y tolera espacios y minúsculas");
  ok(confirmacionRosterCorrecta(lleno, "BORRAR 459") === false, "una cifra distinta NO vale: la foto cambió");
  ok(confirmacionRosterCorrecta(lleno, "BORRAR") === false, "sin la cifra tampoco");
}
{
  const vacioRoster = { tutoresActivos: 0, relacionesActivas: 0, alumnosConTutor: 0 };
  ok(bloqueosBorrarRosterTutores(vacioRoster).length === 1, "un roster ya vacío bloquea");
}
{
  const soloRelaciones = { tutoresActivos: 0, relacionesActivas: 4, alumnosConTutor: 4 };
  ok(
    bloqueosBorrarRosterTutores(soloRelaciones).length === 0,
    "si quedan vínculos activos sin cuenta activa, se puede limpiar",
  );
}

console.log(`\n${fallos === 0 ? "OK" : "FALLAN"} ${pasos - fallos}/${pasos}`);
process.exit(fallos === 0 ? 0 : 1);
