"use server";

import { exigir } from "@/lib/auth/exigir";
import { listarPeriodosSimple } from "@/lib/escolar/ciclo/ciclo-estado";
import {
  cargarMateriasDesdeCatalogo,
  clonarContextoAcademico,
  repararTablaLegacyDePeriodo,
  validarPeriodosReparacion,
  verContextoAcademicoPeriodo,
  type ContextoAcademicoPeriodo,
  type ResultadoCargaMateriasCatalogo,
  type ResultadoClonContexto,
  type ResultadoRepararTablaLegacy,
} from "@/lib/escolar/ciclo/contexto-ciclo";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * FASE CONSOLIDACIÓN — Server Actions del CONTEXTO ACADÉMICO DEL CICLO.
 *
 * Permite al directivo copiar la estructura (grupos + oferta de materias) de
 * un ciclo existente hacia un ciclo nuevo, reutilizando carreras/materias por
 * su ID. Así, un periodo recién creado puede trabajar con el catálogo sin
 * reconstruir manualmente grupos ni materias.
 * SEGURIDAD: todas las operaciones validan rol `directivo` en servidor.
 */

const NO_AUTORIZADO = {
  ok: false,
  error: "No autorizado: se requiere rol directivo.",
} as const;

export type PeriodoSimple = {
  id: string;
  nombre: string;
  activo: boolean;
};

export async function actionListarPeriodosContexto(): Promise<
  | { ok: true; periodos: PeriodoSimple[] }
  | { ok: false; error: string }
> {
  const g = await exigir("ciclo.ver_contexto");
  if (!g.ok) return NO_AUTORIZADO;
  const supabase = await createClient();
  const r = await listarPeriodosSimple(supabase);
  if (!r.ok) return { ok: false, error: r.error ?? "Sin ciclos." };
  return { ok: true, periodos: r.periodos };
}

export async function actionVerContextoAcademico(
  periodoId: string,
): Promise<
  | { ok: true; contexto: ContextoAcademicoPeriodo | null }
  | { ok: false; error: string }
> {
  const g = await exigir("ciclo.ver_contexto");
  if (!g.ok) return NO_AUTORIZADO;
  const supabase = await createClient();
  const res = await verContextoAcademicoPeriodo(supabase, periodoId);
  if (!res.ok) return res;
  return { ok: true, contexto: res.contexto };
}

export async function actionClonarContextoAcademico(
  periodoDestinoId: string,
  periodoOrigenId: string,
): Promise<ResultadoClonContexto> {
  const g = await exigir("ciclo.clonar_contexto");
  if (!g.ok) {
    return {
      ok: false,
      error: "No autorizado: se requiere rol directivo.",
      gruposCreados: 0,
      gruposYaExistentes: 0,
      materiasVinculadas: 0,
      materiasOmitidas: 0,
      materiasSinTablaLegacy: 0,
    };
  }
  const supabase = await createClient();
  return clonarContextoAcademico(supabase, {
    periodoOrigenId,
    periodoDestinoId,
  });
}

/**
 * Carga las materias del catálogo legacy (misma fuente que el panel de
 * materias: listarNombresVisiblesMaterias) hacia un ciclo DESTINO, creando los
 * grupos que falten y vinculando grupo_materias solo donde no existía la pareja.
 * SEGURIDAD: rol `directivo` (mismo patrón que actionClonarContextoAcademico).
 */
export async function actionCargarMateriasDesdeCatalogo(
  periodoDestinoId: string,
): Promise<ResultadoCargaMateriasCatalogo> {
  const g = await exigir("ciclo.clonar_contexto");
  if (!g.ok) {
    return {
      ok: false,
      error: "No autorizado: se requiere rol directivo.",
      gruposCreados: 0,
      gruposYaExistentes: 0,
      materiasVinculadas: 0,
      materiasYaVinculadas: 0,
      materiasCatalogoCreadas: 0,
      sinInterpretar: 0,
    };
  }
  const supabase = await createClient();
  return cargarMateriasDesdeCatalogo(supabase, periodoDestinoId);
}

const REPARAR_VACIO = {
  ok: false,
  match: 0,
  yaTiene: 0,
  sinOrigen: 0,
  ambiguos: 0,
  aplicados: 0,
  error: "No autorizado: se requiere rol directivo.",
} as const;

/**
 * Preview de la reparación de `tabla_legacy` (NO escribe): devuelve cuántas
 * filas son match / ya_tiene / sin_origen / ambiguos para el par
 * (periodoDestinoId ← periodoOrigenId).
 */
export async function actionPrevisualizarRepararTablaLegacy(
  periodoDestinoId: string,
  periodoOrigenId: string,
): Promise<ResultadoRepararTablaLegacy> {
  const g = await exigir("ciclo.reparar_tabla_legacy");
  if (!g.ok) {
    return { ...REPARAR_VACIO };
  }
  const supabase = await createClient();
  const valido = await validarPeriodosReparacion(supabase, [
    periodoDestinoId,
    periodoOrigenId,
  ]);
  if (!valido.ok) {
    return { ...REPARAR_VACIO, error: valido.error };
  }
  return repararTablaLegacyDePeriodo(supabase, {
    periodoDestinoId,
    periodoOrigenId,
    soloPlan: true,
  });
}

/**
 * Aplica la reparación de `tabla_legacy` (UPDATE solo de filas match con la
 * columna hoy NULL). Idempotente. Solo rol `directivo`.
 */
export async function actionRepararTablaLegacy(
  periodoDestinoId: string,
  periodoOrigenId: string,
): Promise<ResultadoRepararTablaLegacy> {
  const g = await exigir("ciclo.reparar_tabla_legacy");
  if (!g.ok) {
    return { ...REPARAR_VACIO };
  }
  const supabase = await createClient();
  const valido = await validarPeriodosReparacion(supabase, [
    periodoDestinoId,
    periodoOrigenId,
  ]);
  if (!valido.ok) {
    return { ...REPARAR_VACIO, error: valido.error };
  }
  // FIX RLS (mismo patrón que app/actions/documentos.ts): la ESCRITURA usa
  // service role para no chocar con las políticas de RLS de `grupo_materias`.
  // La autorización real ya se validó arriba (rol directivo + periodos reales).
  const escritura = createServiceClient() ?? supabase;
  return repararTablaLegacyDePeriodo(escritura, {
    periodoDestinoId,
    periodoOrigenId,
  });
}
