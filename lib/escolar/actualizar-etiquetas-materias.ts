import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/** Nombre exacto de la función RPC en Supabase (SQL Editor). */
export const RPC_ACTUALIZAR_ETIQUETAS_DESDE_MATERIAS =
  "Actualizar etiquetas personales desde materias";

/**
 * Ejecuta la query de Supabase que sincroniza ETIQUETAS PERSONALES
 * a partir de los datos cargados en las tablas de materias.
 * Se invoca automáticamente después de cada subida de Excel/CSV.
 */
export async function ejecutarActualizarEtiquetasDesdeMaterias(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cliente = createServiceClient() ?? supabase;

  const { error } = await cliente.rpc(RPC_ACTUALIZAR_ETIQUETAS_DESDE_MATERIAS);

  if (error) {
    if (
      error.message.includes("Could not find the function") ||
      error.code === "PGRST202"
    ) {
      return {
        ok: false,
        error: `Falta la función «${RPC_ACTUALIZAR_ETIQUETAS_DESDE_MATERIAS}» en Supabase. Créala o publícala en el SQL Editor.`,
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
