import type { SupabaseClient } from "@supabase/supabase-js";
import { MENSAJES_CHAT_TABLE } from "./constants";
import type { EnviarMensajeInput, MensajeChat } from "./types";

function parseGenero(value: unknown): MensajeChat["genero"] {
  return value === "femenino" ? "femenino" : "masculino";
}

function filaAMensaje(row: Record<string, unknown>): MensajeChat {
  return {
    id: String(row.id),
    fecha: String(
      row.fecha ?? row.created_at ?? row.enviado_en ?? new Date().toISOString(),
    ),
    remitenteMatricula: String(row.remitente_matricula),
    remitenteNombre: String(row.remitente_nombre),
    genero: parseGenero(row.genero),
    texto: String(row.texto),
    imagenUrl: row.imagen_url ? String(row.imagen_url) : null,
  };
}

/** Lista mensajes del chat (más recientes al final). */
export async function listarMensajesChat(
  supabase: SupabaseClient,
  limite = 100,
): Promise<MensajeChat[]> {
  const { data, error } = await supabase
    .from(MENSAJES_CHAT_TABLE)
    .select("*")
    .order("fecha", { ascending: true })
    .limit(limite);

  if (error || !data) return [];
  return data.map((row) => filaAMensaje(row as Record<string, unknown>));
}

/** Registra un mensaje nuevo en la tabla. */
export async function enviarMensajeChat(
  supabase: SupabaseClient,
  input: EnviarMensajeInput,
): Promise<{ ok: true; mensaje: MensajeChat } | { ok: false; error: string }> {
  const fecha = new Date().toISOString();
  const { data, error } = await supabase
    .from(MENSAJES_CHAT_TABLE)
    .insert({
      fecha,
      remitente_matricula: input.remitenteMatricula,
      remitente_nombre: input.remitenteNombre,
      genero: input.genero,
      texto: input.texto,
      imagen_url: input.imagenUrl ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo enviar el mensaje." };
  }

  return { ok: true, mensaje: filaAMensaje(data as Record<string, unknown>) };
}
