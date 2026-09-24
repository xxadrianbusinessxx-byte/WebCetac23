import "server-only";

/**
 * @deprecated 2026-09-23 (PROMPT N). Todo este módulo —las «noticias de inicio» en
 * dos slots fijos de Cloudinary— queda SUSTITUIDO por la portada administrable:
 *   · datos:    `lib/escolar/portada/portada.ts` + tabla `portada_medios`
 *   · acciones: `app/actions/portada.ts`
 *   · panel:    «Configuración → Video e imágenes» (`portada-medios-panel.tsx`)
 *
 * Por qué se sustituyó y no se amplió: comprobaba existencia con la API de
 * administración de Cloudinary (500 consultas/hora) en una página PÚBLICA, no
 * guardaba orden ni carrera, y al sobrescribir el mismo `public_id` el CDN podía
 * seguir sirviendo la versión vieja. Nunca tuvo superficie: ningún componente
 * lo llamaba.
 *
 * NO se borra todavía (R8, filosofía §14): se retira en su propio cambio, cuando
 * la portada nueva lleve un tiempo en producción. No añadir llamadores nuevos.
 */

import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";
import { cloudinaryConfigurado, getCloudinary } from "./config.ts";
import { subirImagenCloudinary } from "./upload.ts";
import { urlCloudinaryDesdePublicId } from "./urls.ts";

export const NOTICIAS_INICIO_SLOTS = [1, 2] as const;
export type NoticiaInicioSlot = (typeof NOTICIAS_INICIO_SLOTS)[number];

/**
 * O5 — Caché en memoria de la existencia de cada noticia de inicio (por slot).
 * TTL 10 min. Se invalida en `actionPublicarNoticiaInicio` tras publicar.
 * LIMITACIÓN: por instancia serverless; en otras instancias el TTL acota la
 * obsolescencia.
 */
const TTL_CLOUDINARY_MS = 10 * 60_000;
const noticiasCache = new Map<
  NoticiaInicioSlot,
  { url: string | null; expiresAt: number }
>();

/** Invalida la caché de noticias de inicio (tras publicar/modificar). */
export function invalidarNoticiasInicio(): void {
  noticiasCache.clear();
}

export function publicIdNoticiaInicio(slot: NoticiaInicioSlot): string {
  return `noticia_inicio_${slot}`;
}

export function claveNoticiaInicio(slot: NoticiaInicioSlot): string {
  return `${CLOUDINARY_FOLDER}/${publicIdNoticiaInicio(slot)}`;
}

/** @deprecated Usa `lib/escolar/portada/portada.ts` (ver la cabecera). */
export async function urlNoticiaInicioSiExiste(
  slot: NoticiaInicioSlot,
): Promise<string | null> {
  if (!cloudinaryConfigurado()) return null;

  const ahora = Date.now();
  const guardado = noticiasCache.get(slot);
  if (guardado && guardado.expiresAt > ahora) return guardado.url;

  const clave = claveNoticiaInicio(slot);
  let url: string | null = null;
  try {
    const cld = getCloudinary();
    await cld.api.resource(clave, { resource_type: "image" });
    url = urlCloudinaryDesdePublicId(claveNoticiaInicio(slot));
  } catch {
    url = null;
  }
  noticiasCache.set(slot, { url, expiresAt: ahora + TTL_CLOUDINARY_MS });
  return url;
}

/** @deprecated Usa `lib/escolar/portada/portada.ts` (ver la cabecera). */
export async function listarUrlsNoticiasInicio(): Promise<
  Record<NoticiaInicioSlot, string | null>
> {
  const [n1, n2] = await Promise.all([
    urlNoticiaInicioSiExiste(1),
    urlNoticiaInicioSiExiste(2),
  ]);
  return { 1: n1, 2: n2 };
}

/**
 * Publica la imagen de un slot de noticias de inicio: convierte el archivo a
 * buffer, lo sube a Cloudinary con el public_id determinista del slot e
 * invalida la caché. Todo el I/O de Cloudinary vive aquí; la Server Action solo
 * valida la sesión y el archivo antes de delegar.
 */
/** @deprecated Usa `lib/escolar/portada/portada.ts` (ver la cabecera). */
export async function publicarNoticiaInicio(
  slot: NoticiaInicioSlot,
  archivo: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const subida = await subirImagenCloudinary(buffer, publicIdNoticiaInicio(slot));
  if (!subida.ok) return { ok: false, error: subida.error };
  // O5 — La noticia cambió: invalida la caché para que sea visible de inmediato.
  invalidarNoticiasInicio();
  return { ok: true, url: subida.url };
}
