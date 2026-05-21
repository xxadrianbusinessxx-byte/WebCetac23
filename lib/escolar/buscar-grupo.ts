import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarIndiceFilaAlumno,
  type CriterioAlumnoEnFila,
} from "./buscar-en-filas";
import { parseGrupoDesdeNombreTabla } from "./grupo-parse";
import {
  listarTablasMateriasDesdeSupabase,
  listarTablasRegistrosDesdeSupabase,
} from "./tablas-supabase";

const MARCAS_HOJA = new Set(["__HOJA__", "__ENCABEZADOS__"]);

/** Solo consulta `alumno_nombre` (rápido) para ver si el alumno está en la tabla. */
export async function tablaContieneAlumno(
  supabase: SupabaseClient,
  nombreTabla: string,
  criterio: CriterioAlumnoEnFila,
): Promise<boolean> {
  if (!criterio.curp?.trim() && !criterio.nombreCompleto?.trim()) {
    return false;
  }

  const { data, error } = await supabase
    .from(nombreTabla.trim())
    .select("alumno_nombre");

  if (error || !data?.length) return false;

  const filas = data
    .map((r) => String(r.alumno_nombre ?? "").trim())
    .filter((n) => n && !MARCAS_HOJA.has(n))
    .map((n) => [n]);

  return buscarIndiceFilaAlumno(filas, criterio) >= 0;
}

/**
 * Busca en qué tabla aparece el alumno y deduce grado, grupo y carrera del nombre.
 * Primero registros finales; si no, tablas de materias.
 */
export async function identificarGrupoAlumno(
  supabase: SupabaseClient,
  criterio: CriterioAlumnoEnFila,
): Promise<{
  grado: string;
  grupo: string;
  carrera: string;
  nombreTabla: string;
} | null> {
  if (!criterio.curp?.trim() && !criterio.nombreCompleto?.trim()) {
    return null;
  }

  const registros = await listarTablasRegistrosDesdeSupabase();
  for (const tabla of registros) {
    if (!(await tablaContieneAlumno(supabase, tabla, criterio))) continue;
    const parsed = parseGrupoDesdeNombreTabla(tabla);
    if (parsed) return { ...parsed, nombreTabla: tabla };
  }

  const materias = await listarTablasMateriasDesdeSupabase();
  for (const tabla of materias) {
    if (!(await tablaContieneAlumno(supabase, tabla, criterio))) continue;
    const parsed = parseGrupoDesdeNombreTabla(tabla);
    if (parsed) return { ...parsed, nombreTabla: tabla };
  }

  return null;
}
