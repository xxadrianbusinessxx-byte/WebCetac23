export type PortalRole = "alumno" | "maestro" | "directivo" | "tutor";

export type PortalSessionPayload = {
  matricula: string;
  rol: PortalRole;
  curp?: string;
  nombre?: string;
  /** C4.10 — Identidad ESTRUCTURAL del profesor (PROFESORES.ID). Solo en
   *  sesiones de profesor/directivo autenticadas desde PROFESORES. Nunca se
   *  resuelve desde CLAVE (ambigua). matricula permanece como histórico. */
  profesorId?: number;
  /** BLOQUE 9 (PIEZA 5) — true = el profesor/directivo debe cambiar su clave
   *  antes de usar el portal (cambio forzado). Solo profesor/directivo. */
  debeCambiarCredenciales?: boolean;
};
