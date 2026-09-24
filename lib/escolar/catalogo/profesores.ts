import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalRole } from "../../auth/types.ts";
import { nombresCoinciden, normalizarNombre } from "../nombres.ts";
import { TABLA_PROFESORES } from "../tables.ts";

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
  // PROMPT-3: el rol técnico es una fila normal de PROFESORES con
  // Permisos = 'Tecnico'. Hereda identidad estructural (ID), login y cambio
  // forzado de clave. No es un segundo camino de autenticación.
  if (p.includes("tecnic")) return "tecnico";
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

/**
 * PROFESORES.ID a partir de la CLAVE web. Camino LEGACY y de solo lectura: la
 * CLAVE es ambigua (varias filas comparten `4321`), así que se toma la primera
 * coincidencia y se devuelve null si no hay ninguna.
 */
export async function resolverProfesorIdPorClave(
  supabase: SupabaseClient,
  clave: string,
): Promise<number | null> {
  const { data } = await supabase
    .from(TABLA_PROFESORES)
    .select("ID")
    .eq("CLAVE", clave)
    .limit(1);
  return data?.[0]?.ID ?? null;
}

/**
 * Permisos (texto libre) de un profesor por su identidad ESTRUCTURAL
 * (PROFESORES.ID). Cadena vacía si la fila no existe.
 */
export async function obtenerPermisosProfesor(
  supabase: SupabaseClient,
  profesorId: number,
): Promise<string> {
  const { data } = await supabase
    .from(TABLA_PROFESORES)
    .select("Permisos")
    .eq("ID", profesorId)
    .limit(1);
  return String(data?.[0]?.Permisos ?? "").trim();
}

/**
 * PROMPT-3/T4.2 — Repone la CLAVE de INICIO DE SESIÓN de un profesor puntual
 * (acceso perdido) y marca `debe_cambiar_credenciales = true` para que la
 * cambie en el primer acceso (autoservicio, A4). Identidad = PROFESORES.ID.
 */
export async function reponerClaveAccesoProfesor(
  supabase: SupabaseClient,
  profesorId: number,
  nuevaClave: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_PROFESORES)
    .update({ CLAVE: nuevaClave, debe_cambiar_credenciales: true })
    .eq("ID", profesorId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Activa/desactiva el flag `debe_cambiar_credenciales` de un profesor. La
 * identidad es SIEMPRE PROFESORES.ID.
 */
export async function cambiarDebeCambiarCredencialesProfesor(
  supabase: SupabaseClient,
  profesorId: number,
  valor: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from(TABLA_PROFESORES)
    .update({ debe_cambiar_credenciales: valor })
    .eq("ID", profesorId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * PROMPT-3/T4 — Frontera del rol técnico: solo administra claves de cuentas de
 * rol maestro (quienes imparten). Nunca directivo ni otro técnico. El actor
 * llega ya resuelto (la sesión se valida en la action con `exigir()`); la
 * decisión sobre el OBJETIVO se toma aquí, contra PROFESORES.Permisos.
 */
export async function validarObjetivoPermitidoParaTecnico(
  supabase: SupabaseClient,
  actor: string,
  profesorId: number,
): Promise<{ ok: boolean; error?: string }> {
  if (actor !== "tecnico") return { ok: true };
  const permisos = (await obtenerPermisosProfesor(supabase, profesorId)).toLowerCase();
  if (!permisos.includes("profesor")) {
    return {
      ok: false,
      error: "El técnico solo repone claves de cuentas de rol maestro.",
    };
  }
  return { ok: true };
}


