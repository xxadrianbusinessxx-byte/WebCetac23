import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_ALUMNOS } from "../tables.ts";
import { conjuntoDeCurpsPrueba } from "./alumnos-prueba-puro.ts";

/**
 * alumnos-prueba.ts — LA lectura de quién es alumno de prueba. 2026-11-12,
 * PROMPT AC (perfiles de visualización).
 *
 * Una sola consulta, y la única del repo que pregunta por `es_prueba` (R6): los
 * lectores de listas reciben este conjunto y lo pasan a
 * `alumnos-prueba-puro.ts`; ninguno escribe su propio filtro.
 *
 * Nunca lanza. Si la columna aún no existe (42703) o la lectura falla por
 * cualquier otra cosa, devuelve un conjunto VACÍO: lo peor que puede pasar es
 * que el alumno de prueba se vea en una lista, nunca que desaparezca un alumno
 * real. (Mismo criterio aditivo que `decision_manual` en `ciclo-estado.ts`.)
 *
 * Sin `import "server-only"` a propósito: la importan, a través de
 * `materia/calificaciones.ts`, suites que corren en Node.
 */
export async function leerCurpsDePrueba(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from(TABLA_ALUMNOS)
      .select("CURP")
      .eq("es_prueba", true);
    if (error || !Array.isArray(data)) return new Set();
    return conjuntoDeCurpsPrueba(data as Array<{ CURP?: string | null }>);
  } catch {
    return new Set();
  }
}
