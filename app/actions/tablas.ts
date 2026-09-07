"use server";

import { exigir } from "@/lib/auth/exigir";
import { listarRegistrosCompletos } from "@/lib/escolar/materia/tablas-supabase";

/**
 * Tablas del catálogo de REGISTROS (calificaciones finales). Usada por el panel
 * del directivo (`app/directivo/page.tsx`). Se conserva CABLEADA con la
 * capacidad `calificacion.ver` (antes SIN SESION era un agujero). La antigua
 * `actionListarMateriasSupabase` se eliminó: sin consumidor y exponía nombres
 * de tablas (decisión T2 del PROMPT-2).
 */
export async function actionListarRegistrosSupabase(): Promise<string[]> {
  const g = await exigir("calificacion.ver");
  if (!g.ok) return [];
  return listarRegistrosCompletos();
}

