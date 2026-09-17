"use server";

import { exigir } from "@/lib/auth/exigir";
import {
  listarUrlsNoticiasInicio,
  publicarNoticiaInicio,
  type NoticiaInicioSlot,
} from "@/lib/cloudinary/noticias";

/**
 * Pública por diseño: es la portada, se sirve antes del login. Capacidad
 * `portada.ver` (excepción declarada del detector de permisos).
 */
export async function actionObtenerNoticiasInicio() {
  return listarUrlsNoticiasInicio();
}

export async function actionPublicarNoticiaInicio(
  slot: NoticiaInicioSlot,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: "Solo directivos pueden publicar noticias." };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Solo se permiten imágenes." };
  }

  return publicarNoticiaInicio(slot, archivo);
}
