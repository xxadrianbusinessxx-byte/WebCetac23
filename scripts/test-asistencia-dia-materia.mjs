/**
 * test-asistencia-dia-materia.mjs - Pruebas PURAS del PROMPT S · Parte B
 * (módulo `lib/escolar/asistencia/asistencia-dia-materia.ts`), sin Supabase.
 *
 * Casos de la VALIDACIÓN: color del día y desglose por materia, incluidas las
 * filas legacy y la justificación.
 *
 * Ejecutar: node scripts/test-asistencia-dia-materia.mjs
 */

const M = await import("../lib/escolar/asistencia/asistencia-dia-materia.ts");

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log("  OK " + nombre);
  } else {
    fallidas++;
    console.error("  FALLA " + nombre + (detalle ? " — " + detalle : ""));
  }
}

const GM_MAT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GM_FIS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOMBRES = new Map([
  [GM_MAT, "Matemáticas"],
  [GM_FIS, "Física"],
]);

const dia = (tipo, clases, asistencias) =>
  M.resolverDiaMateria(tipo, clases, asistencias, NOMBRES);

console.log("1) 2/2 => verde");
{
  const r = dia("clase", [{ grupo_materia_id: GM_MAT, clases: 2 }], [
    { grupo_materia_id: GM_MAT, clases_asistidas: 2, profesor_clave: null },
  ]);
  ok("color verde", r.color === "verde", JSON.stringify(r));
  ok("una materia completa", r.materias.length === 1 && r.materias[0].estado === "completa");
}

console.log("2) 1/2 => naranja (la mitad exacta es naranja)");
{
  const r = dia("clase", [{ grupo_materia_id: GM_MAT, clases: 2 }], [
    { grupo_materia_id: GM_MAT, clases_asistidas: 1, profesor_clave: null },
  ]);
  ok("color naranja", r.color === "naranja", JSON.stringify(r));
}

console.log("3) 2/3 => naranja (2 de 2 Mat + 0 de 1 Fís)");
{
  const r = dia(
    "clase",
    [
      { grupo_materia_id: GM_MAT, clases: 2 },
      { grupo_materia_id: GM_FIS, clases: 1 },
    ],
    [
      { grupo_materia_id: GM_MAT, clases_asistidas: 2, profesor_clave: null },
      { grupo_materia_id: GM_FIS, clases_asistidas: 0, profesor_clave: null },
    ],
  );
  ok("color naranja (2/3)", r.color === "naranja", JSON.stringify(r));
}

console.log("4) 1/3 => rojo (1 de 2 Mat + 0 de 1 Fís)");
{
  const r = dia(
    "clase",
    [
      { grupo_materia_id: GM_MAT, clases: 2 },
      { grupo_materia_id: GM_FIS, clases: 1 },
    ],
    [
      { grupo_materia_id: GM_MAT, clases_asistidas: 1, profesor_clave: null },
      { grupo_materia_id: GM_FIS, clases_asistidas: 0, profesor_clave: null },
    ],
  );
  ok("color rojo (1/3)", r.color === "rojo", JSON.stringify(r));
}

console.log("5) 0/N => rojo (falta completa del día)");
{
  const r = dia("clase", [{ grupo_materia_id: GM_MAT, clases: 2 }], [
    { grupo_materia_id: GM_MAT, clases_asistidas: 0, profesor_clave: null },
  ]);
  ok("color rojo", r.color === "rojo", JSON.stringify(r));
}

console.log("6) Una materia pendiente queda excluida => verde");
{
  const r = dia(
    "clase",
    [
      { grupo_materia_id: GM_MAT, clases: 2 },
      { grupo_materia_id: GM_FIS, clases: 1 },
    ],
    [{ grupo_materia_id: GM_MAT, clases_asistidas: 2, profesor_clave: null }],
  );
  ok("color verde (la pendiente sale del numerador y del denominador)", r.color === "verde", JSON.stringify(r));
}

console.log("7) Todas pendientes => pendiente");
{
  const r = dia("clase", [{ grupo_materia_id: GM_MAT, clases: 2 }], []);
  ok("color pendiente", r.color === "pendiente", JSON.stringify(r));
}

console.log("8) Dos materias con una en falta => no verde");
{
  const r = dia(
    "clase",
    [
      { grupo_materia_id: GM_MAT, clases: 2 },
      { grupo_materia_id: GM_FIS, clases: 2 },
    ],
    [
      { grupo_materia_id: GM_MAT, clases_asistidas: 2, profesor_clave: null },
      { grupo_materia_id: GM_FIS, clases_asistidas: 0, profesor_clave: null },
    ],
  );
  ok("no es verde (es naranja, 2/4)", r.color !== "verde" && r.color === "naranja", JSON.stringify(r));
}

console.log("9) Legacy agrupado en una sola línea");
{
  const r = dia(
    "clase",
    [{ grupo_materia_id: null, clases: 2 }],
    [{ grupo_materia_id: null, clases_asistidas: 1, profesor_clave: null }],
  );
  const legacy = r.materias.find((m) => m.tipo === "legacy");
  ok("existe una línea legacy", Boolean(legacy), JSON.stringify(r));
  ok("nombre «Registro anterior (sin materia)»", legacy && legacy.nombre === M.NOMBRE_LEGACY);
  ok("legacy con grupoMateriaId null", legacy && legacy.grupoMateriaId === null);
}

console.log("10) Justificación con tope en el faltante");
{
  const r = dia(
    "clase",
    [{ grupo_materia_id: GM_MAT, clases: 2 }],
    [
      { grupo_materia_id: GM_MAT, clases_asistidas: 0, profesor_clave: null },
      { grupo_materia_id: null, clases_asistidas: 5, profesor_clave: M.MARCADOR_JUSTIFICACION },
    ],
  );
  const just = r.materias.find((m) => m.tipo === "justificacion");
  ok("existe la línea de justificación", Boolean(just), JSON.stringify(r));
  ok("la justificación se topa en 2 (el faltante)", just && just.asistidas === 2, JSON.stringify(just));
  ok("color verde (falta + justificación = completo)", r.color === "verde", JSON.stringify(r));
}

console.log("11) Día no lectivo => sin_clase");
{
  const r = dia("festivo", [{ grupo_materia_id: GM_MAT, clases: 2 }], []);
  ok("color sin_clase", r.color === "sin_clase", JSON.stringify(r));
  ok("sin materias", r.materias.length === 0);
}

console.log("12) Materia que no está en el roster => «Materia fuera del grupo», no se descarta");
{
  const GM_OTRA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const r = dia("clase", [{ grupo_materia_id: GM_OTRA, clases: 1 }], [
    { grupo_materia_id: GM_OTRA, clases_asistidas: 1, profesor_clave: null },
  ]);
  ok("línea presente con nombre de fuera del grupo", r.materias.length === 1 && r.materias[0].nombre === M.NOMBRE_FUERA_GRUPO, JSON.stringify(r));
  ok("cuenta para el color (verde)", r.color === "verde", JSON.stringify(r));
}

console.log("13) totalesEnClases: regla única");
{
  const t = M.totalesEnClases([
    { clases: 2, asistidas: 2, tipo: "materia" },
    { clases: 1, asistidas: null, tipo: "materia" },          // pendiente: fuera
    { clases: 0, asistidas: 1, tipo: "materia" },             // sin clases: NUNCA suma
    { clases: 0, asistidas: 1, tipo: "justificacion" },       // solo numerador
  ]);
  ok("denominador 2 (la pendiente y la sin clases fuera)", t.clases === 2, JSON.stringify(t));
  ok("numerador 3 (2 + justificación)", t.asistidas === 3, JSON.stringify(t));
}

console.log("14) Umbral: sale de UMBRAL_NARANJA");
{
  ok("UMBRAL_NARANJA es 0.5", M.UMBRAL_NARANJA === 0.5);
  ok("3 de 6 => naranja (mitad exacta)", M.colorDesdeTotales(6, 3, true) === "naranja");
  ok("2 de 5 => rojo", M.colorDesdeTotales(5, 2, true) === "rojo");
  ok("0 de 3 => rojo (falta completa)", M.colorDesdeTotales(3, 0, true) === "rojo");
}

console.log("Resultado: " + pasadas + " pasadas, " + fallidas + " fallidas");
if (fallidas > 0) process.exit(1);
