/**
 * permisos.ts — MATRIZ pura rol → capacidades (PROMPT-2/T1).
 *
 * Módulo SIN I/O ni Supabase: solo decide «¿este rol puede esta capacidad?».
 * La matriz que contiene es la de HOY (2026-09-06), deducida de la columna
 * «Guardia hoy» de `docs/sistema/MATRIZ-PERMISOS.md` §5 + la resolución T2
 * del PROMPT-2 (las 13 capacidades con guardias mezcladas). No es la matriz
 * de DESTINO de la §4 (esa se aplica en el prompt 3 con el rol técnico).
 *
 * Regla de oro del PROMPT-2: este prompt NO cambia ni un solo permiso. Si una
 * fila de esta matriz permitiera a un rol hacer algo que hoy no puede, es un
 * bug. La suite `scripts/test-permisos.mjs` lo verifica contra la §5.
 *
 * - Los roles que aquí no figuran para una capacidad la tienen DENEGADA.
 * - `portada.ver` es pública: no requiere sesión (exigir() lo permite).
 * - `accesoAlumno` y `nivelAccesoProfesor` NO viven aquí: son ortogonales
 *   (la capacidad dice QUÉ; ellos dicen SOBRE QUIÉN) y se conservan en las
 *   actions después de exigir().
 */

import type { PortalRole } from "./types";
import type { Capacidad } from "./capacidades";

/** Capacidades que no requieren sesión (hoy solo la portada pública). */
export const CAPACIDADES_PUBLICAS: ReadonlySet<Capacidad> = new Set(["portada.ver"]);

/** Matriz HOY: rol → capacidades que puede ejecutar. */
const MATRIZ_HOY: Record<PortalRole, ReadonlySet<Capacidad>> = {
  alumno: new Set<Capacidad>([
    "alumno.ver_perfil",
    "asistencia.ver_alumno",
    "calendario.ver",
    "calificacion.ver",
    "ciclo.ver",
    "horario.ver_alumno",
    "justificacion.solicitar",
    "justificacion.ver_propias",
    "portada.ver",
  ]),

  tecnico: new Set<Capacidad>([
    "alumno.borrar_roster", // PROMPT-4/T3
    "alumno.cargar_roster",
    "alumno.editar_datos_personales",
    "alumno.editar_etiquetas",
    "alumno.editar_estatus",
    "alumno.importar_estatus",
    "alumno.ver_perfil",
    "asignacion.ver",
    "asignacion.editar",
    "calendario.ver",
    "calendario.editar",
    "carga_academica.aplicar",
    "ciclo.ver",
    "ciclo.ver_contexto",
    "ciclo.ver_operativo",
    "ciclo.crear",
    "ciclo.editar",
    "ciclo.activar",
    "ciclo.eliminar",
    "ciclo.clonar_contexto",
    "ciclo.reparar_tabla_legacy",
    "ciclo.borrar_datos", // PROMPT-4/T4
    "documento.ver",
    "documento.subir",
    "documento.eliminar",
    "documento.gestionar_carpetas",
    "documento.asignar_permisos",
    "evaluacion.ver",
    "evaluacion.editar",
    "horario.descargar_plantilla",
    "horario.importar",
    "inscripcion.ver",
    "inscripcion.editar",
    "materia.ver_catalogo",
    "materia.editar_alias",
    "materia.activar_desactivar",
    "noticia.publicar",
    "portada.ver",
    "profesor.cambiar_clave_propia",
    "profesor.ver_credenciales_acceso",
    "profesor.forzar_cambio_clave",
    "semestre.ver",
    "semestre.activar",
    "tutor.ver_lista",
    "tutor.crear",
    "tutor.generar_automaticos",
    "tutor.cambiar_credenciales_propias",
  ]),

  tutor: new Set<Capacidad>([
    "alumno.editar_datos_personales",
    "alumno.editar_etiquetas",
    "alumno.ver_perfil",
    "asistencia.ver_alumno",
    "calendario.ver",
    "calificacion.ver",
    "ciclo.ver",
    "horario.ver_alumno",
    "justificacion.solicitar",
    "justificacion.ver_propias",
    "portada.ver",
    "tutor.cambiar_credenciales_propias",
    "tutor.ver_propio",
  ]),

  maestro: new Set<Capacidad>([
    "alumno.comentar",
    "alumno.ver_perfil",
    "asistencia.anular",
    "asistencia.subir",
    "asistencia.ver_alumno",
    "asistencia.ver_grupo",
    "calendario.ver",
    "calificacion.ver",
    "calificacion.subir",
    "calificacion.eliminar",
    "ciclo.ver",
    "ciclo.ver_operativo",
    "documento.ver",
    "documento.subir",
    "documento.eliminar",
    "horario.ver_grupo",
    "horario.ver_alumno",
    "horario.descargar_plantilla",
    "justificacion.solicitar",
    "justificacion.ver_propias",
    "materia.ver_catalogo",
    "materia.mapear_columnas",
    "materia.descargar_plantilla",
    "portada.ver",
    "profesor.cambiar_clave_propia",
  ]),

  directivo: new Set<Capacidad>([
    // T5 (PROMPT-3): directivo queda en LECTURA del catálogo y del ciclo
    // operativo; pierde la configuración. La §4 del documento es la fuente.
    "alumno.comentar",
    "alumno.editar_datos_personales",
    "alumno.editar_etiquetas",
    "alumno.editar_estatus",
    "alumno.ver_perfil",
    "asistencia.anular",
    // Fase 0 (rediseño Océano, 2026-09-10): AMPLIACIÓN decidida por el
    // responsable, no reparación de un descuido — antes la §4 decía X aquí.
    // El directivo sube asistencia sin depender de asignaciones (R-4).
    "asistencia.subir",
    "asistencia.ver_alumno",
    "asistencia.ver_grupo",
    "calendario.ver",
    "calificacion.ver",
    "calificacion.subir",
    "calificacion.eliminar",
    // Fase 0 (Océano): lectura de ciclos. Sin ella
    // actionListarCiclosEscolares rechazaba al directivo.
    "ciclo.ver",
    // ciclo.ver_operativo NO se mueve (T5.3): de ella depende toda la subida
    // de asistencia (actionObtenerCicloActual).
    "ciclo.ver_operativo",
    "documento.ver",
    "documento.subir",
    "documento.eliminar",
    "documento.gestionar_carpetas",
    "documento.asignar_permisos",
    "horario.descargar_plantilla",
    "horario.ver_alumno",
    "horario.ver_grupo",
    "justificacion.resolver",
    // Fase 0 (Océano): con solicitar + resolver, directivo puede pedir y
    // aprobar la misma justificación (supervisión global; intencionado).
    "justificacion.solicitar",
    "justificacion.ver_propias",
    "justificacion.ver_todas",
    "materia.descargar_plantilla",
    "materia.mapear_columnas",
    "materia.ver_catalogo",
    "noticia.publicar",
    "portada.ver",
    "profesor.cambiar_clave_propia",
    "semestre.ver",
    "tutor.cambiar_credenciales_propias",
    "tutor.ver_propio",
  ]),
};

/** ¿Puede `rol` ejecutar `capacidad`? rol null = sin sesión (solo públicas). */
export function puede(rol: PortalRole | null, capacidad: Capacidad): boolean {
  if (CAPACIDADES_PUBLICAS.has(capacidad)) return true;
  if (!rol) return false;
  return MATRIZ_HOY[rol]?.has(capacidad) ?? false;
}

/** Roles que pueden ejecutar una capacidad (para la UI y el informe). */
export function rolesDe(capacidad: Capacidad): PortalRole[] {
  if (CAPACIDADES_PUBLICAS.has(capacidad)) {
    return ["alumno", "maestro", "directivo", "tutor", "tecnico"];
  }
  return (Object.keys(MATRIZ_HOY) as PortalRole[]).filter((r) => MATRIZ_HOY[r]?.has(capacidad));
}

/** Acceso directo a la matriz (para la suite y el generador de informe). */
export function matrizHoy(): Record<PortalRole, Capacidad[]> {
  return (Object.keys(MATRIZ_HOY) as PortalRole[]).reduce(
    (acc, r) => {
      acc[r] = [...MATRIZ_HOY[r]!].sort();
      return acc;
    },
    {} as Record<PortalRole, Capacidad[]>,
  );
}


/** Comparaciones de rol permitidas FUERA de permisos.ts se hacen vía estos
 *  helpers: así el único sitio con `rol ===/!==` es este módulo (criterio de
 *  terminado §9.1 del PROMPT-2). Para el alcance de un registro (sobre quién)
 *  se conservan accesoAlumno / nivelAccesoProfesor tal cual.
 */
export function esRol(rol: PortalRole | null | undefined, esperado: PortalRole): boolean {
  return rol === esperado;
}

