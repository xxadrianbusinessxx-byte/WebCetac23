/**
 * capacidades.ts — LISTA CERRADA de capacidades del sistema (PROMPT-2/T1).
 *
 * Una capacidad dice QUÉ puede hacer un rol. El rol nunca se pregunta en
 * app/actions: cada action declara la capacidad que exige con `exigir()` y la
 * matriz `rol → capacidades` vive en `lib/auth/permisos.ts` (módulo puro).
 *
 * La lista sale de la §5 de `docs/sistema/MATRIZ-PERMISOS.md` (inventario
 * generado, 2026-09-06) + las capacidades nuevas que resultaron de la
 * resolución T2 del PROMPT-2 (divisiones documentadas en §4 del documento):
 *   - `ciclo.ver_contexto`        (ver contexto académico y detalle admin del
 *     ciclo; hoy solo directivo);
 *   - `ciclo.ver_operativo`       (leer el nombre del ciclo operativo; hoy
 *     directivo/maestro);
 *   - `horario.descargar_plantilla` (descargar la plantilla de horario; hoy
 *     directivo/maestro — separada de `horario.importar` que es solo directivo).
 *
 * Que TypeScript rechace una capacidad inventada es medio trabajo hecho: si una
 * action exige una capacidad que no está aquí, no compila.
 */

export const CAPACIDADES = [
  // Alumno
  "alumno.ver_perfil",
  "alumno.editar_datos_personales",
  "alumno.editar_etiquetas",
  "alumno.editar_estatus",
  "alumno.comentar",
  "alumno.importar_estatus",
  "alumno.cargar_roster",
  "alumno.borrar_roster", // PROMPT-4/T3: sacar del roster (previsualizar→confirmar)
  "alumno.ver_expediente", // 2026-09-24: buscar a CUALQUIER alumno y abrir su expediente
  // Asignaciones profesor → materia
  "asignacion.ver",
  "asignacion.editar",
  // Asistencia
  "asistencia.subir",
  "asistencia.anular",
  "asistencia.ver_grupo",
  "asistencia.ver_alumno",
  // Calendario
  "calendario.ver",
  "calendario.editar",
  // Calificaciones
  "calificacion.ver",
  "calificacion.subir",
  "calificacion.eliminar",
  // Carga académica
  "carga_academica.aplicar",
  // Ciclo
  "ciclo.ver",
  "ciclo.ver_contexto",
  "ciclo.ver_operativo",
  "ciclo.crear",
  "ciclo.editar",
  "ciclo.activar",
  "ciclo.eliminar",
  "ciclo.clonar_contexto",
  "ciclo.reparar_tabla_legacy",
  "ciclo.borrar_datos", // PROMPT-4/T4: deshacer los datos de un paso del configurador
  // Documentos
  "documento.ver",
  "documento.subir",
  "documento.eliminar",
  "documento.gestionar_carpetas",
  "documento.asignar_permisos",
  // Evaluaciones (parciales)
  "evaluacion.ver",
  "evaluacion.editar",
  // Horario
  "horario.importar",
  "horario.descargar_plantilla",
  "horario.ver_grupo",
  "horario.ver_alumno",
  // Inscripciones
  "inscripcion.ver",
  "inscripcion.editar",
  // Justificaciones
  "justificacion.solicitar",
  "justificacion.ver_propias",
  "justificacion.ver_todas",
  "justificacion.resolver",
  // Materias
  "materia.ver_catalogo",
  "materia.editar_alias",
  "materia.activar_desactivar",
  "materia.mapear_columnas",
  "materia.descargar_plantilla",
  // Noticias / portada
  // ── UIs pendientes (2026-09-17) ──────────────────────────────────────────
  // Capacidades de las pantallas que el diseño dibujaba y el sistema no
  // soportaba. Se añaden juntas porque son un solo cambio de alcance.
  //
  // Actividades — tareas por materia, con entrega del alumno.
  "actividad.ver",
  "actividad.editar",
  "actividad.entregar",
  // Reportes disciplinarios. `anular` va aparte de `crear` porque anular toca
  // el historial de un alumno y no es lo mismo que levantar un reporte.
  "reporte.ver",
  "reporte.crear",
  "reporte.anular",
  // Citas. Una entidad, dos lados: quien la pide y quien la resuelve.
  "cita.ver_propias",
  "cita.solicitar",
  "cita.gestionar",
  // Constancias (Recursos administrativos).
  "constancia.solicitar",
  "constancia.gestionar",
  // Buzón: alumnos y tutores escriben, la dirección lee.
  "buzon.enviar",
  "buzon.ver",
  // Mensajes internos entre personal. NO es el chat global retirado.
  "mensaje_interno.usar",
  "noticia.publicar",
  "portada.ver",
  // Profesores
  "profesor.cambiar_clave_propia",
  "profesor.ver_credenciales_acceso",
  "profesor.forzar_cambio_clave",
  // Semestres
  "semestre.ver",
  "semestre.activar",
  // Tutores
  "tutor.ver_lista",
  "tutor.crear",
  "tutor.generar_automaticos",
  "tutor.ver_propio",
  "tutor.cambiar_credenciales_propias",
] as const;

export type Capacidad = (typeof CAPACIDADES)[number];
