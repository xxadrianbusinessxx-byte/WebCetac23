/**
 * actividades.ts — I/O de las actividades (tareas) de una materia y de las
 * entregas del alumno.
 *
 * La decisión de estado —activa, vencida, sin fecha— NO está aquí: vive en
 * `actividades-puro.ts` y se deriva de la fecha límite. Este módulo solo lee y
 * escribe.
 *
 * Recibe el cliente por parámetro. No decide permisos ni alcance: eso lo hace
 * la action antes de llamar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TABLA_ACTIVIDAD_ENTREGAS, TABLA_ACTIVIDADES } from "../tables.ts";

export { TABLA_ACTIVIDADES };
export const TABLA_ENTREGAS = TABLA_ACTIVIDAD_ENTREGAS;

export type ActividadRow = {
  id: string;
  periodo_id: string;
  grupo_materia_id: string | null;
  materia_interna: string | null;
  titulo: string;
  descripcion: string | null;
  fecha_limite: string | null;
  peso: number | null;
  creada_por: number | null;
  created_at: string;
};

export type EntregaRow = {
  id: string;
  actividad_id: string;
  curp: string;
  ruta_storage: string | null;
  comentario: string | null;
  entregado_at: string;
  calificacion: number | null;
};

export type Resultado<T> = { ok: true; dato: T } | { ok: false; error: string };

/**
 * Actividades de una materia. `materiaInterna` es el `idInterno` —el nombre de
 * la tabla física—, que es la identidad real de una materia en este sistema
 * (GLOSARIO). Nunca el nombre visible.
 */
export async function listarActividades(
  supabase: SupabaseClient,
  periodoId: string,
  materiaInterna: string,
): Promise<ActividadRow[]> {
  const { data, error } = await supabase
    .from(TABLA_ACTIVIDADES)
    .select("*")
    .eq("periodo_id", periodoId)
    .eq("materia_interna", materiaInterna)
    .order("fecha_limite", { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as ActividadRow[];
}

export async function crearActividad(
  supabase: SupabaseClient,
  a: {
    periodoId: string;
    materiaInterna: string;
    grupoMateriaId: string | null;
    titulo: string;
    descripcion: string | null;
    fechaLimite: string | null;
    peso: number | null;
    creadaPor: number | null;
  },
): Promise<Resultado<ActividadRow>> {
  const { data, error } = await supabase
    .from(TABLA_ACTIVIDADES)
    .insert({
      periodo_id: a.periodoId,
      materia_interna: a.materiaInterna,
      grupo_materia_id: a.grupoMateriaId,
      titulo: a.titulo,
      descripcion: a.descripcion,
      fecha_limite: a.fechaLimite,
      peso: a.peso,
      creada_por: a.creadaPor,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: data as ActividadRow };
}

export async function eliminarActividad(
  supabase: SupabaseClient,
  id: string,
): Promise<Resultado<true>> {
  // Las entregas caen con ella por `on delete cascade`: una entrega sin
  // actividad no significa nada.
  const { error } = await supabase.from(TABLA_ACTIVIDADES).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

/** Entregas de un alumno, para pintar qué ya entregó. */
export async function entregasDeAlumno(
  supabase: SupabaseClient,
  curp: string,
  actividadIds: readonly string[],
): Promise<EntregaRow[]> {
  if (actividadIds.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLA_ENTREGAS)
    .select("*")
    .eq("curp", curp)
    .in("actividad_id", [...actividadIds]);
  if (error) return [];
  return (data ?? []) as EntregaRow[];
}

/** Todas las entregas de una actividad, para que el profesor califique. */
export async function entregasDeActividad(
  supabase: SupabaseClient,
  actividadId: string,
): Promise<EntregaRow[]> {
  const { data, error } = await supabase
    .from(TABLA_ENTREGAS)
    .select("*")
    .eq("actividad_id", actividadId)
    .order("entregado_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as EntregaRow[];
}

/**
 * Entregar. Re-entregar ACTUALIZA la fila en vez de crear otra: el índice
 * único `(actividad_id, curp)` lo impone, y el `upsert` lo aprovecha. Un
 * alumno tiene una entrega por actividad, no un historial de intentos —si algún
 * día hacen falta los intentos, será una tabla aparte y una decisión aparte.
 */
export async function registrarEntrega(
  supabase: SupabaseClient,
  e: { actividadId: string; curp: string; rutaStorage: string | null; comentario: string | null },
): Promise<Resultado<true>> {
  const { error } = await supabase.from(TABLA_ENTREGAS).upsert(
    {
      actividad_id: e.actividadId,
      curp: e.curp,
      ruta_storage: e.rutaStorage,
      comentario: e.comentario,
      entregado_at: new Date().toISOString(),
    },
    { onConflict: "actividad_id,curp" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}

export async function calificarEntrega(
  supabase: SupabaseClient,
  entregaId: string,
  calificacion: number | null,
): Promise<Resultado<true>> {
  const { error } = await supabase
    .from(TABLA_ENTREGAS)
    .update({ calificacion })
    .eq("id", entregaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, dato: true };
}
