#!/usr/bin/env node
/**
 * test-justificacion-circuito.mjs — suite pura del circuito padre → profesor /
 * directivo (2026-10-01).
 *
 * QUÉ MIDE: las decisiones puras del circuito, sobre el MISMO desglose por
 *           materia que pinta el calendario (`resolverDiaMateria`):
 *           · el profesor justifica solo MATERIAS: si Matemáticas tuvo 3 clases
 *             ese día, se justifican esas 3 y las demás no;
 *           · el directivo justifica el día completo y todas sus materias;
 *           · qué materias ve cada profesor: la falta con dueño solo la ve su
 *             dueño; la que no tiene a quién atribuirse la ven todos;
 *           · cuándo hay algo que justificar y cómo se valida la selección.
 * QUÉ ESCRIBE: nada. Carga los `.ts` directamente. No toca la base ni la red.
 * CÓMO SE EJECUTA: node scripts/test-justificacion-circuito.mjs
 */
const D = await import("../lib/escolar/asistencia/asistencia-dia-materia.ts");
const J = await import("../lib/escolar/asistencia/justificaciones-puro.ts");

let pasadas = 0;
let fallidas = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) {
    pasadas++;
    console.log(`  ok  ${nombre}`);
  } else {
    fallidas++;
    console.error(`  FALLA ${nombre} ${detalle}`);
  }
}

const MAT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUI = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOMBRES = new Map([
  [MAT, "Matemáticas"],
  [FIS, "Física"],
  [QUI, "Química"],
]);
const PROF_MAT = 7;
const PROF_FIS = 9;

// Un día: Matemáticas 3 clases (faltó a las 3, la registró el profesor 7),
// Física 2 (asistió a 1, profesor 9), Química 1 (asistió, sin dueño).
const CLASES = [
  { grupo_materia_id: MAT, clases: 3 },
  { grupo_materia_id: FIS, clases: 2 },
  { grupo_materia_id: QUI, clases: 1 },
];
const ASIST = [
  { grupo_materia_id: MAT, clases_asistidas: 0, profesor_clave: null, profesor_id: PROF_MAT },
  { grupo_materia_id: FIS, clases_asistidas: 1, profesor_clave: null, profesor_id: PROF_FIS },
  { grupo_materia_id: QUI, clases_asistidas: 1, profesor_clave: null, profesor_id: null },
];
const dia = (justificacion) =>
  D.resolverDiaMateria("clase", CLASES, ASIST, NOMBRES, justificacion);
const linea = (r, gm) => r.materias.find((m) => m.grupoMateriaId === gm);

console.log("1) Sin justificar: 2 de 6 → rojo");
{
  const r = dia(undefined);
  ok("color rojo", r.color === "rojo", JSON.stringify(r));
  ok("dueño de Matemáticas = profesor 7", linea(r, MAT).profesorId === PROF_MAT);
  ok("Química sin dueño", linea(r, QUI).profesorId === null);
}

console.log("2) El profesor justifica Matemáticas: SOLO sus 3 clases");
{
  const just = D.justificacionesPorFecha([
    { fecha: "2026-10-05", grupo_materia_id: MAT, estado: "aprobada" },
  ]).get("2026-10-05");
  const r = dia(just);
  ok("Matemáticas: 3 clases justificadas", linea(r, MAT).clasesJustificadas === 3, JSON.stringify(linea(r, MAT)));
  ok("Física NO se justifica", linea(r, FIS).clasesJustificadas === 0, JSON.stringify(linea(r, FIS)));
  const t = D.totalesEnClases(r.materias);
  ok("total 5 de 6 (3 justificadas + 1 + 1)", t.asistidas === 5 && t.clases === 6, JSON.stringify(t));
  ok("el día queda naranja, no verde", r.color === "naranja", r.color);
  ok("la asistencia real NO se reescribe (0 de 3)", linea(r, MAT).asistidas === 0);
}

console.log("3) El directivo acepta: día completo y todas sus materias");
{
  const just = D.justificacionesPorFecha([
    { fecha: "2026-10-05", grupo_materia_id: null, estado: "aprobada" },
  ]).get("2026-10-05");
  const r = dia(just);
  ok("Matemáticas cubierta", linea(r, MAT).clasesJustificadas === 3);
  ok("Física cubierta (la clase que faltó)", linea(r, FIS).clasesJustificadas === 1);
  ok("Química completa: nada que cubrir", linea(r, QUI).clasesJustificadas === 0);
  ok("el día queda verde", r.color === "verde", r.color);
}

console.log("4) Pendientes y rechazadas no justifican nada");
{
  const mapa = D.justificacionesPorFecha([
    { fecha: "2026-10-05", grupo_materia_id: null, estado: "pendiente" },
    { fecha: "2026-10-05", grupo_materia_id: MAT, estado: "rechazada" },
  ]);
  ok("sin entrada para el día", !mapa.has("2026-10-05"));
}

console.log("5) Una materia PENDIENTE (sin celda) no gana clases justificadas");
{
  const r = D.resolverDiaMateria(
    "clase",
    [{ grupo_materia_id: MAT, clases: 2 }],
    [],
    NOMBRES,
    { diaCompleto: true, materias: new Set() },
  );
  ok("clasesJustificadas 0", linea(r, MAT).clasesJustificadas === 0, JSON.stringify(r));
  ok("el día sigue pendiente", r.color === "pendiente", r.color);
}

console.log("6) Qué ve cada profesor");
{
  const r = dia(undefined);
  const delSiete = J.materiasJustificablesPorProfesor(r.materias, PROF_MAT).map((m) => m.grupoMateriaId);
  const delNueve = J.materiasJustificablesPorProfesor(r.materias, PROF_FIS).map((m) => m.grupoMateriaId);
  const deOtro = J.materiasJustificablesPorProfesor(r.materias, 99).map((m) => m.grupoMateriaId);
  ok("el 7 ve Matemáticas (suya)", delSiete.includes(MAT));
  ok("el 7 NO ve Física (tiene dueño: el 9)", !delSiete.includes(FIS));
  ok("el 9 ve Física", delNueve.includes(FIS) && !delNueve.includes(MAT));
  ok("Química no aparece: no tiene falta", !deOtro.includes(QUI));
  ok("un profesor ajeno no ve faltas con dueño", deOtro.length === 0, JSON.stringify(deOtro));
}

console.log("7) Falta SIN dueño: la ven todos los profesores");
{
  const r = D.resolverDiaMateria(
    "clase",
    [{ grupo_materia_id: QUI, clases: 2 }],
    [{ grupo_materia_id: QUI, clases_asistidas: 0, profesor_clave: null, profesor_id: null }],
    NOMBRES,
  );
  ok("la ve el 7", J.materiasJustificablesPorProfesor(r.materias, PROF_MAT).length === 1);
  ok("la ve el 99", J.materiasJustificablesPorProfesor(r.materias, 99).length === 1);
}

console.log("8) Lo ya justificado no vuelve a ofrecerse");
{
  const r = dia({ diaCompleto: false, materias: new Set([MAT]) });
  ok("el 7 ya no ve Matemáticas", J.materiasJustificablesPorProfesor(r.materias, PROF_MAT).length === 0);
}

console.log("9) El registro anterior sin materia: solo el directivo (día completo)");
{
  const r = D.resolverDiaMateria(
    "clase",
    [{ grupo_materia_id: null, clases: 1 }],
    [{ grupo_materia_id: null, clases_asistidas: 0, profesor_clave: "4321", profesor_id: null }],
    NOMBRES,
  );
  ok("hay falta que justificar", J.diaTieneFaltaJustificable(r.materias));
  ok("ningún profesor la justifica por materia", J.materiasJustificablesPorProfesor(r.materias, PROF_MAT).length === 0);
  const aceptado = D.resolverDiaMateria(
    "clase",
    [{ grupo_materia_id: null, clases: 1 }],
    [{ grupo_materia_id: null, clases_asistidas: 0, profesor_clave: "4321", profesor_id: null }],
    NOMBRES,
    { diaCompleto: true, materias: new Set() },
  );
  ok("el directivo sí: queda verde", aceptado.color === "verde", aceptado.color);
}

console.log("10) ¿Hay algo que justificar? (lo que el padre puede pedir)");
{
  ok("día rojo: sí", J.diaTieneFaltaJustificable(dia(undefined).materias));
  ok("día con todo justificado: no", !J.diaTieneFaltaJustificable(dia({ diaCompleto: true, materias: new Set() }).materias));
  const completo = D.resolverDiaMateria("clase", [{ grupo_materia_id: QUI, clases: 1 }],
    [{ grupo_materia_id: QUI, clases_asistidas: 1, profesor_clave: null, profesor_id: null }], NOMBRES);
  ok("día verde: no", !J.diaTieneFaltaJustificable(completo.materias));
  const pendiente = D.resolverDiaMateria("clase", [{ grupo_materia_id: QUI, clases: 1 }], [], NOMBRES);
  ok("día pendiente (sin celda): no", !J.diaTieneFaltaJustificable(pendiente.materias));
}

console.log("11) Validación de la selección del profesor");
{
  const justificables = J.materiasJustificablesPorProfesor(dia(undefined).materias, PROF_MAT);
  ok("vacía → error", !J.validarSeleccionProfesor(justificables, []).ok);
  ok("materia ajena → error", !J.validarSeleccionProfesor(justificables, [FIS]).ok);
  const bien = J.validarSeleccionProfesor(justificables, [MAT, MAT, " "]);
  ok("la suya → ok, sin duplicados", bien.ok && bien.materias.length === 1 && bien.materias[0] === MAT, JSON.stringify(bien));
}

console.log("12) Historial del profesor: lo suyo y lo que no tiene dueño");
{
  const lineas = dia(undefined).materias; // Mat → 7 · Fís → 9 · Quí completa, sin dueño
  const sol = (estado) => ({ id: "s1", curp_alumno: "C1", fecha: "2026-10-05", estado });
  const hija = (gm, quien, hora) => ({
    curp_alumno: "C1", fecha: "2026-10-05", grupo_materia_id: gm, solicitante_id: String(quien), created_at: hora,
  });
  const hijas = [hija(FIS, PROF_FIS, "2026-10-05T10:00:00Z"), hija(MAT, PROF_MAT, "2026-10-05T09:00:00Z")];

  const del7 = J.decidirHistorialProfesor(sol("aprobada"), hijas, lineas, PROF_MAT);
  ok("el 7 la ve", del7.visible);
  ok("el 7 ve solo Matemáticas (no Física, que es del 9)",
    del7.materias.length === 1 && del7.materias[0].grupo_materia_id === MAT, JSON.stringify(del7.materias));

  const de99 = J.decidirHistorialProfesor(sol("aprobada"), hijas, lineas, 99);
  ok("un profesor ajeno no la ve (todas las faltas tienen dueño)", !de99.visible);

  const pendienteSinNada = J.decidirHistorialProfesor(sol("pendiente"), [], lineas, PROF_MAT);
  ok("pendiente sin nada resuelto: no va al historial (está en su lista activa)", !pendienteSinNada.visible);

  const pendienteConLaSuya = J.decidirHistorialProfesor(sol("pendiente"), hijas, lineas, PROF_MAT);
  ok("pendiente pero ya justificó su materia: sí va", pendienteConLaSuya.visible);

  const rechazada = J.decidirHistorialProfesor(sol("rechazada"), [], lineas, PROF_FIS);
  ok("rechazada por dirección con falta suya: la ve", rechazada.visible && rechazada.materias.length === 0);

  const legacy = D.resolverDiaMateria("clase", [{ grupo_materia_id: null, clases: 1 }],
    [{ grupo_materia_id: null, clases_asistidas: 0, profesor_clave: "4321", profesor_id: null }], NOMBRES).materias;
  ok("día sin dueño (registro anterior): la ven todos",
    J.decidirHistorialProfesor(sol("aprobada"), [], legacy, 99).visible);
}

console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
