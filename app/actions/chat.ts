"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { validarLongitudComentarioChat } from "@/lib/chat/comentario-codigo";
import { enviarMensajeChat, listarMensajesChat } from "@/lib/chat/storage";
import type { EnviarMensajeInput } from "@/lib/chat/types";
import { subirImagenCloudinary } from "@/lib/cloudinary/upload";
import { publicIdChatUpload } from "@/lib/cloudinary/urls";
import { createClient } from "@/lib/supabase/server";

export async function actionListarMensajesChat() {
  const supabase = await createClient();
  return listarMensajesChat(supabase);
}

export async function actionSubirImagenChat(
  formData: FormData,
): Promise<
  { ok: true; url: string; clave: string } | { ok: false; error: string }
> {
  const sesion = await obtenerSesionPortal();
  if (!sesion) return { ok: false, error: "Sesión no válida." };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Solo se permiten imágenes." };
  }

  const curp =
    sesion.curp?.replace(/[^a-zA-Z0-9]/g, "_") ??
    sesion.matricula.replace(/[^a-zA-Z0-9]/g, "_");
  const unique = `${Date.now()}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());
  return subirImagenCloudinary(buffer, publicIdChatUpload(curp, unique));
}

export async function actionEnviarMensajeChat(input: EnviarMensajeInput) {
  const texto = input.texto.trim();
  const imagenClave =
    input.imagenClave?.trim() ||
    input.imagenUrl?.trim() ||
    null;

  const errLen = validarLongitudComentarioChat(texto, imagenClave);
  if (errLen) {
    return { ok: false as const, error: errLen };
  }

  const supabase = await createClient();
  return enviarMensajeChat(supabase, {
    ...input,
    texto,
    imagenUrl: imagenClave,
    imagenClave,
  });
}
