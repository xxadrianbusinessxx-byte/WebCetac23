"use server";

import { exigir } from "@/lib/auth/exigir";
import {
  listarUrlsNoticiasInicio,
  publicarNoticiaInicio,
  type NoticiaInicioSlot,
} from "@/lib/cloudinary/noticias";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import { esquemaNoticia } from "@/lib/validacion/esquemas-puro";

/**
 * Pública por diseño: es la portada, se sirve antes del login. Capacidad
 * `portada.ver` (excepción declarada del detector de permisos).
 *
 * @deprecated 2026-09-23. Sustituida por `app/actions/portada.ts`; ningún
 * componente la llama. No se borra aún (R8).
 */
export async function actionObtenerNoticiasInicio() {
  return listarUrlsNoticiasInicio();
}

/** @deprecated 2026-09-23. Sustituida por `app/actions/portada.ts`; ningún componente la llama. No se borra aún (R8). */
export async function actionPublicarNoticiaInicio(
  slot: NoticiaInicioSlot,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await exigir("noticia.publicar");
  if (!g.ok) return { ok: false, error: "Solo directivos pueden publicar noticias." };

  // Autorizar, luego validar, luego delegar: el archivo y su tipo se validan contra el
  // esquema declarado, con los dos mensajes que ya devolvía esta action.
  const entrada = leerFormData(esquemaNoticia, formData);
  if (!entrada.ok) return { ok: false, error: entrada.error };

  return publicarNoticiaInicio(slot, entrada.datos.archivo);
}
