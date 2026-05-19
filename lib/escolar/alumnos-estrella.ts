import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLA_ALUMNOS } from "./tables";
import type { AlumnoRow } from "./types";
import {
  listarAlumnosEstrellaDesdeStatus,
  type AlumnoEstrella,
} from "./etiquetas-status";

export type { AlumnoEstrella };

/** Mejores alumnos según promedios en ETIQUETAS (STATUS). */
export async function obtenerAlumnosEstrella(
  supabase: SupabaseClient,
  limite = 4,
): Promise<AlumnoEstrella[]> {
  const { data, error } = await supabase
    .from(TABLA_ALUMNOS)
    .select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE")
    .range(0, 4999);

  if (error || !data?.length) return [];
  return listarAlumnosEstrellaDesdeStatus(
    supabase,
    data as AlumnoRow[],
    limite,
  );
}
