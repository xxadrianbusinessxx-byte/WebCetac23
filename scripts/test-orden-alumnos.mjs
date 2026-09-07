/**
 * test-orden-alumnos.mjs — pruebas del orden alfabetico de alumnos.
 *
 * QUE PRUEBA: `lib/escolar/alumno/orden-alumnos.ts` (modulo puro). El estandar
 * escolar es apellido paterno A->Z; las descargas ordenaban por nombre completo,
 * que empieza por el nombre de pila.
 *
 * QUE ESCRIBE: nada. Solo lee del filesystem.
 *
 * Uso:
 *   npm run test:compilar   (una vez, o tras tocar el modulo)
 *   node scripts/test-orden-alumnos.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".tmp-orden-alumnos");
const M = require(path.join(dir, "alumno/orden-alumnos.js"));

let pasadas = 0;
let fallidas = 0;
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`ok  ${titulo}`);
  } else {
    fallidas++;
    console.log(`FALLA  ${titulo}${detalle ? ` -> ${detalle}` : ""}`);
  }
}

const A = (P_APELLIDO, S_APELLIDO, NOMBRE) => ({ P_APELLIDO, S_APELLIDO, NOMBRE });

// --- clave de orden -------------------------------------------------------
ok(
  "la clave es PATERNO|MATERNO|NOMBRE",
  M.claveOrdenAlumno(A("Ramirez", "Soto", "Ana")) === "RAMIREZ|SOTO|ANA",
  M.claveOrdenAlumno(A("Ramirez", "Soto", "Ana")),
);
ok(
  "quita acentos: PEÑA y PENA ordenan juntos",
  M.claveOrdenAlumno(A("Peña", "", "Luis")) === M.claveOrdenAlumno(A("Pena", "", "Luis")),
);
ok(
  "tolera campos ausentes",
  M.claveOrdenAlumno({}) === "||",
  M.claveOrdenAlumno({}),
);

// --- el fallo que motivo el modulo ----------------------------------------
const lista = [
  A("Zamora", "Diaz", "Ana"),
  A("Alvarez", "Ruiz", "Zoe"),
  A("Mendez", "Lara", "Beto"),
];
const ordenada = M.ordenarAlumnosPorApellido(lista);
ok(
  "ordena por apellido paterno, no por nombre de pila",
  ordenada.map((a) => a.P_APELLIDO).join(",") === "Alvarez,Mendez,Zamora",
  ordenada.map((a) => a.P_APELLIDO).join(","),
);
ok(
  "no muta la lista recibida",
  lista[0].P_APELLIDO === "Zamora",
);

// --- desempates -----------------------------------------------------------
const mismos = M.ordenarAlumnosPorApellido([
  A("Lopez", "Vega", "Beto"),
  A("Lopez", "Ruiz", "Ana"),
  A("Lopez", "Ruiz", "Ana"),
]);
ok(
  "mismo paterno: desempata por materno",
  mismos[0].S_APELLIDO === "Ruiz" && mismos[2].S_APELLIDO === "Vega",
  mismos.map((a) => a.S_APELLIDO).join(","),
);
const nombres = M.ordenarAlumnosPorApellido([
  A("Cruz", "Cruz", "Zoe"),
  A("Cruz", "Cruz", "Ana"),
]);
ok(
  "mismo paterno y materno: desempata por nombre",
  nombres[0].NOMBRE === "Ana",
  nombres.map((a) => a.NOMBRE).join(","),
);

// --- datos incompletos ----------------------------------------------------
const conVacios = M.ordenarAlumnosPorApellido([
  A("", "", "Sin Apellido"),
  A("Barrera", "Lima", "Ivan"),
]);
ok(
  "sin apellido paterno va al final (dato incompleto visible)",
  conVacios[1].NOMBRE === "Sin Apellido",
  conVacios.map((a) => a.NOMBRE).join(","),
);

// --- comparador por clave ya calculada (el que usan las plantillas) -------
const porClave = [
  { curp: "C3", claveOrden: "ZAMORA|DIAZ|ANA" },
  { curp: "C1", claveOrden: "ALVAREZ|RUIZ|ZOE" },
  { curp: "C2", claveOrden: "|" + "|SIN APELLIDO" },
].sort(M.compararPorClaveOrden);
ok(
  "compararPorClaveOrden ordena igual y deja los incompletos al final",
  porClave.map((x) => x.curp).join(",") === "C1,C3,C2",
  porClave.map((x) => x.curp).join(","),
);

console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas > 0 ? 1 : 0);
