/**
 * exigir.ts — capa con I/O entre la Server Action y la matriz pura (PROMPT-2/T1).
 *
 * Lee la cookie firmada con `obtenerSesionPortal()`, aplica `puede()` de
 * `permisos.ts` y devuelve:
 *   - `{ ok: true, sesion }`  si la sesión es válida Y el rol tiene la capacidad
 *     (para capacidades públicas devuelve la sesión aunque sea null);
 *   - `{ ok: false, error }`  con el error estándar.
 *
 * Es el ÚNICO sitio donde las Server Actions piden autorización por capacidad.
 * Una action migrada queda así:
 *
 *   const g = await exigir("asignacion.editar");
 *   if (!g.ok) return { ok: false, error: g.error };
 *   const sesion = g.sesion;
 *
 * NO contiene lógica de rol ni de capacidad: esa vive en `permisos.ts`.
 */

import type { Capacidad } from "./capacidades.ts";
import { CAPACIDADES_PUBLICAS, puede } from "./permisos.ts";
import { obtenerSesionPortal } from "./session-server.ts";
import type { PortalSessionPayload } from "./types.ts";

export const ERROR_NO_AUTORIZADO = "No tienes permiso.";

export type ResultadoExigir =
  | { ok: true; sesion: PortalSessionPayload | null }
  | { ok: false; error: string };

/** Verifica sesión + capacidad. Para públicas no exige sesión. */
export async function exigir(capacidad: Capacidad): Promise<ResultadoExigir> {
  const sesion = await obtenerSesionPortal();
  if (CAPACIDADES_PUBLICAS.has(capacidad)) {
    return { ok: true, sesion };
  }
  if (!sesion) return { ok: false, error: ERROR_NO_AUTORIZADO };
  if (!puede(sesion.rol, capacidad)) {
    return { ok: false, error: ERROR_NO_AUTORIZADO };
  }
  return { ok: true, sesion };
}
