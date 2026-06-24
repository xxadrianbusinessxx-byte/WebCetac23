import type { SupabaseClient } from "@supabase/supabase-js";
import { archivoCsvAFilas } from "./csv";
import { leerHojaDesdeTabla, reemplazarHojaEnTabla } from "./hoja-tabla";
import type { MateriaTablaVista } from "./types";

/**
 * Cada tabla en Supabase (materia o registro final) recibe el Excel/CSV completo:
 * filas y columnas vacías se eliminan; el resto se guarda tal cual en la tabla elegida.
 */
export async function reemplazarContenidoMateriaDesdeArchivo(
  supabase: SupabaseClient,
  nombreMateria: string,
  file: File,
): Promise<
  | { ok: true; filas: number; advertencia?: string }
  | { ok: false; error: string }
> {
  try {
    const { filas, csvTexto } = await archivoCsvAFilas(file);
    return reemplazarContenidoMateria(supabase, nombreMateria, filas, csvTexto);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return { ok: false, error: msg };
  }
}

export async function reemplazarContenidoMateria(
  supabase: SupabaseClient,
  nombreMateria: string,
  filas: string[][],
  csvTexto?: string,
): Promise<
  | { ok: true; filas: number; advertencia?: string }
  | { ok: false; error: string }
> {
  return reemplazarHojaEnTabla(supabase, nombreMateria, filas, csvTexto);
}

export async function obtenerVistaMateria(
  supabase: SupabaseClient,
  nombreMateria: string,
): Promise<MateriaTablaVista | null> {
  return leerHojaDesdeTabla(supabase, nombreMateria);
}
