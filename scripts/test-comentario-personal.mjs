#!/usr/bin/env node
/**
 * test-comentario-personal.mjs — suite de la decisión PURA de quién escribe el
 * «Comentario personal» del alumno
 * (`lib/escolar/alumno/comentario-personal-puro.ts`, 2026-11-17).
 *
 * Qué protege. La nota del expediente la escriben el DIRECTIVO, ADMINISTRACIÓN
 * ESCOLAR y el TUTOR VINCULADO. Se decide con regla propia y no reutilizando
 * `puedeEditarDatosPersonales` porque esa capacidad la tiene también el
 * TÉCNICO: hoy queda fuera solo porque `resolverAccesoAlumno` no tiene rama
 * para su rol, es decir, por omisión. Esta suite convierte esa omisión en
 * regla, para que abrirle alcance al técnico mañana no le regale la escritura.
 *
 * Reglas verificadas:
 *   1. Escriben exactamente tres modos: directivo, administración y tutor.
 *   2. El ALUMNO no escribe su propia nota (la escuela la guarda sobre él).
 *   3. El MAESTRO no escribe: su comentario es el tablón firmado.
 *   4. La lista cerrada y la función no se pueden desincronizar.
 *   5. El texto se recorta; el VACÍO es válido (así se borra la nota).
 *   6. Pasarse del máximo se rechaza, y el mensaje dice cuánto lleva.
 *   7. Se mide la longitud YA recortada: espacios al final no agotan el límite.
 */
// Node carga el `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar.
const {
  MODOS_QUE_EDITAN_COMENTARIO_PERSONAL,
  puedeEditarComentarioPersonal,
  validarComentarioPersonal,
} = await import("../lib/escolar/alumno/comentario-personal-puro.ts");

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

seccion("quién escribe");
ok(puedeEditarComentarioPersonal("directivo") === true, "directivo escribe");
ok(puedeEditarComentarioPersonal("administracion") === true, "administración escolar escribe");
ok(puedeEditarComentarioPersonal("tutor") === true, "tutor vinculado escribe");

seccion("quién no");
ok(
  puedeEditarComentarioPersonal("alumno") === false,
  "el alumno NO escribe su propia nota (solo la lee)",
);
ok(
  puedeEditarComentarioPersonal("maestro") === false,
  "el maestro NO escribe: su comentario es el tablón firmado (alumno.comentar)",
);

seccion("la lista cerrada");
ok(
  MODOS_QUE_EDITAN_COMENTARIO_PERSONAL.length === 3,
  "son exactamente tres modos, no «todo el que edite datos personales»",
);
ok(
  ["directivo", "administracion", "tutor"].every((m) =>
    MODOS_QUE_EDITAN_COMENTARIO_PERSONAL.includes(m),
  ),
  "y son esos tres",
);
ok(
  ["alumno", "tutor", "directivo", "maestro", "administracion"].every(
    (m) => puedeEditarComentarioPersonal(m) === MODOS_QUE_EDITAN_COMENTARIO_PERSONAL.includes(m),
  ),
  "la función no se puede desincronizar de la lista",
);

seccion("el texto");
const recortado = validarComentarioPersonal("  nota con espacios  ", 200);
ok(recortado.ok && recortado.texto === "nota con espacios", "se recorta el espacio sobrante");
const vacio = validarComentarioPersonal("   ", 200);
ok(vacio.ok && vacio.texto === "", "el VACÍO es válido: así se borra la nota");
const largo = validarComentarioPersonal("x".repeat(201), 200);
ok(largo.ok === false, "pasarse del máximo se rechaza");
ok(
  largo.ok === false && largo.error.includes("201"),
  "y el mensaje dice cuánto lleva, no solo que sobra",
);
const justo = validarComentarioPersonal("x".repeat(200), 200);
ok(justo.ok === true, "el máximo exacto entra");
const limiteConEspacios = validarComentarioPersonal(`${"x".repeat(200)}     `, 200);
ok(
  limiteConEspacios.ok === true,
  "se mide lo YA recortado: los espacios del final no agotan el límite",
);

console.log("");
console.log(`${fallos === 0 ? "OK" : "FALLAN"} ${pasos - fallos}/${pasos}`);
process.exit(fallos === 0 ? 0 : 1);
