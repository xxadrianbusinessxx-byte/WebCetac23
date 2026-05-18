import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMENTARIO_MAX_LENGTH,
  TABLA_COMENTARIOS,
  TABLA_COMENTARIOS_PROFESORES,
} from "./tables";
import type { ComentarioProfesorRow, ComentarioRow } from "./types";

export function recortarComentario(texto: string): string {
  return texto.trim().slice(0, COMENTARIO_MAX_LENGTH);
}

export async function listarComentariosAlumno(
  supabase: SupabaseClient,
  curp: string,
): Promise<ComentarioRow[]> {
  const { data, error } = await supabase
    .from(TABLA_COMENTARIOS)
    .select("CURP, COMENTARIO, FECHA")
    .eq("CURP", curp.trim().toUpperCase())
    .order("FECHA", { ascending: false, nullsFirst: false });

  if (error || !data) return [];
  return data as ComentarioRow[];
}

export async function guardarComentarioAlumno(
  supabase: SupabaseClient,
  input: {
    curpAlumno: string;
    comentario: string;
    autorProfesor: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const texto = recortarComentario(input.comentario);
  if (!texto) return { ok: false, error: "El comentario no puede estar vacío." };

  const autor = input.autorProfesor.trim();
  const cuerpo = autor ? `[${autor}] ${texto}` : texto;
  const final =
    cuerpo.length > COMENTARIO_MAX_LENGTH
      ? cuerpo.slice(0, COMENTARIO_MAX_LENGTH)
      : cuerpo;

  const { error } = await supabase.from(TABLA_COMENTARIOS).insert({
    CURP: input.curpAlumno.trim().toUpperCase(),
    COMENTARIO: final,
    FECHA: new Date().toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarComentariosProfesores(
  supabase: SupabaseClient,
): Promise<ComentarioProfesorRow[]> {
  const { data, error } = await supabase
    .from(TABLA_COMENTARIOS_PROFESORES)
    .select('"PROFESOR/DIRECTIVO", COMENTARIO, "NOMBRE/ALUMNO"');

  if (error || !data) return [];
  return data as ComentarioProfesorRow[];
}

export async function guardarComentarioProfesor(
  supabase: SupabaseClient,
  input: {
    profesorODirectivo: string;
    nombreAlumno: string;
    comentario: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const texto = recortarComentario(input.comentario);
  if (!texto) return { ok: false, error: "El comentario no puede estar vacío." };

  const { error } = await supabase.from(TABLA_COMENTARIOS_PROFESORES).insert({
    "PROFESOR/DIRECTIVO": input.profesorODirectivo.trim(),
    "NOMBRE/ALUMNO": input.nombreAlumno.trim(),
    COMENTARIO: texto,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
