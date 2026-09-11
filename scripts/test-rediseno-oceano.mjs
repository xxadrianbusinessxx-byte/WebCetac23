#!/usr/bin/env node
/**
 * PRUEBAS REDISEÑO OCÉANO — los módulos puros que preparan las fases 1-7.
 *
 * Transpila y verifica, sin base de datos:
 *   · facetas-materia         — selector de ámbito y buscador (4 pantallas)
 *   · grupos-campos-personales — reparto personal / médico
 *   · asistencia-tabular      — resumen por parcial → forma de boleta
 *   · mapa-navegacion         — los tres niveles, los cinco roles
 *   · notificaciones-alumno    — comentarios + justificaciones en una lista
 *   · buscar-en-filas          — qué fila es de qué alumno (alcance del tutor)
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
  ["lib/escolar/buscar-en-filas.ts", "buscar-en-filas.js"],
  [ "lib/navegacion/mapa-navegacion.ts", "navegacion/mapa-navegacion.js"],
  // Fase 3 — la lista de «Perfil › Notificaciones» (comentarios + justificaciones).
  // Se añadió a esta suite al crearse el módulo: es una decisión pura y sin I/O,
  // y su sitio natural es junto a los demás módulos de navegación/contenido.
  ["lib/navegacion/notificaciones-alumno.ts", "navegacion/notificaciones-alumno.js"],
  // Fases 6 y 7 — emparejamiento hueco→pieza de directivo y tecnico.
  ["lib/navegacion/contenido-docente.ts", "navegacion/contenido-docente.js"],
  ["lib/navegacion/contenido-directivo.ts", "navegacion/contenido-directivo.js"],
  ["lib/navegacion/contenido-tecnico.ts", "navegacion/contenido-tecnico.js"],
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
const enFilas = require(path.join(tmp, "buscar-en-filas.js"));
const notif = require(path.join(tmp, "navegacion/notificaciones-alumno.js"));
const cDoc = require(path.join(tmp, "navegacion/contenido-docente.js"));
const cDir = require(path.join(tmp, "navegacion/contenido-directivo.js"));
const cTec = require(path.join(tmp, "navegacion/contenido-tecnico.js"));

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

// ── C4.28 — «General» no se muestra nunca ──────────────────────────────────
// Regla que ya vivía dentro de materia-selector.tsx. Si el módulo no la
// absorbe, sustituir el filtrado inline por este módulo haría REAPARECER las
// materias sin grado: una regresión silenciosa contra una decisión ya tomada.
const CON_HUERFANA = [
  ...M,
  { idInterno: "huerfana_x", grado: "", grupo: "", carrera: null, asignatura: "HUERFANA", nombreVisible: "Huérfana" },
];

ok(facetas.EXCLUIR_SIN_GRADO_POR_DEFECTO === true, "C4.28 está activa por defecto");
eq(
  facetas.aplicarFiltro(CON_HUERFANA, facetas.FILTRO_AMBITO_VACIO).length,
  4,
  "una materia sin grado NO aparece (C4.28)",
);
eq(
  facetas.aplicarFiltro(CON_HUERFANA, facetas.FILTRO_AMBITO_VACIO, "", false).length,
  5,
  "la regla se puede desactivar, pero hay que pedirlo explícitamente",
);
ok(
  !facetas.facetasDisponibles(CON_HUERFANA).grados.includes(""),
  "la materia sin grado tampoco ensucia el selector de grados",
);
eq(
  facetas.aplicarFiltro(CON_HUERFANA, facetas.FILTRO_AMBITO_VACIO, "huerfana").length,
  0,
  "ni siquiera buscándola por su nombre: sin grado no se puede abrir",
);

// ── Búsqueda por identidad — «1RO A MC» ────────────────────────────────────
eq(facetas.etiquetaCarrera("MECATRONICA"), "MC", "MECATRONICA se abrevia MC");
eq(facetas.etiquetaCarrera("RH"), "RH", "una clave corta se queda igual");
eq(facetas.etiquetaCarrera(null), "", "carrera null no revienta");
eq(
  facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO, "2DO A MC").map((m) => m.idInterno),
  ["2do_a_mecatronica_hidraulica"],
  "busca por identidad con el codigo corto de carrera",
);
eq(
  facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO, "3RO A").map((m) => m.idInterno),
  ["3ro_a_rh_reclutamiento"],
  "busca por grado y grupo juntos",
);
eq(
  facetas.aplicarFiltro(M, facetas.FILTRO_AMBITO_VACIO, "mecatronica").length,
  1,
  "la carrera completa tambien encuentra",
);

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

// Fase 3.1 — «Asistencia» perdió sus sub-vistas: el calendario visual vive,
// único, en «Calendario escolar»; este apartado es la tabla de datos crudos.
eq(
  nav.apartado("alumno", "calendario", "asistencia").modos,
  [],
  "«Asistencia» no tiene sub-vistas (el visual vive en Calendario escolar)",
);

// El configurador de ciclo conserva sus siete pasos como barra de modo.
eq(nav.apartado("tecnico", "ciclo-escolar", "configurador").modos.length, 7, "el configurador conserva sus 7 pasos");

// Los apagados del directivo conservan su barra de modo: es la piel que
// documenta la forma final sin prometer datos.
eq(nav.apartado("directivo", "administracion", "citas").modos.length, 3, "Citas apagado conserva sus 3 modos");

// Registro de lo apagado, por rol.
// Eran dos desde que se descubrió que el sistema de noticias está desactivado
// (ningún componente llama a actionPublicarNoticiaInicio). Esta aserción decía
// «uno» y la suite la cazó al cambiar el mapa: el número es la comprobación.
eq(
  nav.apartadosApagados("tecnico").map((x) => x.apartado.id).sort(),
  ["documentos", "noticias"],
  "el técnico tiene dos apartados apagados, y ambos en «Contenido»",
);
ok(nav.apartadosApagados("maestro").length === 1, "el profesor solo tiene Recursos apagado");

// ── 7) notificaciones-alumno ───────────────────────────────────────────────
console.log("\nnotificaciones-alumno");

// Dos fuentes con fechas distintas, una sin fecha y un empate de fecha entre
// fuentes (justificación aprobada vs comentario).
const N_COMENTARIOS = [
  { comentario: "Participa en clase", fecha: "2026-09-05" },
  { comentario: "Comentario legacy sin fecha", fecha: null },
  { comentario: "Faltó a la práctica", fecha: "2026-09-09" },
];
const N_JUSTIFICACIONES = [
  { fecha: "2026-09-09", motivo: "Cita médica", estado: "aprobada" },
  { fecha: "2026-09-10", motivo: "Trámite", estado: "pendiente" },
];

const lista = notif.notificacionesDeAlumno({
  comentarios: N_COMENTARIOS,
  justificaciones: N_JUSTIFICACIONES,
});

eq(lista.length, 5, "las DOS fuentes entran en la misma lista");
eq(
  lista.map((n) => n.clave),
  ["justificacion-1", "comentario-2", "justificacion-0", "comentario-0", "comentario-1"],
  "orden: fecha descendente · pendiente antes · desempate estable por clave",
);
eq(lista[0].fecha, "2026-09-10", "la primera es la más reciente");
eq(lista[0].estado, "pendiente", "lo que pide acción va arriba (aviso del diseño)");
eq(lista[lista.length - 1].fecha, null, "una entrada sin fecha va al final");
eq(
  lista.find((n) => n.clave === "comentario-2").fuente,
  "comentario",
  "el comentario conserva su fuente en la lista mezclada",
);
eq(
  lista.find((n) => n.clave === "justificacion-0").estado,
  "aprobada",
  "la justificación conserva su estado",
);
eq(lista.find((n) => n.clave === "comentario-0").estado, null, "un comentario no tiene estado");

// Determinista: el mismo dato produce el mismo orden.
eq(
  notif.notificacionesDeAlumno({ comentarios: N_COMENTARIOS, justificaciones: N_JUSTIFICACIONES }).map((n) => n.clave),
  lista.map((n) => n.clave),
  "dos llamadas con el mismo dato dan el mismo orden",
);

// No muta las entradas.
eq(N_COMENTARIOS[0].fecha, "2026-09-05", "no reordena ni muta los comentarios de entrada");
eq(N_JUSTIFICACIONES[0].estado, "aprobada", "no muta las justificaciones de entrada");

// Los dos rótulos de modo los manda el mapa de navegación.
eq(notif.MODO_COMENTARIOS, nav.apartado("alumno", "perfil", "notificaciones").modos[0], "el modo «Comentarios» es el del mapa");
eq(notif.MODO_JUSTIFICACIONES, nav.apartado("alumno", "perfil", "notificaciones").modos[1], "el modo «Justificaciones» es el del mapa");
eq(notif.fuenteDelModo(notif.MODO_COMENTARIOS), "comentario", "«Comentarios» filtra por comentarios");
eq(notif.fuenteDelModo(notif.MODO_JUSTIFICACIONES), "justificacion", "«Justificaciones» filtra por justificaciones");
eq(notif.fuenteDelModo(null), null, "sin modo no filtra");

eq(notif.filtrarPorModo(lista, notif.MODO_COMENTARIOS).length, 3, "el modo Comentarios deja los 3 comentarios");
eq(notif.filtrarPorModo(lista, notif.MODO_JUSTIFICACIONES).length, 2, "el modo Justificaciones deja las 2 justificaciones");
eq(notif.filtrarPorModo(lista, notif.MODO_COMENTARIOS + "s").length, 5, "un modo desconocido no vacía la lista");
ok(notif.filtrarPorModo(lista, null) !== lista, "filtrar devuelve una lista nueva, no la de entrada");

// El aviso: los comentarios no tienen estado, así que no lo encienden.
ok(notif.hayPendiente(lista), "hay pendiente → se enciende el punto de aviso");
ok(
  !notif.hayPendiente(notif.filtrarPorModo(lista, notif.MODO_COMENTARIOS)),
  "en la vista de comentarios no hay nada pendiente",
);

// El límite se aplica DESPUÉS de ordenar.
const corta = notif.notificacionesDeAlumno({
  comentarios: N_COMENTARIOS,
  justificaciones: N_JUSTIFICACIONES,
  limite: 2,
});
eq(corta.map((n) => n.clave), ["justificacion-1", "comentario-2"], "el límite corta por el principio del orden");
eq(lista.length, 5, "con límite, la lista completa no cambia");

// Fuentes vacías: la lista es la otra fuente, sin inventar entradas.
eq(notif.notificacionesDeAlumno({ comentarios: [], justificaciones: N_JUSTIFICACIONES }).length, 2, "sin comentarios, quedan las justificaciones");
eq(notif.notificacionesDeAlumno({ comentarios: N_COMENTARIOS, justificaciones: [] }).length, 3, "sin justificaciones, quedan los comentarios");
eq(notif.notificacionesDeAlumno({ comentarios: [], justificaciones: [] }).length, 0, "sin fuentes, lista vacía");
eq(notif.ETIQUETA_FUENTE.comentario, "Comentario", "rótulo de fuente: comentario");
eq(notif.ETIQUETA_FUENTE.justificacion, "Justificación", "rótulo de fuente: justificación");

// ── 8) buscar-en-filas (alcance: qué fila es de qué alumno) ─────────────────
console.log("\nbuscar-en-filas");

// Fase 4 · PASO 0 — el criterio que hace que `actionObtenerVistaMateria`
// devuelva UNA fila (la del alumno) y no la tabla del grupo.
const CURP_A = "PAAG080507HQTSLBA3";
const CURP_B = "OUCB070914MMCLSRA3";
const TABLA_GRUPO = [
  ["NOMBRE", "PARCIAL 1", "PARCIAL 2"],
  ["PASCUAL ALBINO GABRIEL", "9", "8"],
  ["OLGUIN CASTRO BRENDA", "7", "10"],
  ["OTRO ALUMNO CUALQUIERA", "6", "6"],
];

eq(enFilas.buscarIndiceFilaAlumno(TABLA_GRUPO, { curp: CURP_A }), -1, "sin CURP en la tabla, el criterio no inventa coincidencia");
eq(
  TABLA_GRUPO.filter((f) => enFilas.filaCoincideAlumno(f, { nombreCompleto: "PASCUAL ALBINO GABRIEL" })).length,
  1,
  "por NOMBRE: UNA fila de las tres de la tabla",
);
eq(
  TABLA_GRUPO.filter((f) => enFilas.filaCoincideAlumno(f, { nombreCompleto: "OLGUIN CASTRO BRENDA" })).length,
  1,
  "por NOMBRE: la otra fila, no la tabla entera",
);
eq(
  TABLA_GRUPO.filter((f) => enFilas.filaCoincideAlumno(f, { nombreCompleto: "PASCUAL ALBINO GABRIEL" }))[0][1],
  "9",
  "la fila devuelta es la del alumno, no cualquiera",
);
eq(enFilas.buscarIndiceFilaAlumno(TABLA_GRUPO, { nombreCompleto: "NO EXISTE ESTE ALUMNO" }), -1, "un alumno que no está no coincide con nadie");
eq(TABLA_GRUPO.filter((f) => enFilas.filaCoincideAlumno(f, { curp: CURP_B })).length, 0, "una CURP ajena no coincide con ninguna fila");

// Con CURP presente en la tabla, el CURP manda sobre el nombre.
const CON_CURP = [
  ["alumno_nombre", "CURP", "PARCIAL 1"],
  ["PASCUAL ALBINO GABRIEL", CURP_A, "9"],
  ["OLGUIN CASTRO BRENDA", CURP_B, "7"],
];
eq(enFilas.buscarIndiceFilaAlumno(CON_CURP, { curp: CURP_A }), 1, "la CURP localiza su fila");
eq(enFilas.buscarIndiceFilaAlumno(CON_CURP, { curp: CURP_B }), 2, "y la otra CURP la suya");
// El criterio se evalúa POR FILA (CURP o nombre): por eso la action construye
// siempre la pareja del MISMO alumno, y entonces la fila es exactamente una.
eq(
  CON_CURP.filter((f) =>
    enFilas.filaCoincideAlumno(f, { curp: CURP_A, nombreCompleto: "PASCUAL ALBINO GABRIEL" }),
  ).length,
  1,
  "criterio del mismo alumno (curp + su nombre): 1 fila de 2",
);
eq(
  CON_CURP.filter((f) => enFilas.filaCoincideAlumno(f, { curp: CURP_A })).length,
  1,
  "1 fila de 2 alumnos: nunca la tabla del grupo",
);

// ── 9) Resultado ───────────────────────────────────────────────────────────
// ── 8) contenido-directivo y contenido-tecnico ─────────────────────────────
// La prueba que importa: TODO hueco emparejado existe en el mapa y esta ACTIVO.
// Un emparejamiento para un apartado apagado, o para uno que ese rol no ve, es
// un bug silencioso — el shell montaria una pieza que nadie deberia alcanzar.
console.log("\ncontenido-directivo · contenido-tecnico");

const esActivo = (rol, p, a) => nav.apartado(rol, p, a)?.estado === "activo";

function compruebaHuecos(modulo, rol, etiqueta) {
  for (const clave of modulo.huecosConPieza()) {
    const [p, a] = clave.split("/");
    const ap = nav.apartado(rol, p, a);
    ok(ap !== null, `${etiqueta}: ${clave} existe en el mapa de ${rol}`);
    if (ap) ok(ap.estado === "activo", `${etiqueta}: ${clave} esta activo`);
  }
}

compruebaHuecos(cDir, "directivo", "directivo");
compruebaHuecos(cTec, "tecnico", "tecnico");

// contenido-docente sirve a los DOS roles: sus huecos tienen que existir y
// estar activos en el mapa de maestro Y en el de directivo. Si divergieran,
// una pestaña compartida dejaria de serlo sin que nadie lo notara.
compruebaHuecos(cDoc, "maestro", "docente/maestro");
compruebaHuecos(cDoc, "directivo", "docente/directivo");

// Y los dos modulos no pueden solaparse: un hueco con dos emparejamientos es
// exactamente el camino paralelo que esta separacion evita (R6).
for (const clave of cDoc.huecosConPieza()) {
  const [p, a] = clave.split("/");
  ok(cDir.piezaDe(p, a) === null, `docente y directivo no se solapan en ${clave}`);
}

// El calendario escolar del docente NO tiene pieza a proposito: el unico
// componente que existe es un EDITOR y el maestro no tiene calendario.editar.
eq(
  cDoc.piezaDe("calendario-asistencias", "calendario-escolar"),
  null,
  "calendario escolar del docente sin pieza: el panel existente es un editor",
);
ok(esActivo("maestro", "calendario-asistencias", "calendario-escolar"),
  "…pero el apartado SI esta activo en el mapa: le falta vista, no permiso");

// Los dos modos de calificaciones son dos vistas del MISMO hueco.
ok(cDoc.esModoConfiguracion("Configuración de columnas"), "reconoce el modo de configuracion");
ok(!cDoc.esModoConfiguracion("Avance"), "«Avance» no es configuracion");
ok(!cDoc.esModoConfiguracion(null), "sin modo no es configuracion");

// El directivo NO empareja las pestañas que comparte con el docente: si lo
// hiciera habria dos fuentes para el mismo hueco (R6).
for (const clave of cDir.huecosConPieza()) {
  ok(
    !cDir.esPestanaCompartida(clave.split("/")[0]),
    `directivo: ${clave} no invade una pestaña compartida con el docente`,
  );
}
eq(cDir.PESTANAS_COMPARTIDAS_CON_DOCENTE.length, 2, "son dos las pestañas compartidas");
for (const p of cDir.PESTANAS_COMPARTIDAS_CON_DOCENTE) {
  ok(nav.pestana("maestro", p) !== null, `la pestaña compartida «${p}» existe para el maestro`);
  ok(nav.pestana("directivo", p) !== null, `la pestaña compartida «${p}» existe para el directivo`);
}

// El tecnico no ve contenido academico: ningun emparejamiento suyo puede
// apuntar a calificaciones, asistencia ni boleta.
for (const clave of cTec.huecosConPieza()) {
  ok(
    !/calificacion|asistencia|boleta|justificacion/.test(clave),
    `tecnico: ${clave} no toca contenido academico`,
  );
}

// Contenido del tecnico: la unica pestaña sin ningun apartado activo.
const contenido = nav.pestana("tecnico", "contenido");
ok(
  contenido.apartados.every((a) => a.estado === "apagado"),
  "«Contenido» del tecnico no tiene ningun apartado activo (Documentos y Noticias apagados)",
);
eq(
  nav.apartado("tecnico", "contenido", "noticias").razon,
  "decision",
  "Noticias esta apagado por decision: el sistema Cloudinary esta desactivado",
);
eq(cTec.piezaDe("contenido", "noticias"), null, "un apartado apagado no tiene pieza");
eq(cTec.piezaDe("inventada", "inexistente"), null, "un hueco desconocido devuelve null");

console.log(`\n${pruebas - fallos}/${pruebas} pruebas correctas`);
if (fallos > 0) {
  console.error(`${fallos} fallo(s).`);
  process.exit(1);
}
console.log("Suite rediseño Océano: OK\n");
