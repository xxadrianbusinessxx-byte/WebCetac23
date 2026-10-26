#!/usr/bin/env node
/**
 * test-servicio-escolar.mjs — suite pura de lo que el rol Servicio Escolar
 * pone en pantalla: el padrón agrupado (`roster-ciclo-puro.ts`) y la forma de
 * las hojas que baja (`etiquetas-exportar-puro.ts`). 2026-10-25.
 *
 * La regla que más importa y que no es obvia: **el grupo NO identifica solo**.
 * En este plantel «3RO A» existe en MECATRÓNICA y en RH, y «5TO A» también.
 * Agrupar por grupo mezclaría dos listas distintas, así que la clave son los
 * TRES campos. Eso es lo primero que comprueba esta suite.
 *
 * Reglas verificadas:
 *   1. Agrupar: la clave son grado+grupo+carrera; dos grupos homónimos de
 *      carreras distintas no se mezclan; los alumnos salen por apellido y los
 *      grupos por grado, grupo y carrera.
 *   2. Contar: los «sin número de control» se cuentan por grupo y en total.
 *   3. Las hojas: identidad primero, cada hoja con sus columnas, sin las
 *      EMPTY1..6 de la tabla, y el hueco como celda vacía.
 *   4. La situación médica NO se cuela en la hoja de etiquetas.
 */
const {
  agruparRoster,
  claveDeGrupo,
  etiquetaDeGrupo,
  nombreDeFila,
  resumenRoster,
} = await import("../lib/escolar/alumno/roster-ciclo-puro.ts");
const {
  camposDeHoja,
  celdasConDato,
  encabezadosDeHoja,
  filaDeHoja,
  nombreArchivoHoja,
} = await import("../lib/escolar/alumno/etiquetas-exportar-puro.ts");

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

const alumno = (p, n, grado, grupo, carrera, nc = "") => ({
  curp: `${p}${n}`.toUpperCase().padEnd(18, "X").slice(0, 18),
  pApellido: p,
  sApellido: "LOPEZ",
  nombre: n,
  numeroControl: nc,
  grado,
  grupo,
  carrera,
});

seccion("agrupar el padrón");
{
  // El caso real del plantel: mismo grado y grupo, carreras distintas.
  const filas = [
    alumno("PEREZ", "JUAN", "3RO", "A", "MECATRONICA", "23222040230009"),
    alumno("ALVAREZ", "ANA", "3RO", "A", "RH"),
    alumno("ZUNIGA", "ZOE", "3RO", "A", "MECATRONICA"),
    alumno("BENITEZ", "BRUNO", "1RO", "A", ""),
  ];
  const grupos = agruparRoster(filas);
  ok(grupos.length === 3, "tres grupos: «3RO A» de dos carreras NO se mezcla con el otro");
  ok(
    grupos.filter((g) => g.grado === "3RO" && g.grupo === "A").length === 2,
    "los dos «3RO A» conviven como grupos distintos",
  );
  const mecatronica = grupos.find((g) => g.carrera === "MECATRONICA");
  ok(mecatronica.alumnos.length === 2, "cada uno se lleva a los suyos");
  ok(
    mecatronica.alumnos[0].pApellido === "PEREZ" && mecatronica.alumnos[1].pApellido === "ZUNIGA",
    "y dentro del grupo, por apellido",
  );
  ok(grupos[0].grado === "1RO", "los grupos salen ordenados por grado");
  ok(mecatronica.sinNumeroControl === 1, "cuenta los que no tienen número de control");

  const r = resumenRoster(grupos);
  ok(r.alumnos === 4 && r.grupos === 3, "el resumen cuenta alumnos y grupos");
  ok(r.sinNumeroControl === 3, "y los que faltan por capturar");
}

seccion("claves y rótulos");
ok(
  claveDeGrupo({ grado: "3RO", grupo: "A", carrera: "RH" }) !==
    claveDeGrupo({ grado: "3RO", grupo: "A", carrera: "MECATRONICA" }),
  "la clave distingue por carrera",
);
ok(
  etiquetaDeGrupo({ grado: "3RO", grupo: "A", carrera: "MECATRONICA" }) === "3RO A · MECATRONICA",
  "el rótulo lleva la carrera cuando la hay",
);
ok(etiquetaDeGrupo({ grado: "1RO", grupo: "A", carrera: "" }) === "1RO A", "y no la inventa cuando no la hay");
ok(
  nombreDeFila({ pApellido: "PEREZ", sApellido: "", nombre: "JUAN", curp: "X" }) === "PEREZ JUAN",
  "el nombre se arma sin dejar dobles espacios",
);
ok(
  nombreDeFila({ pApellido: "", sApellido: "", nombre: "", curp: "CURP1" }) === "CURP1",
  "y si no hay nombre, cae a la CURP en vez de quedar vacío",
);

seccion("las dos hojas que se bajan");
{
  const idEsperada = ["CURP", "ALUMNO", "NUMERO DE CONTROL", "GRADO", "GRUPO", "CARRERA"];
  for (const hoja of ["etiquetas", "medica"]) {
    const enc = encabezadosDeHoja(hoja);
    ok(
      JSON.stringify(enc.slice(0, 6)) === JSON.stringify(idEsperada),
      `${hoja}: la identidad va primero, en el mismo orden`,
    );
    ok(!enc.some((e) => /^EMPTY/.test(e)), `${hoja}: ninguna columna EMPTY de la tabla`);
  }

  const etiquetas = encabezadosDeHoja("etiquetas");
  const medica = encabezadosDeHoja("medica");
  ok(etiquetas.includes("CORREO") && etiquetas.includes("CELULAR"), "etiquetas lleva el contacto");
  ok(
    !etiquetas.includes("SALUD MENTAL") && !etiquetas.includes("TIPO DE SANGRE"),
    "y NO arrastra lo médico: se pide aparte",
  );
  ok(
    medica.includes("TIPO DE SANGRE") && medica.includes("ALERGIAS") && medica.includes("SALUD MENTAL"),
    "la hoja médica lleva lo suyo",
  );
  ok(!medica.includes("CORREO"), "y no repite el contacto");
  ok(camposDeHoja("medica").length === medica.length - 6, "los campos pedidos a la tabla son los de la hoja menos la identidad");
}

seccion("una fila de la hoja");
{
  const id = {
    curp: "PELJ800101HDFRPR09",
    alumno: "PEREZ LOPEZ JUAN",
    numeroControl: "",
    grado: "3RO",
    grupo: "A",
    carrera: "RH",
  };
  const conFicha = filaDeHoja("medica", id, { "TIPO DE SANGRE": " O+ ", ALERGIAS: null });
  ok(conFicha[0] === "PELJ800101HDFRPR09" && conFicha[1] === "PEREZ LOPEZ JUAN", "la identidad va completa");
  ok(conFicha[2] === "", "lo que falta de identidad queda en blanco, no en «—»");
  ok(conFicha[6] === "O+", "el valor guardado sale sin espacios");
  ok(conFicha[7] === "", "un null sale como celda vacía");

  const sinFicha = filaDeHoja("medica", id, null);
  ok(sinFicha.length === encabezadosDeHoja("medica").length, "sin ficha, la fila igual tiene todas sus celdas");
  ok(celdasConDato("medica", [sinFicha]) === 0, "y se reconoce como «sin ningún dato capturado»");
  ok(celdasConDato("medica", [conFicha]) === 1, "con un dato, cuenta uno");
}

seccion("nombre del archivo");
ok(nombreArchivoHoja("medica", "2026-2027") === "situacion-medica-2026-2027.xlsx", "lleva el ciclo dentro");
ok(nombreArchivoHoja("etiquetas", null) === "etiquetas-ciclo.xlsx", "y no se rompe sin ciclo");

console.log("");
console.log(`${fallos === 0 ? "OK" : "FALLAN"} ${pasos - fallos}/${pasos}`);
process.exit(fallos === 0 ? 0 : 1);
