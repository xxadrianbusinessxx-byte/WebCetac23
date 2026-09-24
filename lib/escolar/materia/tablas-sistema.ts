/**
 * tablas-sistema.ts — MÓDULO PURO. La ÚNICA lista de tablas de Supabase que NO son
 * materias.
 *
 * El descubrimiento de materias (`tablas-supabase.ts`) es NEGATIVO: toda tabla
 * expuesta que no esté aquí se trata como materia y sale en los selectores. Así
 * que una tabla nueva que no se añada aquí aparece en el selector de materias, en
 * silencio. Pasó: el 2026-09-23 había diez colándose (buzón, citas, reportes,
 * constancias…), siete de ellas de las UIs del 17 de septiembre.
 *
 * Dos defensas, y las dos dependen de que esta lista sea UNA:
 *   · la usan la app (`tablas-supabase.ts`) y el generador de listas
 *     (`scripts/gen-tablas-desde-supabase.mjs`). Antes cada uno tenía su copia y
 *     ya no coincidían (la del script no conocía la portada);
 *   · la regla C15 de `test-orden.mjs` falla si una tabla que crea un
 *     `supabase/*.sql` o que declara `lib/escolar/tables.ts` no está aquí.
 *
 * Las materias legacy siguen el patrón `1ROAMAT001` (grado + grupo + MAT + tres
 * dígitos) y los registros finales contienen «REGISTRO DE CALIFICACIONES
 * FINALES»; ninguno de los dos va en esta lista.
 */
import {
  TABLA_ACTIVIDAD_ENTREGAS,
  TABLA_ACTIVIDADES,
  TABLA_ALUMNO_ETIQUETAS,
  TABLA_ALUMNOS,
  TABLA_ASIGNACIONES_PROFESOR,
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_ASISTENCIA_TRASPASOS_HISTORICO,
  TABLA_BUZON_MENSAJES,
  TABLA_CALENDARIO_ESCOLAR,
  TABLA_CARPETAS,
  TABLA_CARRERAS,
  TABLA_CICLO_TRANSICIONES,
  TABLA_CITAS,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_COMENTARIOS,
  TABLA_COMENTARIOS_PROFESORES,
  TABLA_CONFIGURACION_CLASES_PROFESOR,
  TABLA_DOCUMENTOS,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_ETIQUETAS_STATUS,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_HORARIO_SEMANAL,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  TABLA_MATERIAS,
  TABLA_MENSAJES_INTERNOS,
  TABLA_MENSAJES_JUSTIFICACION,
  TABLA_PERIODOS,
  TABLA_PERIODOS_EVALUACION,
  TABLA_PERMISOS_CARPETAS,
  TABLA_PORTADA_AJUSTES,
  TABLA_PORTADA_MEDIOS,
  TABLA_PROFESORES,
  TABLA_REPORTES_ALUMNO,
  TABLA_SEMESTRES,
  TABLA_SOLICITUDES_CONSTANCIA,
  TABLA_TUTOR_ALUMNOS,
  TABLA_TUTOR_CREDENCIALES_INICIALES,
  TABLA_TUTORES,
} from "../tables.ts";

export const TABLAS_SISTEMA: readonly string[] = [
  // Personas y su estado.
  TABLA_ALUMNOS,
  TABLA_PROFESORES,
  TABLA_COMENTARIOS,
  TABLA_COMENTARIOS_PROFESORES,
  TABLA_ETIQUETAS_PERSONALES,
  TABLA_ETIQUETAS_STATUS,
  TABLA_ALUMNO_ETIQUETAS,
  "BOLETA",
  "mensajes_chat",
  // Catálogo académico (FASE C1): oferta y relaciones.
  TABLA_PERIODOS,
  TABLA_CARRERAS,
  TABLA_MATERIAS,
  TABLA_GRUPOS,
  TABLA_GRUPO_MATERIAS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_ASIGNACIONES_PROFESOR,
  TABLA_SEMESTRES,
  "materias_nombres_visibles",
  "materias_mapeo_columnas",
  // C4.28 — almacenes internos: documentos, tutores, asistencia, justificaciones.
  TABLA_CARPETAS,
  TABLA_DOCUMENTOS,
  TABLA_PERMISOS_CARPETAS,
  TABLA_CALENDARIO_ESCOLAR,
  TABLA_CLASES_IMPARTIDAS,
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_ASISTENCIA_TRASPASOS_HISTORICO,
  TABLA_CONFIGURACION_CLASES_PROFESOR,
  TABLA_HORARIO_SEMANAL,
  TABLA_PERIODOS_EVALUACION,
  TABLA_TUTORES,
  TABLA_TUTOR_ALUMNOS,
  TABLA_TUTOR_CREDENCIALES_INICIALES,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  TABLA_MENSAJES_JUSTIFICACION,
  TABLA_CICLO_TRANSICIONES,
  // UIs pendientes (2026-09-17): se colaban como materias hasta el 2026-09-24.
  TABLA_ACTIVIDADES,
  TABLA_ACTIVIDAD_ENTREGAS,
  TABLA_REPORTES_ALUMNO,
  TABLA_CITAS,
  TABLA_SOLICITUDES_CONSTANCIA,
  TABLA_BUZON_MENSAJES,
  TABLA_MENSAJES_INTERNOS,
  // Portada pública (PROMPT L).
  TABLA_PORTADA_MEDIOS,
  TABLA_PORTADA_AJUSTES,
];

/** Registros de calificaciones finales por grupo: tampoco son materias. */
export const PATRON_REGISTRO_FINAL = /REGISTRO DE CALIFICACIONES FINALES/i;

const SISTEMA = new Set(TABLAS_SISTEMA);

export function esTablaSistema(nombre: string): boolean {
  return SISTEMA.has(nombre);
}

/** ¿Esta tabla se ofrece como materia? Ni sistema ni registro final. */
export function esTablaMateria(nombre: string): boolean {
  return !SISTEMA.has(nombre) && !PATRON_REGISTRO_FINAL.test(nombre);
}
