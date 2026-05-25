"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  listarUrlsNoticiasInicio,
  publicIdNoticiaInicio,
  type NoticiaInicioSlot,
} from "@/lib/cloudinary/noticias";
import { subirImagenCloudinary } from "@/lib/cloudinary/upload";
import { bufferImagenDesdeFormData } from "@/lib/imagen/leer-archivo-form";

export async function actionObtenerNoticiasInicio() {
  return listarUrlsNoticiasInicio();
}

export async function actionPublicarNoticiaInicio(
  slot: NoticiaInicioSlot,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden publicar noticias." };
  }

  const leido = await bufferImagenDesdeFormData(formData);
  if (!leido.ok) return leido;

  return subirImagenCloudinary(leido.buffer, publicIdNoticiaInicio(slot));
}
