/** Columnas esperadas en Supabase para la hoja ETIQUETAS (STATUS) (como en el Excel). */
export const STATUS_COL_CURP = "CURP";

export const STATUS_FILAS_PROMEDIO = [
  "Promedio",
  "Promedio 2do",
  "Promedio 3ro",
  "Promedio 4to",
  "Promedio 5to",
  "Promedio 6to",
] as const;

export const STATUS_FILAS_MATERIAS = [
  "Materias reprobadas",
  "Materia 1",
  "Materia 2",
  "Materia 3",
  "Materia 4",
  "Materia 5 etc.",
] as const;

export type StatusFilaPromedio = (typeof STATUS_FILAS_PROMEDIO)[number];
export type StatusFilaMateria = (typeof STATUS_FILAS_MATERIAS)[number];

export const STATUS_TODAS_COLUMNAS_DATO = [
  ...STATUS_FILAS_PROMEDIO,
  ...STATUS_FILAS_MATERIAS,
] as const;

/** Etiquetas editables en ETIQUETAS PERSONALES (EMPTY1–3 = título, EMPTY4–6 = valor). */
export const PERSONALES_ETIQUETA_TITULO_KEYS = [
  "EMPTY1",
  "EMPTY2",
  "EMPTY3",
] as const;

export const PERSONALES_ETIQUETA_VALOR_KEYS = [
  "EMPTY4",
  "EMPTY5",
  "EMPTY6",
] as const;

export const PERSONALES_COL_COMENTARIO = "COMENTARIO PERSONAL";
