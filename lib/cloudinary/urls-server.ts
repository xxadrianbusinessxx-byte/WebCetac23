import "server-only";

import { cloudinaryConfigurado, getCloudinary } from "./config";
import { publicIdPerfil, urlFotoPerfilAvatar } from "./urls";

/**
 * O5 — Caché en memoria de la existencia/URL de la foto de perfil (por CURP).
 * TTL 10 min. Se invalida en `actionSubirFotoPerfil` tras una subida exitosa.
 * LIMITACIÓN: por instancia serverless; en otras instancias el TTL acota la
 * obsolescencia.
 */
const TTL_CLOUDINARY_MS = 10 * 60_000;
const fotoCache = new Map<
  string,
  { url: string | null; expiresAt: number }
>();

/** Invalida la foto cacheada de un alumno (tras subir una nueva foto). */
export function invalidarUrlFotoPerfil(curp: string): void {
  const key = curp.trim().toUpperCase();
  if (key) fotoCache.delete(key);
}

/** Devuelve URL si el recurso existe en Cloudinary (solo servidor). O5: cachea el resultado. */
export async function obtenerUrlFotoPerfilSiExiste(
  curp: string,
): Promise<string | null> {
  const key = curp.trim().toUpperCase();
  if (!key) return null;

  const ahora = Date.now();
  const guardado = fotoCache.get(key);
  if (guardado && guardado.expiresAt > ahora) return guardado.url;

  if (!cloudinaryConfigurado()) return null;

  let url: string | null = null;
  try {
    const cld = getCloudinary();
    // api.resource lanza si el recurso NO existe: llegar más allá significa
    // que la foto existe.
    await cld.api.resource(publicIdPerfil(key), {
      resource_type: "image",
    });
    // FASE 7 (6A-2) — URL determinista con transformación de AVATAR
    // (w_256,c_fill,f_auto,q_auto) en lugar del secure_url original sin
    // transformar. La identidad del recurso (public_id) NO cambia; solo se
    // optimiza la descarga para su uso como foto de perfil.
    url = urlFotoPerfilAvatar(key);
  } catch {
    url = null;
  }
  fotoCache.set(key, { url, expiresAt: ahora + TTL_CLOUDINARY_MS });
  return url;
}
