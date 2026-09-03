"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  listarPeriodos,
  resumenCicloParaAdmin,
  resolverEstadoPeriodo,
  type AsuntoIntegridad,
  type ConteosCiclo,
} from "@/lib/escolar/ciclo-estado";
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

/** Fila del listado F2: estado conceptual + compatibilidad `activo`. */
export type CicloAdminListado = {
  id: string;
  nombre: string;
  activo: boolean;
  estado: string;
  esquema: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
};

/** Detalle F2 de un ciclo: conteos + integridad (validación F1). */
export type DetalleCicloAdmin = {
  estado: string;
  esquema: boolean;
  activo: boolean;
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  conteos: ConteosCiclo;
  ok: boolean;
  errores: AsuntoIntegridad[];
  advertencias: AsuntoIntegridad[];
};

/** Listado ligero (sin datos académicos por fila): estado + fechas. */
export async function actionListarCiclosAdmin(): Promise<
  { ok: true; ciclos: CicloAdminListado[] } | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const { filas, esquema, error } = await listarPeriodos(supabase);
  if (error) return { ok: false, error };
  return {
    ok: true,
    ciclos: filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      activo: Boolean(f.activo),
      estado: resolverEstadoPeriodo(f),
      esquema,
      fecha_inicio: f.fecha_inicio ?? null,
      fecha_fin: f.fecha_fin ?? null,
    })),
  };
}

/** Detalle + validación de integridad de un ciclo (bajo demanda). */
export async function actionDetalleCicloAdmin(periodoId: string): Promise<
  { ok: true; detalle: DetalleCicloAdmin } | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const r = await resumenCicloParaAdmin(supabase, periodoId);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    detalle: {
      estado: r.estado,
      esquema: r.esquema,
      activo: Boolean(r.periodo.activo),
      nombre: r.periodo.nombre,
      fecha_inicio: r.periodo.fecha_inicio ?? null,
      fecha_fin: r.periodo.fecha_fin ?? null,
      conteos: r.conteos,
      ok: r.validacion.ok,
      errores: r.validacion.errores,
      advertencias: r.validacion.advertencias,
    },
  };
}

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
