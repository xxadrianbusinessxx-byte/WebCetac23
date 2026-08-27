"use server";

/**
 * C4.14 — SERVER ACTIONS DE ADMINISTRACIÓN DE OFERTA POR SEMESTRE.
 *
 * SEGURIDAD:
 *   - El ACTOR autenticado sale SIEMPRE de obtenerSesionPortal() + rol
 *     directivo. Nunca del cliente.
 *   - El OBJETIVO (periodoId, semestre) se valida server-side (UUID, entero
 *     1..12, periodo existente y activo).
 *   - Desactivar = UPDATE activo=false (nunca DELETE; historial conservado).
 *   - Sin service_role en Client Components; RLS pública deliberada.
 */
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import {
  listarSemestresOferta,
  setEstadoSemestre,
} from "@/lib/escolar/semestres";

const NO_AUTORIZADO = {
  ok: false,
  error: "No autorizado: se requiere rol directivo.",
} as const;

/** Lista la oferta por semestre del periodo activo (solo directivo). */
export async function actionListarSemestresOferta() {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  return listarSemestresOferta(supabase);
}

/** Activa la oferta de un semestre en un periodo (solo directivo). */
export async function actionActivarSemestre(
  periodoId: unknown,
  semestre: unknown,
) {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  return setEstadoSemestre(supabase, periodoId, semestre, true);
}

/** Desactiva la oferta de un semestre (UPDATE activo=false; nunca DELETE). */
export async function actionDesactivarSemestre(
  periodoId: unknown,
  semestre: unknown,
) {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;

  const supabase = await createClient();
  return setEstadoSemestre(supabase, periodoId, semestre, false);
}
