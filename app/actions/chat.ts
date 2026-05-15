"use server";

import { enviarMensajeChat, listarMensajesChat } from "@/lib/chat/storage";
import type { EnviarMensajeInput } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/server";

export async function actionListarMensajesChat() {
  const supabase = await createClient();
  return listarMensajesChat(supabase);
}

export async function actionEnviarMensajeChat(input: EnviarMensajeInput) {
  if (!input.texto.trim() && !input.imagenUrl) {
    return { ok: false as const, error: "Escribe un mensaje o adjunta una imagen." };
  }
  const supabase = await createClient();
  return enviarMensajeChat(supabase, {
    ...input,
    texto: input.texto.trim(),
  });
}
