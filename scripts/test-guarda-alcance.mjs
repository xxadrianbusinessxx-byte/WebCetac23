#!/usr/bin/env node
/**
 * test-guarda-alcance.mjs — suite de la decisión PURA que impide que el rol
 * Servicio Escolar le quite una materia a su profesor
 * (`lib/escolar/asistencia/guarda-alcance-puro.ts`, 2026-11-16).
 *
 * Qué protege. Subir asistencia dispara `traspasar_materia_a_profesor`, que le
 * DA la materia a quien sube: desactiva la asignación de quien la tuviera y
 * mueve a su nombre las clases y asistencias ya registradas. Con la cuenta de
 * servicio social eso significaría quitárselas a los profesores, materia a
 * materia. Esta regla es lo único que lo impide, así que tiene suite propia.
 *
 * Reglas verificadas:
 *   1. Solo alcanza al rol Servicio Escolar: profesor y directivo nunca se
 *      bloquean, tenga la materia el dueño que tenga.
 *   2. Materia sin dueño → sube (no le quita nada a nadie).
 *   3. Materia con dueño distinto → se bloquea.
 *   4. Materia cuyo dueño ES la sesión → sube (re-subir lo propio es idempotente).
 *   5. Sesión sin `profesorId` (sesión vieja) con materia de otro → se bloquea.
 *   6. El mensaje dice qué hacer, no solo que no se puede.
 */
// Node carga el `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar.
const { ERROR_MATERIA_DE_OTRO_PROFESOR, bloqueaSubidaDeAsistencia } = await import(
  "../lib/escolar/asistencia/guarda-alcance-puro.ts"
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
  console.log("");
  console.log(t);
}

seccion("solo alcanza a Servicio Escolar");
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: false, profesorIdSesion: 7, duenoProfesorId: 19 }) === false,
  "un profesor sube aunque la materia sea de otro (el traspaso es su mecanismo)",
);
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: false, profesorIdSesion: null, duenoProfesorId: 19 }) === false,
  "y tampoco se bloquea por no traer profesorId",
);

seccion("Servicio Escolar");
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: true, profesorIdSesion: 23, duenoProfesorId: null }) === false,
  "materia sin dueño: sube, porque no le quita nada a nadie",
);
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: true, profesorIdSesion: 23, duenoProfesorId: 19 }) === true,
  "materia de otro profesor: se bloquea",
);
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: true, profesorIdSesion: 23, duenoProfesorId: 23 }) === false,
  "materia que ya es suya: re-subir lo propio es idempotente",
);
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: true, profesorIdSesion: null, duenoProfesorId: 19 }) === true,
  "sesión sin profesorId y materia de otro: se bloquea (ante la duda, no se quita)",
);
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: true, profesorIdSesion: undefined, duenoProfesorId: 19 }) === true,
  "…y undefined se trata igual que null",
);
ok(
  bloqueaSubidaDeAsistencia({ esServicioEscolar: true, profesorIdSesion: null, duenoProfesorId: null }) === false,
  "sin profesorId pero sin dueño: no hay nada que proteger",
);

seccion("el mensaje");
ok(typeof ERROR_MATERIA_DE_OTRO_PROFESOR === "string", "hay mensaje");
ok(
  ERROR_MATERIA_DE_OTRO_PROFESOR.includes("profesor"),
  "dice que la materia ya tiene profesor",
);
ok(
  /dirección|reasigne|pídele/i.test(ERROR_MATERIA_DE_OTRO_PROFESOR),
  "y dice QUÉ HACER, no solo que no se puede",
);

console.log("");
console.log(`${fallos === 0 ? "OK" : "FALLAN"} ${pasos - fallos}/${pasos}`);
process.exit(fallos === 0 ? 0 : 1);
