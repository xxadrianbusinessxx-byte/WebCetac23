import "server-only";

import { cloudinaryConfigurado, getCloudinary } from "./config";
import { publicIdPerfil, urlFotoPerfil } from "./urls";

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
    const res = await cld.api.resource(publicIdPerfil(key), {
      resource_type: "image",
    });
    url = res.secure_url ?? urlFotoPerfil(key);
  } catch {
    url = null;
  }
  fotoCache.set(key, { url, expiresAt: ahora + TTL_CLOUDINARY_MS });
  return url;
}
