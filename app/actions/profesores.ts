"use server";

import { setPortalSessionCookie } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/exigir";
import {
  cambiarClaveProfesor,
  cambiarDebeCambiarCredencialesProfesor,
  listarProfesores,
  nombreProfesor,
  reponerClaveAccesoProfesor,
  resolverProfesorIdPorClave,
  validarObjetivoPermitidoParaTecnico,
} from "@/lib/escolar/catalogo/profesores";
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
  const g = await exigir("profesor.cambiar_clave_propia");
  if (!g.ok) {
    return { ok: false, error: "No autorizado." };
  }
  const sesion = g.sesion!;

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
    profesorId = await resolverProfesorIdPorClave(supabase, sesion.matricula);
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

/**
 * PROMPT-3/T4.2 — El técnico repone la clave de INICIO DE SESIÓN de un
 * profesor puntual (acceso perdido). Frontera literal del rol: ve/regenera la
 * clave web; NUNCA PROFESORES.ID como llave maestra de la base ni credenciales
 * de Supabase. La identidad del objetivo es PROFESORES.ID (única no ambigua);
 * la nueva clave se marca con `debe_cambiar_credenciales = true` para que el
 * profesor la cambie en el primer acceso (autoservicio, A4).
 */
export async function actionReponerClaveAccesoProfesor(
  profesorId: unknown,
  nuevaClave: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await exigir("profesor.ver_credenciales_acceso");
  if (!g.ok) {
    return { ok: false, error: "No autorizado." };
  }

  const id = Number(profesorId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Profesor no válido." };
  }
  const clave = String(nuevaClave ?? "").trim();
  if (clave.length < CLAVE_PROFESOR_MIN) {
    return {
      ok: false,
      error: `La nueva clave debe tener al menos ${CLAVE_PROFESOR_MIN} caracteres.`,
    };
  }

  const supabase = await createClient();
  const frontera = await validarObjetivoPermitidoParaTecnico(supabase, g.sesion!.rol, id);
  if (!frontera.ok) return { ok: false, error: frontera.error ?? "No autorizado." };

  return reponerClaveAccesoProfesor(supabase, id, clave);
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
  const g = await exigir("profesor.ver_credenciales_acceso");
  if (!g.ok) {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }
  const actor = g.sesion!.rol;

  const supabase = await createClient();
  const rows = await listarProfesores(supabase);
  const visibles =
    actor === "tecnico"
      ? // Frontera PROMPT-3/T4: el técnico solo ve/repones claves de cuentas de
        // rol maestro (quienes imparten). Nunca directivo ni otro técnico.
        rows.filter((p) =>
          String(p.Permisos ?? "").trim().toLowerCase().includes("profesor"),
        )
      : rows;
  return {
    ok: true,
    profesores: visibles.map((p) => ({
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
  const g = await exigir("profesor.forzar_cambio_clave");
  if (!g.ok) {
    return { ok: false, error: "No autorizado: se requiere rol directivo." };
  }

  const id = Number(profesorId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Profesor no válido." };
  }

  const supabase = await createClient();
  const frontera = await validarObjetivoPermitidoParaTecnico(supabase, g.sesion!.rol, id);
  if (!frontera.ok) return { ok: false, error: frontera.error ?? "No autorizado." };

  return cambiarDebeCambiarCredencialesProfesor(supabase, id, Boolean(valor));
}
