"use server";

import {
  listarMateriasCompletas,
  listarRegistrosCompletos,
} from "@/lib/escolar/tablas-supabase";

/** Todas las materias (sin filtrar por grupo). Para directivo y profesor. */
export async function actionListarMateriasSupabase(): Promise<string[]> {
  return listarMateriasCompletas();
}

/** Todos los registros de calificaciones finales. Para directivo. */
export async function actionListarRegistrosSupabase(): Promise<string[]> {
  return listarRegistrosCompletos();
}
