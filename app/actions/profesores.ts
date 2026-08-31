"use server";

import { setPortalSessionCookie } from "@/lib/auth/session";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  cambiarClaveProfesor,
  listarProfesores,
  nombreProfesor,
} from "@/lib/escolar/profesores";
import { TABLA_PROFESORES } from "@/lib/escolar/tables";
import { createClient } from "@/lib/supabase/server";

/**
 * BLOQUE 9 (PIEZA 5) — Cambio forzado de credenciales de PROFESORES/DIRECTIVOS.
 *
 * Decisión confirmada: la CLAVE se sigue almacenando en TEXTO PLANO (mismo
 * formato que hoy). Este bloque SOLO agrega el flag `debe_cambiar_credenciales`
 * y el flujo de cambio forzado; NO migra el almacenamiento.
 */

/** Longitud mínima simple de la nueva clave (texto plano por ahora). */
const CLAVE_PROFESOR_MIN = 6;

/**
 * El profesor/directivo autenticado cambia SU PROPIA clave (SOLO para sí
 * mismo). Escribe la nueva CLAVE en texto plano y pone
 * `debe_cambiar_credenciales = false`.
 *
 * Identidad: `sesion.profesorId` (PROFESORES.ID, estructural). Para sesiones
 * legacy sin profesorId se resuelve la primera coincidencia por CLAVE y se
 * actualiza SOLO esa fila (nunca en masa — CLAVE es ambigua: 4321 ×15).
 */
export async function actionCambiarClaveProfesor(
  nuevaClave: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (!sesion || (sesion.rol !== "maestro" && sesion.rol !== "directivo")) {
    return { ok: false, error: "No autorizado." };
  }

  const clave = nuevaClave.trim();
  if (clave.length < CLAVE_PROFESOR_MIN) {
    return {
      ok: false,
      error: `La nueva clave debe tener al menos ${CLAVE_PROFESOR_MIN} caracteres.`,
    };
  }

  const supabase = await createClient();

  let profesorId = typeof sesion.profesorId === "number" ? sesion.profesorId : null;
  if (profesorId === null) {
    const { data } = await supabase
      .from(TABLA_PROFESORES)
      .select("ID")
      .eq("CLAVE", sesion.matricula)
      .limit(1);
    profesorId = data?.[0]?.ID ?? null;
  }
  if (profesorId === null) {
    return { ok: false, error: "No se encontró tu registro de profesor." };
  }

  const r = await cambiarClaveProfesor(supabase, profesorId, clave);
  if (!r.ok) return r;

  // Limpiar el flag en la sesión (cookie) para que la UI vuelva al panel.
  await setPortalSessionCookie({ ...sesion, debeCambiarCredenciales: false });
  return { ok: true };
}

export type ProfesorCredencial = {
  id: number;
  nombre: string;
  permisos: string;
  debeCambiarCredenciales: boolean;
};

/**
 * Lista los profesores/directivos con su flag de cambio forzado (solo
 * directivo). Usado por el panel del directivo para activar/desactivar el
 * flag por profesor.
 */
export async function actionListarProfesoresCredenciales(): Promise<
  | { ok: true; profesores: ProfesorCredencial[] }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }

  const supabase = await createClient();
  const rows = await listarProfesores(supabase);
  return {
    ok: true,
    profesores: rows.map((p) => ({
      id: p.ID,
      nombre: nombreProfesor(p),
      permisos: p.Permisos,
      debeCambiarCredenciales: Boolean(p.debe_cambiar_credenciales),
    })),
  };
}

/**
 * Activa/desactiva el flag `debe_cambiar_credenciales` de un profesor (solo
 * directivo). Para cuando la administración decida forzar el cambio a alguien
 * puntual. La identidad es SIEMPRE PROFESORES.ID.
 */
export async function actionCambiarDebeCambiarCredencialesProfesor(
  profesorId: unknown,
  valor: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }

  const id = Number(profesorId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Profesor no válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABLA_PROFESORES)
    .update({ debe_cambiar_credenciales: Boolean(valor) })
    .eq("ID", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
