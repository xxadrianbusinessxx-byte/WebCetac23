"use server";

import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  esSlotEventoValido,
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
  slot: number,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return { ok: false, error: "Solo directivos pueden publicar noticias." };
  }

  if (!esSlotEventoValido(slot)) {
    return { ok: false, error: "Número de evento no válido." };
  }

  const leido = await bufferImagenDesdeFormData(formData);
  if (!leido.ok) return leido;

  // Mismo public_id por slot → reemplaza la imagen anterior en Cloudinary
  return subirImagenCloudinary(leido.buffer, publicIdNoticiaInicio(slot));
}
