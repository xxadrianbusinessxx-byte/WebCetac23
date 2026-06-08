import type { SupabaseClient } from "@supabase/supabase-js";

import { recortarComentario } from "@/lib/escolar/comentarios";

import {

  codificarComentarioChat,

  decodificarComentarioChat,

  validarLongitudComentarioChat,

} from "./comentario-codigo";

import { validarLenguajeChat } from "./filtro-lenguaje";

import { MENSAJES_CHAT_TABLE } from "./constants";

import type { EnviarMensajeInput, MensajeChat } from "./types";



const CURP_ALUMNO_RE =

  /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/i;



/** Comentarios de perfil (profesor → alumno) llevan prefijo [autor]. */

function esMensajeChatGlobal(comentario: string, curp: string): boolean {

  if (comentario.trim().startsWith("[")) return false;

  return !CURP_ALUMNO_RE.test(curp.trim());

}



type FilaComentarios = {

  CURP: string;

  COMENTARIO: string;

  FECHA: string | null;

};



function filaAMensaje(row: FilaComentarios, index: number): MensajeChat {

  const { texto, imagenUrl } = decodificarComentarioChat(String(row.COMENTARIO));

  return {

    id: `${row.FECHA ?? "sin-fecha"}-${index}-${row.CURP}`,

    fecha: String(row.FECHA ?? new Date().toISOString()),

    remitenteMatricula: row.CURP,

    remitenteNombre: row.CURP,

    genero: "masculino",

    texto,

    imagenUrl,

  };

}



/** Mensajes del chat global (tabla COMENTARIOS). */

export async function listarMensajesChat(

  supabase: SupabaseClient,

  limite = 100,

): Promise<MensajeChat[]> {

  const { data, error } = await supabase

    .from(MENSAJES_CHAT_TABLE)

    .select("CURP, COMENTARIO, FECHA")

    .order("FECHA", { ascending: true, nullsFirst: false })

    .limit(limite * 3);



  if (error || !data) return [];



  return (data as FilaComentarios[])

    .filter((row) => esMensajeChatGlobal(row.COMENTARIO, row.CURP))

    .slice(-limite)

    .map((row, i) => filaAMensaje(row, i));

}



/** Guarda mensaje en COMENTARIOS (texto e imagen codificados, ≤200 chars). */

export async function enviarMensajeChat(

  supabase: SupabaseClient,

  input: EnviarMensajeInput,

): Promise<{ ok: true; mensaje: MensajeChat } | { ok: false; error: string }> {

  const texto = input.texto.trim();
  const imagen =
    input.imagenClave?.trim() || input.imagenUrl?.trim() || null;

  const errLenguaje = validarLenguajeChat(texto);
  if (errLenguaje) return { ok: false, error: errLenguaje };

  const errLen = validarLongitudComentarioChat(texto, imagen);
  if (errLen) return { ok: false, error: errLen };

  const comentario = recortarComentario(codificarComentarioChat(texto, imagen));



  const remitente = input.remitenteNombre.trim() || input.remitenteMatricula;

  const fecha = new Date().toISOString();



  const { data, error } = await supabase

    .from(MENSAJES_CHAT_TABLE)

    .insert({

      CURP: remitente,

      COMENTARIO: comentario,

      FECHA: fecha,

    })

    .select("CURP, COMENTARIO, FECHA")

    .single();



  if (error || !data) {

    return { ok: false, error: error?.message ?? "No se pudo enviar el mensaje." };

  }



  const mensaje = filaAMensaje(data as FilaComentarios, Date.now());

  return { ok: true, mensaje };

}


