/**
 * puente-grupo-materia.ts — las dos direcciones del puente entre la identidad
 * vieja de una materia (el NOMBRE de su tabla física, «1ROAMAT011») y la nueva
 * (`grupo_materias.id`).
 *
 * Existe aparte porque lo usan tres módulos que no deben depender entre sí:
 * calificaciones, alias (`nombres-visibles`) y mapeo de columnas. Con la
 * resolución metida en cualquiera de ellos, los otros dos tendrían que
 * importarlo entero para una consulta.
 *
 * ── El invariante que sostiene ─────────────────────────────────────────────
 * Mientras dure la transición, el alias y el mapeo de una pareja se escriben
 * desde DOS caminos: las pantallas viejas (por `materia_id`, texto) y el modelo
 * nuevo (por `grupo_materia_id`). Para que no acaben en dos filas distintas,
 * los dos caminos ponen LAS DOS claves siempre que la pareja tenga tabla
 * física. Este módulo es lo que les permite hacerlo.
 *
 * `tabla_legacy` es única (restricción `uq_grupo_materias_tabla_legacy`), así
 * que cada dirección devuelve a lo sumo una fila.
 *
 * NO es el camino deseable: cuando ninguna pantalla maneje `idInterno`, esto se
 * retira.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_GRUPO_MATERIAS } from "../tables.ts";

export type GrupoMateriaResuelto = {
  id: string;
  grupo_id: string;
  materia_id: string;
  tabla_legacy: string | null;
  activo: boolean;
};

/** De un `idInterno` (el nombre de la tabla física) a su pareja. */
export async function grupoMateriaDesdeTablaLegacy(
  supabase: SupabaseClient,
  tablaLegacy: string,
): Promise<GrupoMateriaResuelto | null> {
  const t = tablaLegacy.trim();
  if (!t) return null;
  const { data, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("id, grupo_id, materia_id, tabla_legacy, activo")
    .eq("tabla_legacy", t)
    .maybeSingle();
  if (error || !data) return null;
  return data as GrupoMateriaResuelto;
}

/**
 * De una pareja al nombre de su tabla física, o `null` si no tiene.
 *
 * `null` es un valor legítimo y no un error: las parejas dadas de alta con el
 * modelo nuevo no tienen tabla física (12 de 253 el 2026-10-01). Quien llama
 * escribe entonces solo `grupo_materia_id`.
 *
 * Distingue «no tiene» de «no pude leerlo»: lo segundo devuelve `{ok:false}`.
 * Confundirlos haría que un fallo de red escribiera un alias sin su clave vieja
 * y las pantallas viejas dejaran de verlo.
 */
export async function tablaLegacyDeGrupoMateria(
  supabase: SupabaseClient,
  grupoMateriaId: string,
): Promise<{ ok: true; tablaLegacy: string | null } | { ok: false; error: string }> {
  const id = grupoMateriaId.trim();
  if (!id) return { ok: false, error: "Materia no válida." };
  const { data, error } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("tabla_legacy")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Esa materia no existe en ningún grupo." };
  const t = (data as { tabla_legacy: string | null }).tabla_legacy;
  return { ok: true, tablaLegacy: t && t.trim() ? t.trim() : null };
}
