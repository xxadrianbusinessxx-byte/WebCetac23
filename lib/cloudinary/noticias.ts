import "server-only";

import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";
import { cloudinaryConfigurado, getCloudinary } from "./config";
import { urlCloudinaryDesdePublicId } from "./urls";

export const NOTICIAS_INICIO_SLOTS = [1, 2] as const;
export type NoticiaInicioSlot = (typeof NOTICIAS_INICIO_SLOTS)[number];

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
  const clave = claveNoticiaInicio(slot);
  try {
    const cld = getCloudinary();
    await cld.api.resource(clave, { resource_type: "image" });
    return urlCloudinaryDesdePublicId(claveNoticiaInicio(slot));
  } catch {
    return null;
  }
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
