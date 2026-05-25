import type { EventoInicioSlot, UrlsEventosInicio } from "./eventos-inicio";
import { asegurarHttps } from "@/lib/urls/seguras";

/** Evita que el navegador muestre la imagen vieja tras reemplazar en Cloudinary. */
export function urlEventoConCache(
  url: string | null | undefined,
  version: number,
): string | null {
  const base = asegurarHttps(url);
  if (!base) return null;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${version}`;
}

export type EstadoPreviewEvento = {
  slot: EventoInicioSlot;
  urlsPublicadas: UrlsEventosInicio | null;
  /** Data URL del archivo nuevo aún no publicado */
  previewLocal: string | null;
  versionPorSlot: Partial<Record<EventoInicioSlot, number>>;
};

/**
 * URL para mostrar en vista previa (misma lógica que el carrusel):
 * prioriza borrador local; si no, imagen publicada con versión de caché.
 */
export function resolverUrlPreviewEvento(
  estado: EstadoPreviewEvento,
): string | null {
  if (estado.previewLocal?.trim()) return estado.previewLocal;

  const remota = estado.urlsPublicadas?.[estado.slot];
  if (!remota) return null;

  const version = estado.versionPorSlot[estado.slot] ?? 0;
  return urlEventoConCache(remota, version);
}

export function slotTieneImagenPublicada(
  urls: UrlsEventosInicio | null,
  slot: EventoInicioSlot,
): boolean {
  return Boolean(urls?.[slot]?.trim());
}
