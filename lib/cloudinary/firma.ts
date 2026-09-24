import "server-only";

import { cloudinaryConfigurado, getCloudinary } from "./config.ts";

/**
 * firma.ts — firma una subida DIRECTA del navegador a Cloudinary.
 *
 * ── Por qué la subida no pasa por el servidor ──────────────────────────────
 * Next limita el cuerpo de una Server Action a 1 MB y Vercel corta en 4,5 MB.
 * Una imagen de portada de 2800 × 1200 o un video no caben. Así que el servidor
 * solo FIRMA —comprueba permisos y fija qué `public_id` se puede escribir— y el
 * navegador sube el archivo directo a Cloudinary con esa firma.
 *
 * El secreto (`CLOUDINARY_API_SECRET`) se usa para calcular la firma y NO se
 * devuelve: lo que sale de aquí se puede entregar al navegador sin riesgo.
 *
 * La firma cubre `public_id` y `timestamp`: el navegador no puede cambiar el
 * destino sin invalidarla, y Cloudinary la rechaza pasada una hora. El tamaño y
 * la forma del archivo NO los limita la firma: los comprueba el servidor DESPUÉS,
 * contra el recurso real (`actionRegistrarMedioPortada`, prompt M).
 */

export type TipoRecurso = "image" | "video";

export type FirmaSubida = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  public_id: string;
  resourceType: TipoRecurso;
  /** A dónde hace el navegador el POST. */
  urlSubida: string;
};

export function firmarSubida(publicId: string, resourceType: TipoRecurso): FirmaSubida {
  if (!cloudinaryConfigurado()) {
    throw new Error("Cloudinary no está configurado en el servidor.");
  }
  const cld = getCloudinary();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY!.trim();
  const timestamp = Math.floor(Date.now() / 1000);

  // Exactamente los parámetros que el navegador enviará (salvo file, api_key,
  // resource_type y signature, que Cloudinary no firma).
  const aFirmar = { public_id: publicId, timestamp };
  const signature = cld.utils.api_sign_request(aFirmar, process.env.CLOUDINARY_API_SECRET!.trim());

  return {
    cloudName,
    apiKey,
    timestamp,
    signature,
    public_id: publicId,
    resourceType,
    urlSubida: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
  };
}

/** Lo que Cloudinary sabe de un recurso: la verdad contra la que valida el servidor. */
export type RecursoCloudinary = {
  public_id: string;
  version: number;
  format: string;
  bytes: number;
  width: number;
  height: number;
  duration: number | null;
  resource_type: TipoRecurso;
};

/**
 * Lee el recurso REAL. Usa la API de administración —limitada a 500 consultas
 * por hora en el plan gratuito—, por eso solo se llama una vez por subida y
 * NUNCA para pintar la portada pública.
 * Devuelve `null` si no existe.
 */
export async function leerRecurso(publicId: string, resourceType: TipoRecurso): Promise<RecursoCloudinary | null> {
  const cld = getCloudinary();
  try {
    const r = await cld.api.resource(publicId, { resource_type: resourceType, media_metadata: false });
    return {
      public_id: r.public_id,
      version: Number(r.version),
      format: String(r.format ?? ""),
      bytes: Number(r.bytes ?? 0),
      width: Number(r.width ?? 0),
      height: Number(r.height ?? 0),
      duration: r.duration == null ? null : Number(r.duration),
      resource_type: resourceType,
    };
  } catch (e) {
    const codigo = (e as { error?: { http_code?: number } })?.error?.http_code;
    if (codigo === 404) return null;
    throw e;
  }
}

/**
 * Borra un recurso. `invalidate: true` pide al CDN que olvide las copias en
 * caché. No lanza si el recurso ya no existía: borrar lo inexistente es éxito.
 */
export async function borrarRecurso(publicId: string, resourceType: TipoRecurso): Promise<boolean> {
  const cld = getCloudinary();
  const r = await cld.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  return r?.result === "ok" || r?.result === "not found";
}
