/**
 * PROMPT-4/T3 — Roster: borrar y actualizar (sacar a un alumno del roster).
 *
 * Semántica (depende de T1): sacar del roster es una DECISIÓN HUMANA. NO se
 * borra al alumno de `ALUMNOS` ni su historial; solo deja de pertenecer a ese
 * grupo en ese ciclo. Para que la siguiente activación del ciclo no lo
 * devuelva, la baja se expresa como:
 *   - `activo = false`   (deja de pertenecer al ciclo operativo), y
 *   - `decision_manual = true` + `motivo`  (T1: la sincronización no lo toca).
 *
 * Patrón del repo: previsualizar → confirmar. La previsualización cuenta qué
 * arrastra la baja (asistencia, justificaciones y materias con filas) para
 * que no se descubra después.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerInscripcionActiva } from "./catalogo-academico.ts";
import {
  TABLA_ALUMNOS,
  TABLA_ASISTENCIA_ALUMNOS,
  TABLA_GRUPO_MATERIAS,
  TABLA_GRUPOS,
  TABLA_INSCRIPCIONES_ALUMNO,
  TABLA_JUSTIFICACIONES_ASISTENCIA,
  TABLA_MATERIAS,
} from "../tables.ts";

export type PreviewBajaRoster = {
  curp: string;
  nombre: string | null;
  grupoDescripcion: string | null;
  /** ¿El alumno tiene inscripción ACTIVA en el ciclo operativo? */
  estaEnRoster: boolean;
  /** Asistencia registrada de ese alumno en el ciclo (se conserva). */
  asistenciaRegistrada: number;
  /** Justificaciones de ese alumno en el ciclo (se conservan). */
  justificaciones: number;
  /** Materias activas del grupo donde el alumno ya tiene filas (se conservan). */
  materiasConFilas: string[];
  /** Materias activas del grupo donde el alumno NO tiene fila aún. */
  materiasSinFilas: string[];
  /** Motivo ya grabado si la fila estaba marcada. */
  motivoPrevio?: string | null;
};

const MOTIVO_BAJA =
  "PROMPT-4/T3 baja de roster (2026-09-06): decisión humana de sacar al alumno del ciclo; no reactivar por fecha (T1).";

/** Nombre del alumno en ALUMNOS (por CURP exacta). */
async function nombreAlumnoPorCurp(
  supabase: SupabaseClient,
  curp: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(TABLA_ALUMNOS)
    .select("NOMBRE")
    .eq("CURP", curp)
    .limit(1);
  return String((data?.[0] as { NOMBRE?: unknown } | undefined)?.NOMBRE ?? "").trim() || null;
}

/** Conteo EXACTO de filas de una tabla física de materia para un CURP. */
async function contarFilasEnTablaMateria(
  supabase: SupabaseClient,
  tabla: string,
  curp: string,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(tabla)
      .select("curp", { count: "exact", head: true })
      .eq("curp", curp);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Previsualiza qué implica sacar a un CURP del roster del ciclo operativo.
 * NO escribe nada.
 */
export async function previsualizarBajaRoster(
  supabase: SupabaseClient,
  curpRaw: string,
): Promise<PreviewBajaRoster | null> {
  const curp = curpRaw.trim().toUpperCase();
  if (!curp) return null;

  const inscripcion = await obtenerInscripcionActiva(supabase, curp);
  if (!inscripcion) {
    return {
      curp,
      nombre: await nombreAlumnoPorCurp(supabase, curp),
      grupoDescripcion: null,
      estaEnRoster: false,
      asistenciaRegistrada: 0,
      justificaciones: 0,
      materiasConFilas: [],
      materiasSinFilas: [],
    };
  }

  const { data: grupo } = await supabase
    .from(TABLA_GRUPOS)
    .select("id, grado, nombre")
    .eq("id", inscripcion.grupo_id)
    .maybeSingle();
  const grupoDescripcion = grupo
    ? `${grupo.grado} ${grupo.nombre}`.trim()
    : null;

  const { count: asistencia } = await supabase
    .from(TABLA_ASISTENCIA_ALUMNOS)
    .select("id", { count: "exact", head: true })
    .eq("curp", curp);
  const { count: justificaciones } = await supabase
    .from(TABLA_JUSTIFICACIONES_ASISTENCIA)
    .select("id", { count: "exact", head: true })
    .eq("curp_alumno", curp);

  // Materias activas del grupo: ¿en cuáles el alumno ya tiene filas?
  const { data: gms } = await supabase
    .from(TABLA_GRUPO_MATERIAS)
    .select("id, materia_id, tabla_legacy, activo")
    .eq("grupo_id", inscripcion.grupo_id)
    .eq("activo", true);
  const filasGm = (gms ?? []) as Array<{
    materia_id: string;
    tabla_legacy: string | null;
  }>;
  const materiaIds = [...new Set(filasGm.map((gm) => gm.materia_id))];
  const materiasNombre = new Map<string, string>();
  if (materiaIds.length > 0) {
    const { data: materias } = await supabase
      .from(TABLA_MATERIAS)
      .select("id, nombre, clave")
      .in("id", materiaIds);
    for (const m of (materias ?? []) as Array<{
      id: string;
      nombre: string | null;
      clave: string | null;
    }>) {
      materiasNombre.set(m.id, (m.nombre ?? m.clave ?? "").trim());
    }
  }

  const materiasConFilas: string[] = [];
  const materiasSinFilas: string[] = [];
  for (const gm of filasGm) {
    const nombre =
      materiasNombre.get(gm.materia_id) ?? gm.tabla_legacy ?? gm.materia_id;
    if (!gm.tabla_legacy) {
      materiasSinFilas.push(nombre);
      continue;
    }
    const filas = await contarFilasEnTablaMateria(
      supabase,
      gm.tabla_legacy,
      curp,
    );
    if (filas > 0) materiasConFilas.push(nombre);
    else materiasSinFilas.push(nombre);
  }

  return {
    curp,
    nombre: await nombreAlumnoPorCurp(supabase, curp),
    grupoDescripcion,
    estaEnRoster: true,
    asistenciaRegistrada: asistencia ?? 0,
    justificaciones: justificaciones ?? 0,
    materiasConFilas,
    materiasSinFilas,
    motivoPrevio: inscripcion.decision_manual ? inscripcion.motivo : null,
  };
}

/**
 * Aplica la baja de roster: la inscripción ACTIVA del CURP pasa a
 * `activo=false` + `decision_manual=true` + motivo. No borra al alumno de
 * ALUMNOS ni ninguna fila derivada (asistencia/justificaciones/calificaciones
 * se conservan). Si la fila ya estaba marcada/inactiva, no falla.
 */
export async function aplicarBajaRoster(
  supabase: SupabaseClient,
  curpRaw: string,
): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  const curp = curpRaw.trim().toUpperCase();
  if (!curp) return { ok: false, error: "CURP no válida." };

  const { data: inscripciones, error: e0 } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("id, curp, grupo_id, activo")
    .eq("curp", curp)
    .eq("activo", true)
    .limit(5);
  if (e0) return { ok: false, error: e0.message };
  const activa = (inscripciones ?? [])[0] as { id: string } | undefined;
  if (!activa) {
    return {
      ok: false,
      error: `${curp} no tiene inscripción ACTIVA en el ciclo operativo.`,
    };
  }

  const { error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .update({ activo: false, decision_manual: true, motivo: MOTIVO_BAJA })
    .eq("id", activa.id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    mensaje: `${curp} salió del roster (historial conservado; marca T1 puesta).`,
  };
}

/** Reinscribe a un alumno: activo=true y limpia la marca T1. */
export async function restaurarEnRoster(
  supabase: SupabaseClient,
  curpRaw: string,
): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  const curp = curpRaw.trim().toUpperCase();
  if (!curp) return { ok: false, error: "CURP no válida." };

  const { data: inscripciones, error: e0 } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .select("id")
    .eq("curp", curp)
    .limit(5);
  if (e0) return { ok: false, error: e0.message };
  const fila = (inscripciones ?? [])[0] as { id: string } | undefined;
  if (!fila) {
    return { ok: false, error: `${curp} no tiene inscripción en el sistema.` };
  }

  const { error } = await supabase
    .from(TABLA_INSCRIPCIONES_ALUMNO)
    .update({ activo: true, decision_manual: false, motivo: null })
    .eq("id", fila.id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    mensaje: `${curp} vuelve al roster (marca T1 limpiada).`,
  };
}

