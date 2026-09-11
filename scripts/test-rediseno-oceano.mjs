#!/usr/bin/env node
/**
 * PRUEBAS REDISEÑO OCÉANO — los módulos puros que preparan las fases 1-7.
 *
 * Transpila y verifica, sin base de datos:
 *   · facetas-materia         — selector de ámbito y buscador (4 pantallas)
 *   · grupos-campos-personales — reparto personal / médico
 *   · asistencia-tabular      — resumen por parcial → forma de boleta
 *   · mapa-navegacion         — los tres niveles, los cinco roles
 *
 * Uso: node scripts/test-rediseno-oceano.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ── 1) Transpilar los módulos puros a CommonJS temporal ────────────────────
const tmp = path.join(__dirname, ".tmp-oceano");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const archivos = [
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/materia/materia-identidad.ts", "materia/materia-identidad.js"],
  ["lib/escolar/materia/facetas-materia.ts", "materia/facetas-materia.js"],
  // etiquetas.ts hace I/O, pero de él solo se usa la CONSTANTE
  // CAMPOS_PERSONALES_PRIMARIOS. Se compila entero con sus dependencias para no
  // duplicar la constante en un módulo paralelo (R6): la prueba tiene valor
  // precisamente porque compara contra la fuente real.
  ["lib/escolar/tables.ts", "tables.js"],
  ["lib/escolar/alumno/etiquetas-schema.ts", "alumno/etiquetas-schema.js"],
  ["lib/escolar/alumno/etiquetas.ts", "alumno/etiquetas.js"],
  ["lib/escolar/alumno/grupos-campos-personales.ts", "alumno/grupos-campos-personales.js"],
  ["lib/escolar/asistencia/asistencia-tabular.ts", "asistencia/asistencia-tabular.js"],
  ["lib/navegacion/mapa-navegacion.ts", "navegacion/mapa-navegacion.js"],
];

for (const [src, out] of archivos) {
  const codigo = fs.readFileSync(path.join(root, src), "utf8");
  const { outputText } = ts.transpileModule(codigo, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const destino = path.join(tmp, out);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, outputText, "utf8");
}

const facetas = require(path.join(tmp, "materia/facetas-materia.js"));
const grupos = require(path.join(tmp, "alumno/grupos-campos-personales.js"));
const etiquetas = require(path.join(tmp, "alumno/etiquetas.js"));
const tabular = require(path.join(tmp, "asistencia/asistencia-tabular.js"));
const nav = require(path.join(tmp, "navegacion/mapa-navegacion.js"));

// ── 2) Utilidades de prueba ────────────────────────────────────────────────
let fallos = 0;
let pruebas = 0;
function ok(cond, titulo, detalle) {
  pruebas++;
  if (cond) {
    console.log(`  ok  ${titulo}`);
  } else {
    fallos++;
    console.error(`  FALLA  ${titulo}${detalle ? `\n         ${detalle}` : ""}`);
  }
}
const eq = (a, b, titulo) =>
  ok(JSON.stringify(a) === JSON.stringify(b), titulo, `esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);

// ── 3) facetas-materia ─────────────────────────────────────────────────────
console.log("\nfacetas-materia");

const M = [
  { idInterno: "1ro_a_matematicas", grado: "1RO", grupo: "A", carrera: null, asignatura: "MATEMATICAS", nombreVisible: "Matemáticas I" },
  { idInterno: "2do_a_mecatronica_hidraulica", grado: "2DO", grupo: "A", carrera: "MECATRONICA", asignatura: "HIDRAULICA", nombreVisible: "Hidráulica" },
  { idInterno: "2do_b_rh_nomina", grado: "2DO", grupo: "B", carrera: "RH", asignatura: "NOMINA", nombreVisible: "Nómina" },
  { idInterno: "3ro_a_rh_reclutamiento", grado: "3RO", grupo: "A", carrera: "RH", asignatura: "RECLUTAMIENTO", nombreVisible: "Reclutamiento" },
];

const f = facetas.facetasDisponibles(M);
eq(f.grados, ["1RO", "2DO", "3RO"], "grados únicos y ordenados");
eq(f.grupos, ["A", "B"], "grupos únicos y ordenados");
ok(f.carreras.includes(facetas.SIN_CARRERA), "la materia sin carrera es filtrable");

eq(
  facetas.aplicarFiltro(M, { grado: "2DO", grupo: null, carrera: null }).map((m) => m.idInterno),
  ["2do_a_mecatronica_hidraulica", "2do_b_rh_nomina"],
  "filtra por grado",
);
eq(
  facetas.aplicarFiltro(M, { grado: null, grupo: null, carrera: "RH" }).length,
  2,
  "filtra por carrera",
);
eq(
  facetas.aplicarFiltro(M, { grado: null, grupo: null, carrera: facetas.SIN_CARRERA }).map((m) => m.grado),
  ["1RO"],
  "SIN CARRERA alcanza las materias de carrera null",
);
eq(
  facetas.aplicarFiltro(M, { grado: "2DO", grupo: "B", carrera: "RH" }).length,
  1,
  "las tres facetas se combinan en AND",
);
eq(facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO).length, 4, "filtro vacío no filtra");

// Búsqueda: acentos y mayúsculas no deben importar.
eq(facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO, "matematicas").length, 1, "busca sin acentos");
eq(facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO, "NÓMINA").length, 1, "busca con acentos y mayúsculas");
eq(facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO, "2do_b").length, 1, "busca por identificador técnico");
eq(facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO, "   ").length, 4, "búsqueda en blanco no filtra");

// sanearFiltro: una faceta que ya no existe se limpia sola.
eq(
  facetas.sanearFiltro(M, { grado: "9NO", grupo: "A", carrera: null }),
  { grado: null, grupo: "A", carrera: null },
  "sanea la faceta imposible y conserva las válidas",
);
ok(facetas.hayFiltroActivo({ grado: "1RO", grupo: null, carrera: null }), "detecta filtro activo");
ok(!facetas.hayFiltroActivo(facetas.FILTRO_AMBITO_VACIO, ""), "detecta filtro vacío");

// Un módulo puro no muta lo que recibe.
const copia = JSON.stringify(M);
facetas.aplicarFiltro(M, { grado: "2DO", grupo: null, carrera: null }, "hidraulica");
ok(JSON.stringify(M) === copia, "no muta la lista de entrada");

// ── 4) grupos-campos-personales ────────────────────────────────────────────
console.log("\ngrupos-campos-personales");

eq(grupos.camposSinGrupo(), [], "ningún campo personal queda sin apartado");
eq(grupos.camposDuplicados(), [], "ningún campo está en los dos apartados");
eq(
  grupos.CAMPOS_INFORMACION_PERSONAL.length + grupos.CAMPOS_SEGUIMIENTO_MEDICO.length,
  etiquetas.CAMPOS_PERSONALES_PRIMARIOS.length,
  "el reparto cubre exactamente los campos existentes",
);
eq(grupos.grupoDeCampo("TIPO DE SANGRE"), "medico", "tipo de sangre es médico");
eq(grupos.grupoDeCampo("CORREO"), "personal", "correo es personal");
eq(grupos.grupoDeCampo("SALUD MENTAL"), "medico", "salud mental es médico");
ok(
  !grupos.CAMPOS_INFORMACION_PERSONAL.some((c) => grupos.grupoDeCampo(c) === "medico"),
  "información personal no contiene datos de salud",
);
eq(grupos.camposDeGrupo("medico").length, grupos.CAMPOS_SEGUIMIENTO_MEDICO.length, "camposDeGrupo devuelve el grupo completo");

// ── 5) asistencia-tabular ──────────────────────────────────────────────────
console.log("\nasistencia-tabular");

const p = (numero, nombre, asistencias, faltas, pendientes = 0) => ({
  parcial: { id: `p${numero}`, numero, nombre, fecha_inicio: "2026-01-01", fecha_fin: "2026-02-01" },
  asistencias,
  faltas,
  pendientes,
  sinClase: 0,
  porcentaje: asistencias + faltas === 0 ? 0 : Math.round((asistencias / (asistencias + faltas)) * 100),
});

const RES = [p(2, "Parcial 2", 8, 2), p(1, "Parcial 1", 9, 1), p(3, "Parcial 3", 0, 0)];

const v = tabular.vistaTabularAsistencia(RES, { nombreAlumno: "Ana Torres" });
eq(v.encabezados, ["Alumno", "Parcial 1", "Parcial 2", "Asistencia final"], "ordena por número de parcial y omite los vacíos");
eq(v.filas.length, 1, "solo la fila del alumno");
eq(v.filas[0][0], "Ana Torres", "la primera celda es el alumno");
eq(v.filaDestacada, 0, "la fila destacada es la del alumno");
eq(v.filas[0][1], "90%", "porcentaje del parcial 1");
eq(v.filas[0][2], "80%", "porcentaje del parcial 2");
// 17 asistencias de 20 clases registradas = 85 %. Promediar 90 y 80 daría 85
// por coincidencia; con denominadores distintos no coincidiría.
eq(v.filas[0][3], "85%", "el global se recalcula desde los conteos, no promedia porcentajes");

const desigual = [p(1, "Parcial 1", 1, 0), p(2, "Parcial 2", 5, 5)];
// Promediar porcentajes daría (100+50)/2 = 75. Lo correcto es 6/11 = 55 %.
eq(
  tabular.vistaTabularAsistencia(desigual, { nombreAlumno: "X" }).filas[0][3],
  "55%",
  "con denominadores distintos NO promedia porcentajes",
);

const conVacios = tabular.vistaTabularAsistencia(RES, { nombreAlumno: "Ana", incluirParcialesVacios: true });
eq(conVacios.encabezados.length, 5, "incluirParcialesVacios añade la columna del parcial sin clases");
eq(conVacios.filas[0][3], "—", "un parcial sin clases registradas muestra guion, no 0%");

const sinNada = tabular.vistaTabularAsistencia([p(1, "Parcial 1", 0, 0)], {
  nombreAlumno: "Ana",
  incluirParcialesVacios: true,
});
eq(sinNada.filas[0][2], "—", "sin ninguna clase registrada el global es guion, no 0%");
eq(tabular.porcentajeGlobal([]), 0, "resumen vacío no divide por cero");
eq(tabular.detallePorParcial(RES).map((d) => d.etiqueta), ["Parcial 1", "Parcial 2", "Parcial 3"], "el detalle también ordena");
eq(tabular.detallePorParcial(RES)[2].porcentaje, null, "el parcial sin registro no inventa porcentaje");

// ── 6) mapa-navegacion ─────────────────────────────────────────────────────
console.log("\nmapa-navegacion");

const ROLES = ["alumno", "tutor", "maestro", "directivo", "tecnico"];
for (const rol of ROLES) {
  ok(nav.pestanasDe(rol).length > 0, `${rol} tiene pestañas`);
}
eq(nav.pestanasDe(null), [], "sin sesión no hay navegación");

eq(nav.pestanasDe("alumno").map((p) => p.id), ["perfil", "materias", "calendario", "chat"], "pestañas del alumno");
eq(nav.pestanasDe("maestro").map((p) => p.id), ["materias", "calendario-asistencias"], "pestañas del profesor");
eq(
  nav.pestanasDe("directivo").map((p) => p.id),
  ["materias", "grupos-boleta", "calendario-asistencias", "administracion"],
  "pestañas del directivo",
);
eq(nav.pestanasDe("tecnico").map((p) => p.id), ["ciclo-escolar", "catalogo", "personas", "contenido"], "pestañas del técnico");

// El directivo es el profesor MÁS dos pestañas: las compartidas deben ser la
// misma referencia, no una copia que pueda divergir.
const matProf = nav.pestana("maestro", "materias");
const matDir = nav.pestana("directivo", "materias");
ok(matProf === matDir, "profesor y directivo comparten la MISMA pestaña Materias");

// El técnico no ve contenido académico: está denegado por capacidad, así que
// no debe existir en el mapa ni siquiera apagado.
const idsTecnico = nav.pestanasDe("tecnico").flatMap((p) => p.apartados.map((a) => a.id));
for (const prohibido of ["boleta", "calificacion", "calificaciones", "asistencia", "asistencias"]) {
  ok(!idsTecnico.includes(prohibido), `el técnico no ve «${prohibido}» ni apagado`);
}
ok(!nav.pestanasDe("tecnico").some((p) => p.id === "administracion"), "el técnico no ve Administración escolar");

// Tutor y alumno comparten mapa.
eq(
  nav.pestanasDe("tutor").map((p) => p.id),
  nav.pestanasDe("alumno").map((p) => p.id),
  "tutor y alumno comparten mapa",
);

// Todo apagado tiene razón y texto; ningún activo los tiene.
for (const rol of ROLES) {
  for (const p of nav.pestanasDe(rol)) {
    for (const a of p.apartados) {
      if (a.estado === "apagado") {
        ok(Boolean(a.razon), `${rol}/${p.id}/${a.id}: apagado con razón`);
        ok(Boolean(nav.textoApagado(a)), `${rol}/${p.id}/${a.id}: apagado con texto`);
      } else {
        ok(nav.textoApagado(a) === null, `${rol}/${p.id}/${a.id}: activo sin texto de apagado`);
      }
    }
  }
}

// Los dos textos son distintos a propósito.
ok(
  nav.TEXTO_APAGADO["sin-datos"] !== nav.TEXTO_APAGADO.decision,
  "dependencia de datos y decisión se explican distinto",
);
eq(nav.apartado("tecnico", "contenido", "documentos").razon, "decision", "Documentos está apagado por decisión");
eq(nav.apartado("alumno", "materias", "actividades").razon, "sin-datos", "Actividades está apagado por falta de datos");

// apartadoInicial salta los apagados.
eq(nav.apartadoInicial("alumno", "materias").id, "calificacion", "entra al primer apartado ACTIVO, no al primero");
eq(nav.apartadoInicial("directivo", "administracion").id, "alumnos-tutores", "en Administración entra al único activo");
eq(nav.apartadoInicial("alumno", "chat"), null, "una pestaña sin activos no tiene apartado inicial");

// ordenSidebar: el activo sube a la primera posición.
const adm = nav.pestana("directivo", "administracion").apartados;
eq(nav.ordenSidebar(adm, "buzon")[0].id, "buzon", "el apartado activo sube al primer puesto");
eq(nav.ordenSidebar(adm, "buzon").length, adm.length, "ordenar no pierde apartados");
eq(nav.ordenSidebar(adm, "inexistente").map((a) => a.id), adm.map((a) => a.id), "un id desconocido no altera el orden");
ok(nav.ordenSidebar(adm, "buzon") !== adm, "ordenSidebar no muta el array original");

// El configurador de ciclo conserva sus siete pasos como barra de modo.
eq(nav.apartado("tecnico", "ciclo-escolar", "configurador").modos.length, 7, "el configurador conserva sus 7 pasos");

// Los apagados del directivo conservan su barra de modo: es la piel que
// documenta la forma final sin prometer datos.
eq(nav.apartado("directivo", "administracion", "citas").modos.length, 3, "Citas apagado conserva sus 3 modos");

// Registro de lo apagado, por rol.
ok(nav.apartadosApagados("tecnico").length === 1, "el técnico solo tiene un apartado apagado (Documentos)");
ok(nav.apartadosApagados("maestro").length === 1, "el profesor solo tiene Recursos apagado");

// ── 7) Resultado ───────────────────────────────────────────────────────────
console.log(`\n${pruebas - fallos}/${pruebas} pruebas correctas`);
if (fallos > 0) {
  console.error(`${fallos} fallo(s).`);
  process.exit(1);
}
console.log("Suite rediseño Océano: OK\n");
