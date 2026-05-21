"use server";

import {
  listarTablasMateriasDesdeSupabase,
  listarTablasRegistrosDesdeSupabase,
} from "@/lib/escolar/tablas-supabase";

export async function actionListarMateriasSupabase(): Promise<string[]> {
  return listarTablasMateriasDesdeSupabase();
}

export async function actionListarRegistrosSupabase(): Promise<string[]> {
  return listarTablasRegistrosDesdeSupabase();
}
