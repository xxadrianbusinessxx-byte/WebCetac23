"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  actualizarRangoCiclo,
  crearCicloEscolar,
  guardarPeriodoEvaluacion,
  listarCiclosConEvaluaciones,
  setActivoCiclo,
  setActivoEvaluacion,
  type PeriodoEscolarRow,
  type PeriodoEvaluacionRow,
} from "@/lib/escolar/evaluaciones";
import { createClient } from "@/lib/supabase/server";

/**
 * FASE CICLO — Server Actions de administración de ciclos y parciales.
 *
 * SEGURIDAD: TODAS las operaciones validan rol `directivo` en servidor.
 * Nunca se elimina historial: activar/desactivar usa UPDATE activo.
 * Los rangos de fecha se validan en la capa de servicio (server-side).
 */

const NO_AUTORIZADO = {
  ok: false,
  error: "No autorizado: se requiere rol directivo.",
} as const;

export type CicloEvaluacionListado = {
  periodo: PeriodoEscolarRow;
  evaluaciones: PeriodoEvaluacionRow[];
};

export async function actionListarCiclosConEvaluaciones(): Promise<
  | { ok: true; ciclos: CicloEvaluacionListado[] }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const res = await listarCiclosConEvaluaciones(supabase);
  if (!res.ok) return res;
  return { ok: true, ciclos: res.ciclos };
}

export async function actionCrearCicloEscolar(input: {
  nombre: string;
  fechaInicio?: string;
  fechaFin?: string;
}): Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  return crearCicloEscolar(supabase, input);
}

export async function actionGuardarRangoCiclo(input: {
  periodoId: string;
  fechaInicio: string | null;
  fechaFin: string | null;
}): Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  return actualizarRangoCiclo(supabase, input.periodoId, {
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
  });
}

export async function actionSetActivoCiclo(
  periodoId: string,
  activo: boolean,
): Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  return setActivoCiclo(supabase, periodoId, activo);
}

export async function actionGuardarEvaluacion(input: {
  id?: string | null;
  periodoId: string;
  numero: number | string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  activo?: boolean;
}): Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  return guardarPeriodoEvaluacion(supabase, input);
}

export async function actionSetActivoEvaluacion(
  periodoId: string,
  evaluacionId: string,
  activo: boolean,
): Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  return setActivoEvaluacion(supabase, periodoId, evaluacionId, activo);
}
