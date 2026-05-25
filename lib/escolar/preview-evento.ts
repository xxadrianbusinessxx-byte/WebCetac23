import {
  EVENTOS_INICIO_SLOTS,
  eventosConImagen,
  type EventoInicioConImagen,
  type EventoInicioSlot,
  type UrlsEventosInicio,
} from "./eventos-inicio";
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

/** Carrusel y listados: misma URL con ?v= para no mostrar la imagen anterior en caché. */
export function eventosConImagenConCache(
  urls: Partial<UrlsEventosInicio> | UrlsEventosInicio,
  versionPorSlot: Partial<Record<EventoInicioSlot, number>>,
): EventoInicioConImagen[] {
  const t = Date.now();
  return eventosConImagen(urls)
    .map((ev) => {
      const version = versionPorSlot[ev.slot] ?? t;
      const url = urlEventoConCache(ev.url, version);
      return url ? { slot: ev.slot, url } : null;
    })
    .filter((ev): ev is EventoInicioConImagen => ev !== null);
}

export function actualizarVersionesTrasUrls(
  urls: UrlsEventosInicio,
  prev: Partial<Record<EventoInicioSlot, number>>,
  forzarSlot?: EventoInicioSlot,
): Partial<Record<EventoInicioSlot, number>> {
  const t = Date.now();
  const next = { ...prev };
  for (const slot of EVENTOS_INICIO_SLOTS) {
    if (!urls[slot]?.trim()) {
      delete next[slot];
    } else if (forzarSlot === slot || !next[slot]) {
      next[slot] = t;
    }
  }
  return next;
}
