import type { SupabaseClient } from "@supabase/supabase-js";
import { pareceCurp } from "./buscar-en-filas";
import { nombresCoinciden, normalizarNombre } from "./nombres";
import { TABLA_ALUMNOS } from "./tables";
import type { AlumnoRow } from "./types";

export function nombreCompletoAlumno(row: AlumnoRow): string {
  return [row.NOMBRE, row.P_APELLIDO, row.S_APELLIDO]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export async function buscarAlumnoPorClave(
  supabase: SupabaseClient,
  clave: string,
): Promise<AlumnoRow | null> {
  const key = clave.trim().toUpperCase();
  if (!key) return null;

  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .eq("CLAVE", key)
    .maybeSingle();

  if (error || !data) return null;
  return data as AlumnoRow;
}

export async function buscarAlumnoPorCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<AlumnoRow | null> {
  const key = curp.trim().toUpperCase();
  if (!key) return null;

  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .eq("CURP", key)
    .maybeSingle();

  if (error || !data) return null;
  return data as AlumnoRow;
}

/** Por nombre completo (coincidencia exacta normalizada). */
export async function buscarAlumnoPorNombre(
  supabase: SupabaseClient,
  nombreCompleto: string,
): Promise<AlumnoRow | null> {
  const q = nombreCompleto.trim();
  if (!q) return null;

  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .range(0, 4999);

  if (error || !data?.length) return null;

  for (const row of data as AlumnoRow[]) {
    if (nombresCoinciden(nombreCompletoAlumno(row), q)) return row;
  }
  const buscado = normalizarNombre(q);
  for (const row of data as AlumnoRow[]) {
    if (normalizarNombre(nombreCompletoAlumno(row)).includes(buscado)) {
      return row;
    }
  }
  return null;
}

/**
 * CURP primero: si el texto parece CURP, solo busca por CURP.
 * Si no, solo por nombre (sin mezclar ambos criterios).
 */
export async function buscarAlumnoPorTexto(
  supabase: SupabaseClient,
  texto: string,
): Promise<AlumnoRow | null> {
  const t = texto.trim();
  if (!t) return null;
  if (pareceCurp(t)) return buscarAlumnoPorCurp(supabase, t);
  return buscarAlumnoPorNombre(supabase, t);
}
