import "server-only";

import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";
import { cloudinaryConfigurado, getCloudinary } from "./config";
import { urlCloudinaryDesdePublicId } from "./urls";

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

export async function listarUrlsNoticiasInicio(): Promise<
  Record<NoticiaInicioSlot, string | null>
> {
  const [n1, n2] = await Promise.all([
    urlNoticiaInicioSiExiste(1),
    urlNoticiaInicioSiExiste(2),
  ]);
  return { 1: n1, 2: n2 };
}
