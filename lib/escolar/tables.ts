/** Nombres exactos de tablas en Supabase (como en Name_of_archives_excels_CSVs). */
export const TABLA_ALUMNOS = "ALUMNOS";
export const TABLA_PROFESORES = "PROFESORES";
export const TABLA_COMENTARIOS = "COMENTARIOS";
export const TABLA_COMENTARIOS_PROFESORES = "COMENTARIOS PROFESORES";
export const TABLA_ETIQUETAS_STATUS = "ETIQUETAS (STATUS)";
export const TABLA_ETIQUETAS_PERSONALES = "ETIQUETAS PERSONALES";

export const COMENTARIO_MAX_LENGTH = 200;

/** Etiquetas de estatus (solo directivo). Se guardan en EMPTY1–3 de ETIQUETAS PERSONALES. */
export const ETIQUETAS_ESTATUS_KEYS = ["EMPTY1", "EMPTY2", "EMPTY3"] as const;

/** Etiquetas personales del alumno. */
export const ETIQUETAS_PERSONALES_KEYS = ["EMPTY4", "EMPTY5", "EMPTY6"] as const;

export const CLOUDINARY_FOLDER = "cetac23";
