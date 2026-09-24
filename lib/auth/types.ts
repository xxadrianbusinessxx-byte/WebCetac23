/**
 * Los roles del portal, en UNA lista. La sesión (`session.ts`) acepta solo estos y
 * `rolesDe` los recorre: antes cada sitio los escribía a mano, y un rol nuevo
 * obligaba a encontrarlos todos.
 *
 * `administracion` (2026-09-24) es el personal de Administración escolar: una fila
 * normal de PROFESORES con `Permisos = 'Administracion'`, como el técnico. Gestiona
 * alumnos, tutores, trámites (reportes, constancias), documentos y mensajes; no
 * configura el ciclo ni califica.
 */
export const ROLES_PORTAL = ["alumno", "maestro", "directivo", "tutor", "tecnico", "administracion"] as const;

export type PortalRole = (typeof ROLES_PORTAL)[number];

export function esRolPortal(x: unknown): x is PortalRole {
  return typeof x === "string" && (ROLES_PORTAL as readonly string[]).includes(x);
}

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
