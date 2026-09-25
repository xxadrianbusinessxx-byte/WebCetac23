/**
 * numero-control.ts — lectura y escritura de `ALUMNOS.numero_control`. 2026-09-24.
 *
 * Consulta PROPIA y no una columna más en las lecturas de ALUMNOS: todas piden
 * columnas exactas (`alumnos.ts`, la RPC `obtener_perfil_alumno`), y ampliarlas
 * obligaría a tocar la RPC. Así el número se añade sin mover nada de lo que ya
 * funciona, y si la columna faltara (base sin migrar) se lee como `null`.
 *
 * No autoriza: quien llama ya pasó `exigir()` y `resolverAccesoAlumno`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TABLA_ALUMNOS } from "../tables.ts";

export async function leerNumeroControl(supabase: SupabaseClient, curp: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("numero_control")
    .eq("CURP", curp)
    .maybeSingle();
  if (error || !data) return null;
  const v = (data as { numero_control?: string | null }).numero_control;
  return v?.trim() ? v.trim() : null;
}

export async function guardarNumeroControl(
  supabase: SupabaseClient,
  curp: string,
  valor: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .update({ numero_control: valor })
    .eq("CURP", curp)
    .select("CURP");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ese número de control ya lo tiene otro alumno." };
    console.error("[numero-control] guardar", error);
    return { ok: false, error: "No se pudo guardar el número de control. Inténtalo de nuevo." };
  }
  if (!data || data.length === 0) return { ok: false, error: "No se encontró al alumno." };
  return { ok: true };
}
