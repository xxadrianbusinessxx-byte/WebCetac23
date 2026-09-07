/**
 * PROMPT D (R-1/R-2) — Invocación del RPC transaccional `traspasar_materia_a_profesor`.
 *
 * El traspaso REAL vive en la BD (una sola transacción) porque si se corta a la
 * mitad los registros de una materia quedarían repartidos entre dos profesores.
 * Este módulo solo invoca la RPC y traduce su jsonb a un resultado tipado.
 * NUNCA replica sus pasos en TS (autoridad única: RPC).
 *
 * Si la RPC no está desplegada devuelve error explícito (mismo patrón que
 * `activarCicloOperativoAtomico`): sin ella NO se escribe nada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ConteosTraspaso = {
  asignacionesDesactivadas: number;
  asignacionDestino: "creada" | "reactivada" | "ya_activa";
  clasesMigradas: number;
  clasesArchivadas: number;
  asistenciaMigradas: number;
  asistenciaArchivadas: number;
};

export type ResultadoTraspaso =
  | { ok: true; conteos: ConteosTraspaso }
  | { ok: false; error: string };

export const ERROR_RPC_TRASPASO_NO_DESPLEGADA =
  "La RPC traspasar_materia_a_profesor no está disponible. Aplica supabase/crear-rpc-traspasar-materia.sql (y antes el SQL del Prompt C). Sin ella no se escribe nada.";

/** Invoca el RPC transaccional de traspaso (autoridad única en la BD). */
export async function traspasarMateriaAProfesor(
  supabase: SupabaseClient,
  grupoMateriaId: string,
  profesorId: number,
): Promise<ResultadoTraspaso> {
  const { data, error } = await supabase.rpc("traspasar_materia_a_profesor", {
    p_grupo_materia: grupoMateriaId,
    p_profesor_id: profesorId,
  });
  if (error) {
    const msg = String(error?.message ?? "No se pudo traspasar la materia.");
    if (
      /PGRST202|Could not find the function|function .* does not exist/i.test(
        msg,
      )
    ) {
      return { ok: false, error: ERROR_RPC_TRASPASO_NO_DESPLEGADA };
    }
    return {
      ok: false,
      error: msg.replace(/^traspasar_materia_a_profesor:\s*/i, ""),
    };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    conteos: {
      asignacionesDesactivadas: Number(d.asignaciones_desactivadas ?? 0),
      asignacionDestino: String(d.asignacion_destino ?? "ya_activa") as
        | "creada"
        | "reactivada"
        | "ya_activa",
      clasesMigradas: Number(d.clases_migradas ?? 0),
      clasesArchivadas: Number(d.clases_archivadas ?? 0),
      asistenciaMigradas: Number(d.asistencia_migradas ?? 0),
      asistenciaArchivadas: Number(d.asistencia_archivadas ?? 0),
    },
  };
}
