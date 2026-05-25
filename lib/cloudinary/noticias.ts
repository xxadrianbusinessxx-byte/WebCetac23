import "server-only";

import {
  EVENTOS_INICIO_SLOTS,
  MAX_EVENTOS_INICIO,
  esSlotEventoValido,
  type EventoInicioSlot,
  type UrlsEventosInicio,
} from "@/lib/escolar/eventos-inicio";
import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";
import { cloudinaryConfigurado, getCloudinary } from "./config";
import { asegurarHttps } from "@/lib/urls/seguras";
import { urlCloudinaryDesdePublicId } from "./urls";

export {
  EVENTOS_INICIO_SLOTS,
  EVENTOS_INICIO_SLOTS as NOTICIAS_INICIO_SLOTS,
  MAX_EVENTOS_INICIO,
  esSlotEventoValido,
  type EventoInicioSlot,
  type EventoInicioSlot as NoticiaInicioSlot,
  type UrlsEventosInicio,
};

export { eventosConImagen } from "@/lib/escolar/eventos-inicio";

export function publicIdNoticiaInicio(slot: EventoInicioSlot): string {
  return `noticia_inicio_${slot}`;
}

export function claveNoticiaInicio(slot: EventoInicioSlot): string {
  return `${CLOUDINARY_FOLDER}/${publicIdNoticiaInicio(slot)}`;
}

export async function urlNoticiaInicioSiExiste(
  slot: EventoInicioSlot,
): Promise<string | null> {
  if (!cloudinaryConfigurado()) return null;
  const clave = claveNoticiaInicio(slot);
  try {
    const cld = getCloudinary();
    await cld.api.resource(clave, { resource_type: "image" });
    return asegurarHttps(urlCloudinaryDesdePublicId(claveNoticiaInicio(slot)));
  } catch {
    return null;
  }
}

export async function listarUrlsNoticiasInicio(): Promise<UrlsEventosInicio> {
  const pares = await Promise.all(
    EVENTOS_INICIO_SLOTS.map(
      async (slot) =>
        [slot, await urlNoticiaInicioSiExiste(slot)] as const,
    ),
  );
  return Object.fromEntries(pares) as UrlsEventosInicio;
}
