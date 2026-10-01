#!/usr/bin/env node
/**
 * test-horario-semanal-puro.mjs — suite pura de `lib/escolar/horario/horario-semanal-puro.ts`.
 *
 * QUÉ MIDE: normalización de campos del horario (materias, días, horas, tipo de
 *           clase), atribución profesor→bloques y materias del horario.
 * QUÉ ESCRIBE: nada. Carga el `.ts` directamente. No toca la base ni la red.
 * CÓMO SE EJECUTA: node scripts/test-horario-semanal-puro.mjs
 */
const H = await import("../lib/escolar/horario/horario-semanal-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

/* ── Horas ─────────────────────────────────────────────────────────────── */
console.log("\nhoras");
eq(H.horaAMinutos("07:30"), 450, "\"07:30\" → 450");
eq(H.horaAMinutos("7:30"), 450, "\"7:30\" → 450");
eq(H.horaAMinutos("07:30:00"), 450, "\"07:30:00\" → 450");
eq(H.horaAMinutos(0.5), 720, "serial Excel 0.5 → 720 (12:00)");
eq(H.horaAMinutos("25:00"), null, "hora 25 rechazada");
eq(H.horaAMinutos("07:60"), null, "minuto 60 rechazado");
eq(H.horaAMinutos("abc"), null, "texto no hora → null");
eq(H.horaAMinutos(null), null, "null → null");
eq(H.horaAMinutos(-1), null, "serial negativo → null");
eq(H.minutosAHora(450), "07:30", "450 → 07:30");
eq(H.minutosAHora(0), "00:00", "0 → 00:00");
eq(H.minutosAHora(1439), "23:59", "1439 → 23:59");
eq(H.normalizarHoraVisible("7:30"), "07:30", "\"7:30\" → 07:30");
eq(H.normalizarHoraVisible(0.25), "06:00", "serial 0.25 → 06:00");
eq(H.normalizarHoraVisible("nope"), "", "no-hora → vacío");
eq(H.duracionMinutos("07:00", "08:30"), 90, "07:00→08:30 = 90");
eq(H.duracionMinutos("08:30", "07:00"), 0, "invertida → 0 (no negativo)");
eq(H.duracionMinutos("x", "08:00"), 0, "inicio inválido → 0");

/* ── Días ──────────────────────────────────────────────────────────────── */
console.log("\ndías");
eq(H.normalizarDiaSemanaHorario("Lunes"), "lunes", "Lunes → lunes");
eq(H.normalizarDiaSemanaHorario("MIÉRCOLES"), "miercoles", "MIÉRCOLES → miercoles");
eq(H.normalizarDiaSemanaHorario("Monday"), "lunes", "Monday → lunes");
eq(H.normalizarDiaSemanaHorario("SÁBADO"), "sabado", "SÁBADO → sabado");
eq(H.normalizarDiaSemanaHorario("xyz"), null, "texto raro → null");
eq(H.normalizarDiaSemanaHorario(null), null, "null → null");
eq(H.DIAS_CLASE_SEMANA, ["lunes", "martes", "miercoles", "jueves", "viernes"], "los 5 días de clase");

/* ── Materias: clave y equivalencias ──────────────────────────────────── */
console.log("\nmaterias");
eq(H.materiaClaveHorario("  Matemáticas  I "), "MATEMATICAS I", "trim+mayúsculas+sin acentos");
eq(H.clavesEquivalenciaMateria("INGLES V"), ["INGLES V", "INGLES"], "romano de grado se quita");
eq(H.clavesEquivalenciaMateria("INGLES MODULO III"), ["INGLES MODULO III"], "módulo: el romano se conserva");
eq(H.clavesEquivalenciaMateria(""), [], "vacío → sin claves");
/* ── Tipo de clase ─────────────────────────────────────────────────────── */
console.log("\ntipo de clase");
eq(H.normalizarTipoClaseHorario("Módulo Técnico"), "modulo tecnico", "módulo técnico");
eq(H.normalizarTipoClaseHorario("Académica"), "academica", "académica");
eq(H.normalizarTipoClaseHorario("Taller"), "taller", "taller");
eq(H.normalizarTipoClaseHorario("Tutoría"), "tutoria", "tutoría");
eq(H.normalizarTipoClaseHorario(""), "academica", "vacío → académica por defecto");
eq(H.normalizarTipoClaseHorario("Laboratorio"), "otro", "desconocido → otro");
eq(H.etiquetaTipoClase("modulo tecnico"), "Módulo técnico", "etiqueta módulo");
eq(H.etiquetaTipoClase("academica"), "Académica", "etiqueta académica");
eq(H.etiquetaTipoClase("xyz"), "xyz", "etiqueta desconocida → tal cual");
eq(H.etiquetaTipoClase(""), "—", "etiqueta vacía → guion");

/* ── Profesor visible y atribución ────────────────────────────────────── */
console.log("\nprofesor");
eq(H.profesorVisibleDelBloque({ profesor_nombre: "Juan Pérez", profesor_clave: "J" }), "Juan Pérez", "nombre manda");
eq(H.profesorVisibleDelBloque({ profesor_nombre: "", profesor_clave: "J123" }), "J123", "sin nombre → clave");
eq(H.profesorVisibleDelBloque({ profesor_nombre: null, profesor_clave: null }), "Sin profesor asignado", "sin profesor");
const materias = { materiaIds: new Set(["m1"]), claves: new Set(["INGLES"]), cantidadAsignaciones: 1 };
ok("bloque con clave del profesor → suyo", H.bloquePerteneceAProfesor({ profesor_clave: "ABC", materia_id: null, materia_nombre: "" }, "abc", materias));
ok("bloque con materia_id asignada → suyo", H.bloquePerteneceAProfesor({ profesor_clave: null, materia_id: "m1", materia_nombre: "" }, "X", materias));
ok("bloque por equivalencia de materia → suyo", H.bloquePerteneceAProfesor({ profesor_clave: null, materia_id: null, materia_nombre: "INGLES V" }, "X", materias));
ok("bloque ajeno → no es suyo", !H.bloquePerteneceAProfesor({ profesor_clave: null, materia_id: null, materia_nombre: "FISICA" }, "X", materias));
eq(H.bloquesDelProfesorEnGrupo([
  { profesor_clave: "ABC", materia_id: null, materia_nombre: "" },
  { profesor_clave: null, materia_id: null, materia_nombre: "FISICA" },
], "abc", materias).length, 1, "filtra bloques del profesor");
eq(H.conteoProfesorPorDia([{ dia_semana: "lunes" }, { dia_semana: "lunes" }, { dia_semana: "martes" }]), { lunes: 2, martes: 1 }, "conteo por día");

/* ── Bloques por fecha y conteos ──────────────────────────────────────── */
console.log("\nbloques");
const bloques = [
  { dia_semana: "lunes", hora_inicio: "09:00" },
  { dia_semana: "lunes", hora_inicio: "07:00" },
  { dia_semana: "martes", hora_inicio: "08:00" },
];
const delLunes = H.bloquesDeGrupoEnFecha(bloques, "2026-09-07"); // 2026-09-07 es lunes
eq(delLunes.length, 2, "dos bloques el lunes");
eq(delLunes.map((b) => b.hora_inicio), ["07:00", "09:00"], "ordenados por hora");
eq(H.totalBloquesGrupoPorDia([{ dia_semana: "lunes" }, { dia_semana: "lunes" }, { dia_semana: "martes" }]), { lunes: 2, martes: 1 }, "total por día");

/* ── Materias del horario ─────────────────────────────────────────────── */
console.log("\nmaterias del horario");
const items = H.materiasDelHorario([
  { materia_clave: "MAT", materia_nombre: "Matemáticas", dia_semana: "lunes" },
  { materia_clave: "MAT", materia_nombre: "Matemáticas", dia_semana: "martes" },
  { materia_clave: "ING", materia_nombre: "Inglés", dia_semana: "lunes" },
]);
eq(items.map((i) => i.clave), ["ING", "MAT"], "ordenadas por nombre (Inglés antes)");
eq(items[1].totalSemana, 2, "Matemáticas dos bloques");

/* ── Búsqueda de grupo ────────────────────────────────────────────────── */
console.log("\nbúsqueda de grupo");
const lista = [{ id: "g1", grado: "3", nombre: "A", carreraId: "c1", carreraClave: "MECATRONICA", carreraNombre: "Mecatrónica" }];
ok("grupo por identidad normalizada", H.buscarGrupoEnLista(lista, "3", "a", "mecatronica")?.id === "g1");
ok("carrera distinta → null", H.buscarGrupoEnLista(lista, "3", "A", "RH") === null);

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
