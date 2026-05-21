import type { SupabaseClient } from "@supabase/supabase-js";
import { archivoCsvAFilas } from "./csv";
import { leerHojaDesdeTabla, reemplazarHojaEnTabla } from "./hoja-tabla";
import type { MateriaTablaVista } from "./types";

/**
 * Cada tabla en Supabase (ej. «1RO A CIENCIAS SOCIALES») es el archivo de esa materia.
 * Al subir Excel/CSV: fila 0 = encabezados → columnas en Supabase; cada fila = un registro directo.
 */
export async function reemplazarContenidoMateriaDesdeArchivo(
  supabase: SupabaseClient,
  nombreMateria: string,
  file: File,
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
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
): Promise<{ ok: true; filas: number } | { ok: false; error: string }> {
  return reemplazarHojaEnTabla(supabase, nombreMateria, filas, csvTexto);
}

export async function obtenerVistaMateria(
  supabase: SupabaseClient,
  nombreMateria: string,
): Promise<MateriaTablaVista | null> {
  return leerHojaDesdeTabla(supabase, nombreMateria);
}
