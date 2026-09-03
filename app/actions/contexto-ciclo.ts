"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  cargarMateriasDesdeCatalogo,
  clonarContextoAcademico,
  verContextoAcademicoPeriodo,
  type ContextoAcademicoPeriodo,
  type ResultadoCargaMateriasCatalogo,
  type ResultadoClonContexto,
} from "@/lib/escolar/contexto-ciclo";
import { TABLA_PERIODOS } from "@/lib/escolar/tables";
import { createClient } from "@/lib/supabase/server";

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
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre, activo")
    .order("created_at", { ascending: false });
  if (error || !data) return { ok: false, error: error?.message ?? "Sin ciclos." };
  return {
    ok: true,
    periodos: (data as PeriodoSimple[]).map((p) => ({
      ...p,
      nombre: p.nombre,
    })),
  };
}

export async function actionVerContextoAcademico(
  periodoId: string,
): Promise<
  | { ok: true; contexto: ContextoAcademicoPeriodo | null }
  | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") return NO_AUTORIZADO;
  const supabase = await createClient();
  const res = await verContextoAcademicoPeriodo(supabase, periodoId);
  if (!res.ok) return res;
  return { ok: true, contexto: res.contexto };
}

export async function actionClonarContextoAcademico(
  periodoDestinoId: string,
  periodoOrigenId: string,
): Promise<ResultadoClonContexto> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return {
      ok: false,
      error: "No autorizado: se requiere rol directivo.",
      gruposCreados: 0,
      gruposYaExistentes: 0,
      materiasVinculadas: 0,
      materiasOmitidas: 0,
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
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
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
