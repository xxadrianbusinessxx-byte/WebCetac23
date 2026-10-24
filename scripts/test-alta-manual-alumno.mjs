#!/usr/bin/env node
/**
 * test-alta-manual-alumno.mjs — suite pura del alta manual de alumno (PROMPT W).
 *
 * QUÉ MIDE: `lib/escolar/alumno/alta-manual-alumno-puro.ts` — qué entrada es
 *           válida y cómo se normaliza (CURP, número de control obligatorio,
 *           nombres en mayúsculas conservando acentos, apellido materno
 *           opcional, grupo obligatorio), el rótulo y el orden de los grupos, y
 *           la traducción del choque de UNIQUE.
 * QUÉ ESCRIBE: nada. Carga el `.ts` directamente. No toca la base.
 * CÓMO SE EJECUTA: node scripts/test-alta-manual-alumno.mjs
 *
 * Las CURP de aquí son SINTÉTICAS: cumplen el formato, no son de nadie.
 */
const P = await import("../lib/escolar/alumno/alta-manual-alumno-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const CURP = "GOMA050101HDFRRNA1";
const base = {
  curp: CURP,
  numeroControl: "23222040230009",
  nombre: "Ana",
  pApellido: "Gómez",
  sApellido: "Martínez",
  grupoId: "g-1",
  crearTutor: false,
};
const validar = (cambios) => P.validarAltaManualAlumno({ ...base, ...cambios });
const error = (cambios) => {
  const r = validar(cambios);
  return r.ok ? null : r.error;
};

/* ── Entrada válida ────────────────────────────────────────────────────── */
console.log("\nentrada válida");
{
  const r = validar({});
  ok("la entrada base es válida", r.ok, JSON.stringify(r));
  if (r.ok) {
    eq(r.datos.nombre, "ANA", "nombre en mayúsculas");
    eq(r.datos.pApellido, "GÓMEZ", "conserva el acento al pasar a mayúsculas");
    eq(r.datos.sApellido, "MARTÍNEZ", "apellido materno en mayúsculas");
    eq(r.datos.crearTutor, false, "tutor desmarcado se respeta");
  }
}
{
  const r = validar({ curp: "  goma 050101hdfrrna1 ", numeroControl: "2322 2040 230009" });
  ok("CURP con minúsculas y espacios se normaliza", r.ok && r.datos.curp === CURP, JSON.stringify(r));
  ok("número de control dictado en grupos se normaliza", r.ok && r.datos.numeroControl === "23222040230009");
}
{
  const r = validar({ nombre: "  josé   maría  ", pApellido: "peña", sApellido: "" });
  ok("espacios internos colapsados", r.ok && r.datos.nombre === "JOSÉ MARÍA", JSON.stringify(r));
  ok("Ñ conservada", r.ok && r.datos.pApellido === "PEÑA");
  ok("apellido materno vacío → null (persona con un solo apellido)", r.ok && r.datos.sApellido === null);
}
{
  const r = validar({ sApellido: "   " });
  ok("apellido materno solo espacios → null", r.ok && r.datos.sApellido === null);
}
{
  const r = validar({ pApellido: "o'neil-de la cruz" });
  ok("apóstrofo, guion y espacios permitidos", r.ok && r.datos.pApellido === "O'NEIL-DE LA CRUZ", JSON.stringify(r));
}
{
  const r = validar({ crearTutor: true });
  ok("tutor marcado se respeta", r.ok && r.datos.crearTutor === true);
  const r2 = P.validarAltaManualAlumno({ ...base, crearTutor: "sí" });
  ok("crearTutor que no es true exacto → false", r2.ok && r2.datos.crearTutor === false);
}

/* ── CURP ──────────────────────────────────────────────────────────────── */
console.log("\nCURP");
eq(error({ curp: "" }), "Escribe la CURP del alumno.", "vacía");
ok("17 caracteres → dice cuántos", /escribiste 17/.test(error({ curp: CURP.slice(0, 17) }) ?? ""));
ok("19 caracteres → dice cuántos", /escribiste 19/.test(error({ curp: CURP + "X" }) ?? ""));
ok("18 caracteres con formato roto (dígito donde va letra)", /formato válido/.test(error({ curp: "G0MA050101HDFRRNA1" }) ?? ""));
ok("sexo distinto de H/M", /formato válido/.test(error({ curp: "GOMA050101ZDFRRNA1" }) ?? ""));

/* ── Número de control ─────────────────────────────────────────────────── */
console.log("\nnúmero de control");
eq(error({ numeroControl: "" }), "Escribe el número de control.", "vacío es error (no «quitarlo»)");
eq(error({ numeroControl: "   " }), "Escribe el número de control.", "solo espacios es error");
ok("con símbolos → error", /letras, números y guiones/.test(error({ numeroControl: "2322#2040" }) ?? ""));
ok("menos de 4 → error", /al menos 4/.test(error({ numeroControl: "123" }) ?? ""));
ok("más de 20 → error", /20 caracteres/.test(error({ numeroControl: "1".repeat(21) }) ?? ""));
ok("con guion → válido", validar({ numeroControl: "ab-1234" }).ok);

/* ── Nombres y grupo ───────────────────────────────────────────────────── */
console.log("\nnombres y grupo");
eq(error({ nombre: "  " }), "Escribe el nombre del alumno.", "nombre vacío");
eq(error({ pApellido: "" }), "Escribe el apellido paterno.", "apellido paterno vacío");
ok("nombre con dígitos → error", /solo lleva letras/.test(error({ nombre: "Ana2" }) ?? ""));
ok("apellido materno con dígitos → error", /apellido materno/.test(error({ sApellido: "M4rtínez" }) ?? ""));
ok("nombre de más de 60 → error", /60 caracteres/.test(error({ nombre: "A".repeat(61) }) ?? ""));
eq(error({ grupoId: " " }), "Elige el grado y grupo.", "grupo vacío");

/* ── Grupos: rótulo y orden ────────────────────────────────────────────── */
console.log("\ngrupos");
eq(P.etiquetaGrupoAlta({ grado: "2DO", grupo: "A", carreraClave: "PROG" }), "2DO A · PROG", "rótulo con carrera");
eq(P.etiquetaGrupoAlta({ grado: "1RO", grupo: "C", carreraClave: "" }), "1RO C", "rótulo sin carrera");
{
  const entrada = [
    { grado: "2DO", grupo: "A", carreraClave: "PROG" },
    { grado: "10MO", grupo: "A", carreraClave: "" },
    { grado: "1RO", grupo: "B", carreraClave: "" },
    { grado: "2DO", grupo: "A", carreraClave: "CONT" },
    { grado: "1RO", grupo: "A", carreraClave: "" },
  ];
  const orden = P.ordenarGruposAlta(entrada).map(P.etiquetaGrupoAlta);
  eq(orden, ["1RO A", "1RO B", "2DO A · CONT", "2DO A · PROG", "10MO A"], "por grado (numérico), grupo y carrera");
  eq(entrada[0].grado, "2DO", "no muta la lista original");
}

/* ── Choque de UNIQUE ──────────────────────────────────────────────────── */
console.log("\nUNIQUE");
eq(
  P.mensajeDuplicadoAlta('duplicate key value violates unique constraint "alumnos_numero_control_key"'),
  "Ese número de control ya lo tiene otro alumno.",
  "restricción del número de control",
);
eq(
  P.mensajeDuplicadoAlta('duplicate key value violates unique constraint "ALUMNOS_pkey"'),
  "Ya existe un alumno con esa CURP.",
  "cualquier otra → CURP",
);

console.log(`\n${pasadas} ok · ${fallos} fallos`);
if (fallos > 0) process.exit(1);
