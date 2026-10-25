#!/usr/bin/env node
/**
 * test-boleta.mjs — suite pura de la boleta generada (PROMPT X).
 *
 * QUÉ MIDE: `lib/escolar/administracion/boleta-puro.ts` — la calificación que se
 *           muestra (redondeo, piso de 5, «Sin calificar», «Revisar»), el promedio
 *           general, la asistencia, la duración del parcial, quién ve la boleta,
 *           qué activación le toca a un alumno, qué parcial enseña al personal,
 *           la validación de una activación y la hoja armada.
 * QUÉ ESCRIBE: nada. Carga el `.ts` directamente. No toca la base.
 * CÓMO SE EJECUTA: node scripts/test-boleta.mjs
 *
 * Las CURP de aquí son SINTÉTICAS: cumplen el formato, no son de nadie.
 */
const B = await import("../lib/escolar/administracion/boleta-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const texto = (v) => B.calificacionBoleta(v).texto;

/* ── 1) La calificación de una materia ─────────────────────────────────── */
console.log("\ncalificación mostrada");
eq(texto(7.5), "8", "7.5 sube a 8");
eq(texto(7.49), "7", "7.49 baja a 7");
eq(texto(8.45), "8", "8.45 baja a 8 (se redondea a entero, no por pasos)");
eq(texto(6.5), "7", "6.5 sube a 7");
eq(texto(7.4999999999), "8", "un 7.50 que llega como 7.4999… por la coma flotante sube");
eq(texto(4.2), "5", "4.2 sale 5: nunca menos del piso");
eq(texto(0), "5", "0 sale 5");
eq(texto(10), "10", "10 se queda en 10");
eq(texto(null), "Sin calificar", "sin nota → «Sin calificar»");
eq(texto(undefined), "Sin calificar", "undefined → «Sin calificar»");
eq(texto(Number.NaN), "Sin calificar", "NaN → «Sin calificar»");
eq(texto(10.5), "Revisar", "10.5 está fuera de escala → «Revisar»");
eq(texto(85), "Revisar", "un 85 (escala de 100) → «Revisar», no se convierte");
eq(texto(-1), "Revisar", "negativo → «Revisar»");
eq(B.calificacionBoleta(4.2), { texto: "5", valor: 5, estado: "calificada" }, "la celda lleva el valor mostrado");
eq(B.calificacionBoleta(85).valor, null, "«Revisar» no lleva valor");
ok("no hay estado de reprobada", !JSON.stringify(B.calificacionBoleta(5)).includes("reprob"));

/* ── 2) Promedio general ───────────────────────────────────────────────── */
console.log("\npromedio general");
const celdas = (...vs) => vs.map((v) => B.calificacionBoleta(v));
eq(B.promedioGeneral(celdas(8, 7, null)), "8", "[8, 7, sin nota] → 7.5 → 8");
eq(B.promedioGeneral(celdas(9, 8, 8)), "8", "[9, 8, 8] → 8.33 → 8");
eq(B.promedioGeneral(celdas(4, 6)), "6", "promedia lo MOSTRADO: [4→5, 6] → 5.5 → 6");
eq(B.promedioGeneral(celdas(85, 9)), "9", "«Revisar» no cuenta");
eq(B.promedioGeneral([]), "Sin calificar", "sin materias → «Sin calificar»");
eq(B.promedioGeneral(celdas(null, null)), "Sin calificar", "ninguna calificada → «Sin calificar»");
eq(B.DECIMALES_PROMEDIO_GENERAL, 0, "el promedio general es entero (constante en un solo sitio)");

/* ── 3) Asistencia y duración ──────────────────────────────────────────── */
console.log("\nasistencia y duración");
eq(B.textoAsistencia({ porcentaje: 93, clasesRegistradas: 40 }), "93 %", "porcentaje del parcial");
eq(B.textoAsistencia({ porcentaje: 0, clasesRegistradas: 0 }), "Sin registro", "sin clases registradas → «Sin registro», no «0 %»");
eq(B.textoAsistencia(null), "Sin registro", "sin dato → «Sin registro»");
eq(
  B.duracionParcial({ fecha_inicio: "2026-09-28", fecha_fin: "2026-11-06" }),
  "del 28 de Septiembre al 6 de Noviembre de 2026",
  "duración del Parcial 2",
);
eq(
  B.duracionParcial({ fecha_inicio: "2026-12-14", fecha_fin: "2027-01-15" }),
  "del 14 de Diciembre de 2026 al 15 de Enero de 2027",
  "un parcial que cruza de año lleva los dos años",
);
eq(B.duracionParcial({ fecha_inicio: "", fecha_fin: "2026-11-06" }), "", "sin fechas → vacío");

/* ── 4) Quién ve qué ───────────────────────────────────────────────────── */
console.log("\nalcance de la vista");
eq(B.alcanceVistaBoleta("alumno"), "familia", "alumno → familia");
eq(B.alcanceVistaBoleta("tutor"), "familia", "tutor → familia");
eq(B.alcanceVistaBoleta("directivo"), "personal", "directivo → personal");
eq(B.alcanceVistaBoleta("administracion"), "personal", "Administración escolar → personal");
eq(B.alcanceVistaBoleta("maestro"), null, "maestro → nada");
eq(B.alcanceVistaBoleta("tecnico"), null, "técnico → nada");
eq(B.alcanceVistaBoleta("otro"), null, "un modo desconocido no hereda la boleta");

/* ── 5) Qué activación le toca a un alumno ─────────────────────────────── */
console.log("\nactivación que aplica");
const act = (id, alcance, extra = {}) => ({
  id, evaluacionId: `p-${id}`, alcance, grado: null, grupoId: null, activadaEn: "2026-10-01T10:00:00Z", ...extra,
});
const alumno = { grado: "2DO", grupoId: "g-2a-rh" };
const plantel = act("plantel", "plantel");
const grado = act("grado", "grado", { grado: "2DO" });
const grupo = act("grupo", "grupo", { grupoId: "g-2a-rh" });
const otroGrupo = act("otro", "grupo", { grupoId: "g-2a-meca", activadaEn: "2026-10-20T10:00:00Z" });
const otroGrado = act("otroGrado", "grado", { grado: "3RO" });
eq(B.activacionQueAplica([], alumno), null, "sin activaciones → nada");
eq(B.activacionQueAplica([plantel], alumno)?.id, "plantel", "solo plantel → plantel");
eq(B.activacionQueAplica([plantel, grado], alumno)?.id, "grado", "grado gana a plantel");
eq(B.activacionQueAplica([grado, plantel, grupo], alumno)?.id, "grupo", "grupo gana a grado y a plantel");
eq(B.activacionQueAplica([otroGrupo], alumno), null, "la de OTRO grupo (misma letra, otra carrera) no aplica");
eq(B.activacionQueAplica([otroGrado], alumno), null, "la de otro grado no aplica");
eq(B.activacionQueAplica([otroGrupo, plantel], alumno)?.id, "plantel", "otro grupo no tapa al plantel");
eq(
  B.activacionQueAplica([act("vieja", "plantel"), act("nueva", "plantel", { activadaEn: "2026-10-24T10:00:00Z" })], alumno)?.id,
  "nueva",
  "empate de nivel → la más reciente",
);
eq(B.activacionQueAplica([act("g", "grado", { grado: " 2do " })], alumno)?.id, "g", "el grado se compara sin mayúsculas ni espacios");
eq(B.activacionQueAplica([act("sin", "grupo", { grupoId: null })], { grado: "2DO", grupoId: "" }), null, "un grupo vacío no cubre a un alumno sin grupo");

/* ── 6) Qué parcial ve el personal ─────────────────────────────────────── */
console.log("\nparcial del personal");
const parciales = [
  { id: "p1", numero: 1, nombre: "Parcial 1", fecha_inicio: "2026-08-31", fecha_fin: "2026-09-25" },
  { id: "p2", numero: 2, nombre: "Parcial 2", fecha_inicio: "2026-09-28", fecha_fin: "2026-11-06" },
  { id: "p3", numero: 3, nombre: "Parcial 3", fecha_inicio: "2026-11-09", fecha_fin: "2026-12-11" },
];
const elegir = (o) => B.elegirParcialBoleta({ parciales, pedido: null, activacion: null, hoy: "2026-10-24", ...o })?.id ?? null;
eq(elegir({ pedido: "p3" }), "p3", "el pedido manda si es del ciclo");
eq(elegir({ pedido: "p9", activacion: { evaluacionId: "p1" } }), "p1", "pedido ajeno → el de la activación");
eq(elegir({}), "p2", "sin pedido ni activación → el que contiene hoy");
eq(elegir({ hoy: "2027-02-01" }), "p1", "hoy fuera de todo parcial → el primero");
eq(B.elegirParcialBoleta({ parciales: [], pedido: null, activacion: null, hoy: "2026-10-24" }), null, "sin parciales → nada");

/* ── 7) Validar una activación ─────────────────────────────────────────── */
console.log("\nvalidar activación");
const grupos = [
  { id: "g-2a-rh", grado: "2DO", grupo: "A", carreraClave: "RH" },
  { id: "g-2a-meca", grado: "2DO", grupo: "A", carreraClave: "MECATRONICA" },
  { id: "g-1a", grado: "1RO", grupo: "A", carreraClave: "" },
];
const ciclo = { parciales, grupos };
const validar = (e) => B.validarActivacion({ evaluacionId: "p2", alcance: "plantel", grado: "", grupoId: "", ...e }, ciclo);
eq(validar({}), { ok: true, datos: { evaluacionId: "p2", alcance: "plantel", grado: null, grupoId: null } }, "plantel válido");
eq(validar({ grado: "2DO", grupoId: "g-1a" }).datos, { evaluacionId: "p2", alcance: "plantel", grado: null, grupoId: null }, "plantel descarta grado y grupo que sobran");
eq(validar({ alcance: "grado", grado: "2do" }).datos?.grado, "2DO", "el grado se normaliza al del ciclo");
ok("«grado» sin grado se rechaza", validar({ alcance: "grado" }).ok === false);
ok("un grado que no está en el ciclo se rechaza", validar({ alcance: "grado", grado: "7MO" }).ok === false);
eq(validar({ alcance: "grado", grado: "2DO", grupoId: "g-1a" }).datos?.grupoId, null, "«grado» descarta el grupo");
eq(validar({ alcance: "grupo", grupoId: "g-2a-meca", grado: "2DO" }).datos, { evaluacionId: "p2", alcance: "grupo", grado: null, grupoId: "g-2a-meca" }, "«grupo» descarta el grado");
ok("«grupo» sin grupo se rechaza", validar({ alcance: "grupo" }).ok === false);
ok("un grupo de otro ciclo se rechaza", validar({ alcance: "grupo", grupoId: "g-otro" }).ok === false);
ok("un parcial de otro ciclo se rechaza", validar({ evaluacionId: "p9" }).ok === false);
ok("sin parcial se rechaza", validar({ evaluacionId: "  " }).ok === false);
ok("un alcance inventado se rechaza", validar({ alcance: "carrera" }).ok === false);

/* ── 8) Rótulos ────────────────────────────────────────────────────────── */
console.log("\nrótulos");
eq(B.etiquetaGrupoBoleta(grupos[0]), "2DO A · RH", "grupo con carrera");
eq(B.etiquetaGrupoBoleta(grupos[2]), "1RO A", "grupo sin carrera");
eq(B.gradosDelCiclo([{ grado: "2DO" }, { grado: "1RO" }, { grado: "2do" }, { grado: "10MO" }]), ["1RO", "2DO", "10MO"], "grados únicos y en orden numérico");
eq(B.ordenarGruposBoleta(grupos).map((g) => g.id), ["g-1a", "g-2a-meca", "g-2a-rh"], "grupos por grado, letra y carrera");
eq(B.fechaCortaPlantel("2026-10-24T03:00:00Z"), "23/10/2026", "la fecha es la del plantel (UTC−6), no la UTC");
eq(B.fechaCortaPlantel("no-es-fecha"), "", "una fecha ilegible da vacío, no 1969");
eq(
  B.etiquetaActivacion(act("x", "grupo", { evaluacionId: "p2", grupoId: "g-2a-rh", activadaEn: "2026-10-24T18:00:00Z" }), ciclo),
  { parcial: "Parcial 2", alcance: "Grupo 2DO A · RH", desde: "24/10/2026" },
  "una activación de grupo, dicha para el directivo",
);
eq(B.etiquetaActivacion(act("y", "grado", { evaluacionId: "p1", grado: "3RO" }), ciclo).alcance, "Grado 3RO", "una de grado");
eq(B.etiquetaActivacion(act("z", "plantel", { evaluacionId: "p1" }), ciclo).alcance, "Todo el plantel", "una de plantel");
eq(B.ordenarAlumnosBoleta([{ nombre: "ZOE" }, { nombre: "ÁNGEL" }, { nombre: "BETO" }]).map((a) => a.nombre), ["ÁNGEL", "BETO", "ZOE"], "alumnos por nombre, con acentos en su sitio");

/* ── 9) La hoja armada ─────────────────────────────────────────────────── */
console.log("\nboleta armada");
const datos = {
  nombre: "  ana gómez martínez ",
  curp: "goma050101mdfrrna1",
  numeroControl: null,
  grado: "2DO",
  grupo: "A",
  carrera: "RH",
  parcial: parciales[1],
  materias: [
    { nombre: "Inglés", promedio: 7.44 },
    { nombre: "Álgebra", promedio: null },
    { nombre: "Biología", promedio: 85 },
  ],
  asistencia: { porcentaje: 91, clasesRegistradas: 30 },
};
const b = B.armarBoleta(datos);
eq(b.titulo, "BOLETA DE CALIFICACIONES", "título");
ok("institución del plantel", b.institucion.startsWith("CENTRO DE ESTUDIOS TECNOLÓGICOS") && b.cct === "22DCM0001I");
eq(b.parcial, "Parcial 2", "parcial");
eq(b.duracion, "del 28 de Septiembre al 6 de Noviembre de 2026", "duración");
eq(b.nombre, "ANA GÓMEZ MARTÍNEZ", "nombre en mayúsculas y sin espacios de sobra");
eq(b.curp, "GOMA050101MDFRRNA1", "CURP en mayúsculas");
eq(b.numeroControl, "Sin asignar", "sin número de control → «Sin asignar» (no bloquea)");
eq(B.armarBoleta({ ...datos, numeroControl: " 23222040230009 " }).numeroControl, "23222040230009", "con número de control, el suyo");
eq(b.gradoGrupo, "2DO A", "grado y grupo");
eq(b.carrera, "TÉCNICO EN RECURSOS HUMANOS", "RH → TÉCNICO EN RECURSOS HUMANOS");
eq(B.armarBoleta({ ...datos, carrera: "" }).carrera, "Sin carrera", "sin carrera → «Sin carrera»");
eq(b.filas.map((f) => f.materia), ["Álgebra", "Biología", "Inglés"], "materias por nombre (Á antes que B)");
eq(b.filas.map((f) => f.calificacion), ["Sin calificar", "Revisar", "7"], "cada materia con su regla");
eq(b.promedioGeneral, "7", "promedio general solo de las calificadas");
eq(b.asistencia, "91 %", "asistencia del parcial");
eq(b.leyenda, "Documento informativo, sin validez oficial.", "la leyenda va en la hoja");
ok("la hoja no lleva firma ni director", !JSON.stringify(b).includes("DIRECTOR"));
eq(B.armarBoleta({ ...datos, materias: [] }).promedioGeneral, "Sin calificar", "un grupo sin materias se enseña igual");

console.log(`\nResultado: ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
