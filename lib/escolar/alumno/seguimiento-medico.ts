/**
 * seguimiento-medico.ts — I/O del historial del seguimiento médico.
 *
 * Guardar: invoca `guardar_campos_personales_alumno`
 * (supabase/crear-historial-seguimiento-medico.sql), que escribe los campos
 * personales y, si cambió algún campo médico, su fila de historial en UNA
 * transacción. Este módulo NO replica sus pasos en TS (autoridad única: la
 * función). Si no está desplegada, devuelve un error explícito y no escribe
 * nada: guardar sin historial es justo lo que se quiere evitar.
 *
 * Leer: las últimas ediciones de un alumno, ya convertidas para pintar por el
 * módulo puro.
 *
 * Solo hace I/O: quién puede editar o leer lo decide la action con
 * `resolverAccesoAlumno`; quién firma y qué se audita, `seguimiento-medico-puro.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TABLA_SEGUIMIENTO_MEDICO_HISTORIAL } from "../tables.ts";
import type { EtiquetasPersonalesRow } from "../types.ts";
import {
  camposMedicosDelPatch,
  entradasHistorialMedico,
  LIMITE_HISTORIAL_MEDICO,
  type EditorSeguimientoMedico,
  type EntradaHistorialMedico,
  type FilaHistorialMedico,
} from "./seguimiento-medico-puro.ts";

export const ERROR_SEGUIMIENTO_MEDICO_NO_DESPLEGADO =
  "Falta aplicar supabase/crear-historial-seguimiento-medico.sql en Supabase. Sin él no se guarda nada.";

const RPC = "guardar_campos_personales_alumno";

/**
 * Guarda los campos personales del alumno y, si cambió alguno del seguimiento
 * médico, deja constancia de quién y cuándo. `camposRegistrados` son las claves
 * médicas que cambiaron (vacío si no cambió ninguna).
 */
export async function guardarCamposPersonalesConHistorial(
  supabase: SupabaseClient,
  entrada: {
    curp: string;
    patch: Partial<EtiquetasPersonalesRow>;
    editor: EditorSeguimientoMedico;
  },
): Promise<{ ok: true; camposRegistrados: string[] } | { ok: false; error: string }> {
  const { curp, patch, editor } = entrada;
  const { data, error } = await supabase.rpc(RPC, {
    p_curp: curp,
    p_patch: patch,
    p_campos_auditados: camposMedicosDelPatch(patch),
    p_editor_rol: editor.rol,
    p_editor_profesor_id: editor.profesorId,
    p_editor_tutor_id: editor.tutorId,
    p_editor_nombre: editor.nombre,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (/PGRST202|Could not find the function|function .* does not exist/i.test(msg)) {
      return { ok: false, error: ERROR_SEGUIMIENTO_MEDICO_NO_DESPLEGADO };
    }
    if (/row-level security/i.test(msg)) {
      return {
        ok: false,
        error: "La base no permite crear la ficha de datos personales de este alumno (RLS). Avisa al técnico.",
      };
    }
    if (/el alumno .* no existe/i.test(msg)) return { ok: false, error: "Ese alumno no existe." };
    console.error(`[${RPC}]`, msg);
    return { ok: false, error: "No se pudieron guardar los datos. Inténtalo de nuevo." };
  }

  const campos = (data as { campos?: unknown } | null)?.campos;
  return {
    ok: true,
    camposRegistrados: Array.isArray(campos) ? campos.map(String) : [],
  };
}

/** Las últimas ediciones del seguimiento médico de un alumno, la más reciente primero. */
export async function listarHistorialSeguimientoMedico(
  supabase: SupabaseClient,
  curp: string,
): Promise<{ ok: true; entradas: EntradaHistorialMedico[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(TABLA_SEGUIMIENTO_MEDICO_HISTORIAL)
    .select("id, editor_rol, editor_nombre, cambios, editado_at")
    .eq("curp", curp.trim().toUpperCase())
    .order("editado_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIMITE_HISTORIAL_MEDICO);

  if (error) {
    if (error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message)) {
      return { ok: false, error: ERROR_SEGUIMIENTO_MEDICO_NO_DESPLEGADO };
    }
    console.error(`[${TABLA_SEGUIMIENTO_MEDICO_HISTORIAL}]`, error.message);
    return { ok: false, error: "No se pudo leer el historial." };
  }
  return { ok: true, entradas: entradasHistorialMedico((data ?? []) as FilaHistorialMedico[]) };
}
