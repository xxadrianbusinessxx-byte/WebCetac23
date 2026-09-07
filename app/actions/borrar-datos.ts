"use server";

/**
 * PROMPT-4/T4 — Deshacer los datos de un paso del configurador.
 * Previsualizar (conteos + bloqueos) → confirmar. Capacidad: ciclo.borrar_datos.
 */
import { exigir } from "@/lib/auth/exigir";
import { createClient } from "@/lib/supabase/server";
import {
  aplicarBorrarPaso,
  previsualizarBorrarPaso,
  type PreviewBorrarPaso,
  type ResultadoBorrarPaso,
} from "@/lib/escolar/ciclo/borrar-paso";

/** Previsualiza (NO escribe): conteos exactos y bloqueos del paso. */
export async function actionPrevisualizarBorrarPaso(
  periodoId: string,
  paso: string,
): Promise<PreviewBorrarPaso> {
  const g = await exigir("ciclo.borrar_datos");
  if (!g.ok) return { ok: false, error: "No autorizado." };
  const supabase = await createClient();
  return previsualizarBorrarPaso(supabase, periodoId, paso);
}

/** Confirma el borrado del paso (escribe SOLO si no hay bloqueos). */
export async function actionConfirmarBorrarPaso(
  periodoId: string,
  paso: string,
): Promise<ResultadoBorrarPaso> {
  const g = await exigir("ciclo.borrar_datos");
  if (!g.ok) return { ok: false, error: "No autorizado." };
  const supabase = await createClient();
  return aplicarBorrarPaso(supabase, periodoId, paso);
}
