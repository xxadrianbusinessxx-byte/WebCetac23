import type { SupabaseClient } from "@supabase/supabase-js";
import { filasAMetadataSupabase, metadataAVista } from "./parse-hoja";
import type { MateriaContenidoRow, MateriaTablaVista } from "./types";

export async function reemplazarContenidoMateria(
  supabase: SupabaseClient,
  nombreMateria: string,
  filas: string[][],
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  const tabla = nombreMateria.trim();
  if (!tabla) return { ok: false, error: "Materia no válida." };

  const { error: delError } = await supabase
    .from(tabla)
    .delete()
    .not("id", "is", null);
  if (delError) return { ok: false, error: delError.message };

  const registros = filasAMetadataSupabase(filas);
  if (!registros.length) return { ok: true, filas: 0 };

  const { error: insError } = await supabase.from(tabla).insert(registros);
  if (insError) return { ok: false, error: insError.message };

  return { ok: true, filas: registros.length - 1 };
}

export async function obtenerVistaMateria(
  supabase: SupabaseClient,
  nombreMateria: string,
): Promise<MateriaTablaVista | null> {
  const { data, error } = await supabase
    .from(nombreMateria.trim())
    .select("id, columna1, columna2")
    .order("id", { ascending: true });

  if (error || !data?.length) return null;
  return metadataAVista(data as MateriaContenidoRow[]);
}
