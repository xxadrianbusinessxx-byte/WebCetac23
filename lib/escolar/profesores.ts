import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalRole } from "@/lib/auth/types";
import { nombresCoinciden, normalizarNombre } from "./nombres";
import { TABLA_PROFESORES } from "./tables";

export type ProfesorRow = {
  "NOMBRE/PROFESOR/DIRECTIVO": string;
  CLAVE: string;
  Permisos: string;
};

const SELECT_PROFESOR =
  '"NOMBRE/PROFESOR/DIRECTIVO", CLAVE, Permisos';

export function nombreProfesor(row: ProfesorRow): string {
  return String(row["NOMBRE/PROFESOR/DIRECTIVO"] ?? "").trim();
}

export function rolDesdePermisos(permisos: string): PortalRole {
  const p = permisos.trim().toLowerCase();
  if (p.includes("directivo")) return "directivo";
  return "maestro";
}

export async function buscarProfesorPorNombre(
  supabase: SupabaseClient,
  nombreCompleto: string,
): Promise<ProfesorRow | null> {
  const buscado = normalizarNombre(nombreCompleto);
  if (!buscado) return null;

  const { data, error } = await supabase
    .from(TABLA_PROFESORES)
    .select(SELECT_PROFESOR)
    .range(0, 4999);

  if (error || !data?.length) return null;

  for (const row of data as ProfesorRow[]) {
    if (nombresCoinciden(nombreProfesor(row), nombreCompleto)) {
      return row;
    }
  }
  return null;
}
