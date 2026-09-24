import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerGruposConCarreraDePeriodo } from "../horario/horario-semanal.ts";
import { TABLA_GRUPO_MATERIAS, TABLA_PERIODOS } from "../tables.ts";

/**
 * CONTEXTO ACADÉMICO DEL CICLO (FASE CONSOLIDACIÓN)
 *
 * Problema real detectado: un `periodos` puede crearse sin `grupos` que lo
 * referencien; cuando el directivo importa roster/horario, todo se rechaza
 * porque «el grupo no existe en el periodo». No es un caso puntual de un ciclo:
 * es estructural.
 *
 * Solución GENERAL (sin duplicar catálogo):
 *   - El catálogo existente ya modela la oferta por ciclo:
 *       grupos.periodo_id  →  grupo_materias.grupo_id  →  materias (globales)
 *       carreras (globales, referenciadas por grupos.carrera_id)
 *   - Este módulo permite «establecer el contexto académico de un ciclo»
 *     CLONANDO la estructura (grupos + grupo_materias) desde un ciclo origen,
 *     reutilizando las mismas carreras y materias por su ID (nunca se copian).
 *   - Nunca elimina histórico: opera sobre el periodo DESTINO (que normalmente
 *     está recién creado). La importación de horario valida después contra este
 *     contexto (código existente).
 */

export type ResultadoContextoCiclo =
  | { ok: true; mensaje?: string }
  | { ok: false; error: string };

/** Grupo del contexto académico (con su carrera legible). */
export type GrupoContextoRow = {
  id: string;
  grado: string;
  grupo: string;
  carreraId: string | null;
  carreraClave: string;
  carreraNombre: string;
};

/** Vista del contexto académico de un periodo (para la UI). */
export type ContextoAcademicoPeriodo = {
  periodoId: string;
  periodoNombre: string;
  grupos: (GrupoContextoRow & { materiasActivas: number })[];
};

/** Grupos con materias de un periodo (2-3 consultas; sin N+1). */
export async function verContextoAcademicoPeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<
  | { ok: true; contexto: ContextoAcademicoPeriodo | null }
  | { ok: false; error: string }
> {
  const { data: periodo, error: eP } = await supabase
    .from(TABLA_PERIODOS)
    .select("id, nombre")
    .eq("id", periodoId)
    .maybeSingle();
  if (eP) return { ok: false, error: eP.message };
  if (!periodo) return { ok: true, contexto: null };

  const grupos = await obtenerGruposConCarreraDePeriodo(supabase, periodoId);
  const gruposIds = grupos.map((g) => g.id);
  const materiasPorGrupo = new Map<string, number>();
  if (gruposIds.length > 0) {
    const { data: gms, error: eG } = await supabase
      .from(TABLA_GRUPO_MATERIAS)
      .select("grupo_id")
      .in("grupo_id", gruposIds)
      .eq("activo", true);
    if (eG) return { ok: false, error: eG.message };
    for (const gm of (gms ?? []) as { grupo_id: string }[]) {
      materiasPorGrupo.set(
        gm.grupo_id,
        (materiasPorGrupo.get(gm.grupo_id) ?? 0) + 1,
      );
    }
  }

  return {
    ok: true,
    contexto: {
      periodoId: String(periodo.id),
      periodoNombre: String(periodo.nombre),
      grupos: grupos.map((g) => ({
        id: g.id,
        grado: g.grado,
        grupo: g.nombre,
        carreraId: g.carreraId,
        carreraClave: g.carreraClave,
        carreraNombre: g.carreraNombre,
        materiasActivas: materiasPorGrupo.get(g.id) ?? 0,
      })),
    },
  };
}

/** Plan puro de clonación (fácil de probar sin Supabase). */

/* ---------------------------------------------------------------------------
 * PROMPT E · R-3 — este archivo tenía 1 155 líneas. Se partió por
 * responsabilidad en tres módulos; las tres partes se re-exportan aquí para que
 * ningún import existente se rompa (§10):
 *
 *   · ./contexto-ciclo-clonar.ts   — clonar el contexto de un ciclo origen
 *   · ./contexto-ciclo-catalogo.ts — poblar desde el catálogo legacy
 *   · ./contexto-ciclo-reparar.ts  — reparar `tabla_legacy`
 * ------------------------------------------------------------------------- */

export * from "./contexto-ciclo-clonar.ts";
export * from "./contexto-ciclo-catalogo.ts";
export * from "./contexto-ciclo-reparar.ts";
