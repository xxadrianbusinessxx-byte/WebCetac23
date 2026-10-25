import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";

/** Solo URLs e IDs; sin SDK de Cloudinary (seguro en Client Components). */

function sanitizarId(curp: string): string {
  return curp.trim().toUpperCase().replace(/[^a-zA-Z0-9]/g, "_");
}

/** ID para upload_stream (sin carpeta; la carpeta va en folder). */
export function publicIdPerfilUpload(curp: string): string {
  return `perfil_${sanitizarId(curp)}`;
}

/** Ruta completa en Cloudinary (API resource). */
export function publicIdPerfil(curp: string): string {
  return `${CLOUDINARY_FOLDER}/${publicIdPerfilUpload(curp)}`;
}

export function publicIdChatUpload(curp: string, unique: string): string {
  return `chat_${sanitizarId(curp)}_${unique}`;
}

/**
 * URL pública optimizada (Next/Image o <img>).
 *
 * `opciones` es ADITIVO (PROMPT L, portada): sin él, la URL es exactamente la de
 * siempre, así que los llamadores anteriores no cambian.
 * - `version`: va en la URL (`/v123/`). Al reemplazar un archivo cambia, y con
 *   ella la URL, así que ningún CDN sirve la copia vieja.
 * - `tipo`: `video` sirve desde `/video/upload/`, que es donde vive un video.
 */
export function urlCloudinaryDesdePublicId(
  publicId: string,
  transformaciones: string = "f_auto,q_auto",
  opciones: { version?: number | string | null; tipo?: "image" | "video" } = {},
): string {
  const cloud =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() ||
    process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  const limpio = publicId.replace(/^\/+/, "");
  const id = limpio.includes("/")
    ? limpio
    : `${CLOUDINARY_FOLDER}/${limpio}`;
  const tipo = opciones.tipo ?? "image";
  const version = opciones.version != null && `${opciones.version}` !== "" ? `v${opciones.version}/` : "";
  return `https://res.cloudinary.com/${cloud}/${tipo}/upload/${transformaciones}/${version}${id}`;
}

/**
 * PROMPT Y — URL del ORIGINAL de la foto de perfil, sin transformación, para
 * preguntar a la CDN si existe (`HEAD`: 200 o 404). No es la que se pinta: la que
 * se pinta es `urlFotoPerfilAvatar`. "" si falta el cloud name.
 */
export function urlComprobacionFotoPerfil(curp: string): string {
  const cloud =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() ||
    process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/image/upload/${publicIdPerfil(curp)}`;
}

export function urlFotoPerfil(curp: string): string {
  return urlCloudinaryDesdePublicId(publicIdPerfilUpload(curp));
}

/**
 * FASE 7 (6A-2) — URL de la foto de perfil adaptada para AVATAR.
 *
 * La foto original se sube con un máximo de 1280 px / ~0.8 MB (comprimida en
 * el cliente). Para mostrarla como avatar de ~100–130 px se aplica una
 * transformación que reduce la descarga a unos pocos KB sin cambiar el
 * recurso ni su identidad (public_id): `w_256,c_fill` recorta y reencuadra en
 * un cuadrado de 256 px, y `f_auto,q_auto` mantiene el formato/calidad óptimos.
 */
export function urlFotoPerfilAvatar(curp: string): string {
  return urlCloudinaryDesdePublicId(
    publicIdPerfilUpload(curp),
    "w_256,c_fill,f_auto,q_auto",
  );
}
