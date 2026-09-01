/** Nombres exactos de tablas en Supabase (como en Name_of_archives_excels_CSVs). */
export const TABLA_ALUMNOS = "ALUMNOS";
export const TABLA_PROFESORES = "PROFESORES";
export const TABLA_COMENTARIOS = "COMENTARIOS";
export const TABLA_COMENTARIOS_PROFESORES = "COMENTARIOS PROFESORES";
export const TABLA_ETIQUETAS_STATUS = "ETIQUETAS (STATUS)";
export const TABLA_ETIQUETAS_PERSONALES = "ETIQUETAS PERSONALES";
export const TABLA_CARPETAS = "CARPETAS";
export const TABLA_DOCUMENTOS = "DOCUMENTOS";
export const TABLA_PERMISOS_CARPETAS = "PERMISOS CARPETAS";
export const TABLA_CALENDARIO_ESCOLAR = "calendario_escolar";
export const TABLA_CLASES_IMPARTIDAS = "clases_impartidas";
export const TABLA_ASISTENCIA_ALUMNOS = "asistencia_alumnos";
export const TABLA_CONFIGURACION_CLASES_PROFESOR = "configuracion_clases_profesor";
export const TABLA_TUTORES = "tutores";
export const TABLA_TUTOR_ALUMNOS = "tutor_alumnos";
export const TABLA_TUTOR_CREDENCIALES_INICIALES = "tutor_credenciales_iniciales";
export const TABLA_JUSTIFICACIONES_ASISTENCIA = "justificaciones_asistencia";
/** C4.25 — Mensajes administrativos directivo → tutor asociados a una justificación. */
export const TABLA_MENSAJES_JUSTIFICACION = "mensajes_justificacion";

/** Catálogo académico (FASE C1). Tablas nuevas; ver supabase/crear-tablas-catalogo-academico.sql. */
export const TABLA_PERIODOS = "periodos";
export const TABLA_CARRERAS = "carreras";
export const TABLA_MATERIAS = "materias";
export const TABLA_GRUPOS = "grupos";
export const TABLA_GRUPO_MATERIAS = "grupo_materias";
export const TABLA_INSCRIPCIONES_ALUMNO = "inscripciones_alumno";
export const TABLA_ASIGNACIONES_PROFESOR = "asignaciones_profesor";
/** C4.14 — Estado activo/inactivo de la oferta por semestre (grado) y periodo. */
export const TABLA_SEMESTRES = "academico_semestres";

/** FASE 2 — Módulo etiquetas dinámicas (alumno_etiquetas). */
export const TABLA_ALUMNO_ETIQUETAS = "alumno_etiquetas";




/** Tipos de día del calendario escolar (columna `tipo`). */
export const TIPOS_DIA_CALENDARIO = [
  "clase",
  "festivo",
  "mantenimiento",
  "descanso",
] as const;
export type TipoDiaCalendario = (typeof TIPOS_DIA_CALENDARIO)[number];


/** Bucket de Storage para documentos institucionales. */

export const BUCKET_DOCUMENTOS = "documentos-institucionales";

/** Niveles de permiso sobre una carpeta (heredados a subcarpetas). */
export const NIVELES_PERMISO = ["ver", "subir", "eliminar"] as const;
export type NivelPermiso = (typeof NIVELES_PERMISO)[number];

/** Tamaño máximo por archivo (20MB). */
export const DOCUMENTO_MAX_BYTES = 20 * 1024 * 1024;


export const COMENTARIO_MAX_LENGTH = 200;

/** Títulos de etiquetas personales (ETIQUETAS PERSONALES, EMPTY1–3). */
export const ETIQUETAS_ESTATUS_KEYS = ["EMPTY1", "EMPTY2", "EMPTY3"] as const;

/** Valores de etiquetas personales (ETIQUETAS PERSONALES, EMPTY4–6). */
export const ETIQUETAS_PERSONALES_KEYS = ["EMPTY4", "EMPTY5", "EMPTY6"] as const;

export const CLOUDINARY_FOLDER = "cetac23";
