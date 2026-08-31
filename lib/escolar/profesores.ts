import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalRole } from "@/lib/auth/types";
import { nombresCoinciden, normalizarNombre } from "./nombres";
import { TABLA_PROFESORES } from "./tables";

export type ProfesorRow = {
  /** C4.9/C4.10 — Identidad ESTRUCTURAL estable (única, NOT NULL). */
  ID: number;
  "NOMBRE/PROFESOR/DIRECTIVO": string;
  CLAVE: string;
  Permisos: string;
  /** BLOQUE 9 (PIEZA 5) — true = el próximo login exige cambiar la clave. */
  debe_cambiar_credenciales: boolean;
};

const SELECT_PROFESOR =
  'ID, "NOMBRE/PROFESOR/DIRECTIVO", CLAVE, Permisos, debe_cambiar_credenciales';

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

/** Lista todos los profesores/directivos (para selector de permisos). */
export async function listarProfesores(
  supabase: SupabaseClient,
): Promise<ProfesorRow[]> {
  const { data, error } = await supabase
    .from(TABLA_PROFESORES)
    .select(SELECT_PROFESOR)
    .range(0, 4999);

  if (error || !data) return [];

  // Ordenar en JS en vez de en la consulta: PostgREST no puede parsear el "/"
  // dentro del nombre de columna en el parámetro order (error PGRST100),
  // aunque el mismo nombre sí funciona en select() porque ahí va entre comillas.
  const filas = data as ProfesorRow[];
  filas.sort((a, b) =>
    String(a["NOMBRE/PROFESOR/DIRECTIVO"] ?? "").localeCompare(
      String(b["NOMBRE/PROFESOR/DIRECTIVO"] ?? ""),
      "es",
    ),
  );
  return filas;
}

/**
 * BLOQUE 9 (PIEZA 5) — Cambia la CLAVE de un profesor (TEXTO PLANO, mismo
 * formato que hoy) y limpia el flag de cambio forzado. SOLO debe llamarse con
 * la identidad ESTRUCTURAL (PROFESORES.ID) validada en la capa de acciones.
 */
export async function cambiarClaveProfesor(
  supabase: SupabaseClient,
  profesorId: number,
  nuevaClave: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_PROFESORES)
    .update({ CLAVE: nuevaClave, debe_cambiar_credenciales: false })
    .eq("ID", profesorId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}


