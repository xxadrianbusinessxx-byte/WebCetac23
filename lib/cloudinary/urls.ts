import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";
import { asegurarHttps } from "@/lib/urls/seguras";

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

function cloudNamePublico(): string {
  const cloud =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() ||
    process.env.CLOUDINARY_CLOUD_NAME?.trim() ||
    "";
  if (!cloud || /CLOUDINARY_URL|cloudinary:\/\//i.test(cloud)) return "";
  return cloud;
}

/** URL pública optimizada (Next/Image o <img>). */
export function urlCloudinaryDesdePublicId(publicId: string): string {
  const cloud = cloudNamePublico();
  if (!cloud) return "";
  const limpio = publicId.replace(/^\/+/, "");
  const id = limpio.includes("/")
    ? limpio
    : `${CLOUDINARY_FOLDER}/${limpio}`;
  return (
    asegurarHttps(
      `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto/${id}`,
    ) ?? ""
  );
}

export function urlFotoPerfil(curp: string): string {
  return urlCloudinaryDesdePublicId(publicIdPerfilUpload(curp));
}
