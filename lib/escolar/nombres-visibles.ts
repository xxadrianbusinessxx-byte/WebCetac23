/**
 * NOMBRES VISIBLES DE MATERIAS — BLOQUE 7A
 *
 * Separa el IDENTIFICADOR TÉCNICO real (nombre exacto de la tabla Supabase,
 * ej. «2DO A MECATRONICA CONCIENCIA HISTORICA») del NOMBRE VISIBLE que ven
 * los usuarios (ej. «Conciencia histórica»).
 *
 * REGLA ABSOLUTA:
 *   - El nombre visible es SOLO presentación. NUNCA se usa para acceder a
 *     Supabase (supabase.from(nombreVisible) está prohibido).
 *   - El idInterno (nombre de la tabla) es el único que se usa para
 *     almacenamiento, rutas, consultas y subida de calificaciones.
 *   - Fallback: si no hay alias activo → nombreVisible = idInterno.
 *   - Nunca devolver undefined como nombre para la UI.
 *
 * Este archivo contiene funciones PURAS (seguras para cliente) y funciones de
 * PERSISTENCIA (solo servidor; reciben el cliente Supabase como parámetro).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  materiaIdDesdeNombreTabla,
  type MateriaIdentidad,
} from "./materia-identidad";
import { normalizarNombre } from "./nombres";

/** Nombre de la tabla ligera de configuración (no es una tabla de materia). */
export const TABLA_NOMBRES_VISIBLES = "materias_nombres_visibles";

export const NOMBRE_VISIBLE_MAX = 120;

export type MateriaConNombreVisible = MateriaIdentidad & {
  /** Nombre de presentación. Nunca usar como clave técnica. */
  nombreVisible: string;
};

type FilaNombreVisible = {
  materia_id: string;
  nombre_visible: string;
  activo?: boolean;
};

/** Filtra los alias activos y devuelve un mapa idInterno → nombreVisible. */
export function aliasActivosDesdeFilas(
  filas: ReadonlyArray<FilaNombreVisible>,
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const f of filas) {
    if (f.activo === false) continue;
    const id = (f.materia_id ?? "").trim();
    const nombre = (f.nombre_visible ?? "").trim();
    if (!id || !nombre) continue;
    mapa.set(id, nombre);
  }
  return mapa;
}

/**
 * Resuelve el nombre visible desde el mapa de alias.
 * Busca exacto primero y luego por normalización (sin acentos/mayúsculas).
 * Fallback: devuelve el propio idInterno (nunca undefined/vacío).
 */
export function nombreVisibleDesdeMapa(
  aliases: ReadonlyMap<string, string>,
  idInterno: string,
): string {
  const directo = aliases.get(idInterno);
  if (directo && directo.trim()) return directo.trim();

  const norm = normalizarNombre(idInterno);
  for (const [k, v] of aliases) {
    if (normalizarNombre(k) === norm && v.trim()) return v.trim();
  }

  return idInterno;
}

/**
 * Función pura: convierte una lista de nombres de tabla reales en materias
 * con identidad + nombre visible (con fallback al nombre técnico actual).
 */
export function materiasConNombreVisible(
  listaTablas: readonly string[],
  aliases: ReadonlyMap<string, string>,
  carreras?: ReadonlySet<string>,
): MateriaConNombreVisible[] {
  const out: MateriaConNombreVisible[] = [];
  for (const t of listaTablas) {
    const identidad = materiaIdDesdeNombreTabla(t, carreras);
    if (!identidad) continue;
    out.push({
      ...identidad,
      nombreVisible: nombreVisibleDesdeMapa(aliases, identidad.idInterno),
    });
  }
  return out;
}

/** Valida el nombre visible (trim, 1..120 caracteres). Devuelve error o null. */
export function validarNombreVisible(nombreVisible: string): string | null {
  const t = nombreVisible.trim();
  if (!t) return "El nombre visible no puede estar vacío.";
  if (t.length > NOMBRE_VISIBLE_MAX) {
    return `Máximo ${NOMBRE_VISIBLE_MAX} caracteres.`;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * PERSISTENCIA (solo servidor)
 * ------------------------------------------------------------------------- */

/** Lista de alias activos: Map<materia_id, nombre_visible>. Vacío si no hay. */
export async function listarNombresVisiblesMaterias(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from(TABLA_NOMBRES_VISIBLES)
    .select("materia_id, nombre_visible, activo");

  if (error || !data) return new Map();
  return aliasActivosDesdeFilas(data as unknown as FilaNombreVisible[]);
}

/** Nombre visible de una materia (con fallback al idInterno). */
export async function obtenerNombreVisibleMateria(
  supabase: SupabaseClient,
  idInterno: string,
): Promise<string> {
  const { data, error } = await supabase
    .from(TABLA_NOMBRES_VISIBLES)
    .select("nombre_visible, activo")
    .eq("materia_id", idInterno.trim())
    .maybeSingle();

  if (error || !data || data.activo === false) return idInterno;
  const nombre = String(data.nombre_visible ?? "").trim();
  return nombre || idInterno;
}

/**
 * Guarda (UPSERT) únicamente el alias de presentación de una materia.
 * NO renombra tablas, NO mueve calificaciones, NO cambia rutas.
 */
export async function guardarNombreVisibleMateria(
  supabase: SupabaseClient,
  idInterno: string,
  nombreVisible: string,
  actualizadoPor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = idInterno.trim();
  if (!id) return { ok: false, error: "Materia no válida." };

  const errorVal = validarNombreVisible(nombreVisible);
  if (errorVal) return { ok: false, error: errorVal };

  const { error } = await supabase.from(TABLA_NOMBRES_VISIBLES).upsert(
    {
      materia_id: id,
      nombre_visible: nombreVisible.trim(),
      activo: true,
      actualizado_por: actualizadoPor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "materia_id" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
