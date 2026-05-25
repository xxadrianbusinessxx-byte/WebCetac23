/** Bucket de Storage para hojas de calificaciones (Excel / CSV). */
export const CALIFICACIONES_BUCKET = "calificaciones";

/** Tabla de metadatos del archivo activo por materia. */
export const CALIFICACIONES_TABLE = "archivos_calificaciones";

export const CALIFICACIONES_MIME = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
} as const;

export const EXTENSIONES_PERMITIDAS = ["csv", "xlsx", "xls"] as const;

export type ExtensionCalificaciones = (typeof EXTENSIONES_PERMITIDAS)[number];
