/** Eventos / noticias en inicio de sesión y perfiles (slots en Cloudinary). */

export const MAX_EVENTOS_INICIO = 8;

export const EVENTOS_INICIO_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type EventoInicioSlot = (typeof EVENTOS_INICIO_SLOTS)[number];

export type UrlsEventosInicio = Record<EventoInicioSlot, string | null>;

export function esSlotEventoValido(n: number): n is EventoInicioSlot {
  return (
    Number.isInteger(n) && n >= 1 && n <= MAX_EVENTOS_INICIO
  );
}

export type EventoInicioConImagen = {
  slot: EventoInicioSlot;
  url: string;
};

/** Solo slots que ya tienen imagen en Cloudinary (para el carrusel). */
export function eventosConImagen(
  urls: Partial<UrlsEventosInicio> | UrlsEventosInicio,
): EventoInicioConImagen[] {
  const lista: EventoInicioConImagen[] = [];
  for (const slot of EVENTOS_INICIO_SLOTS) {
    const url = urls[slot];
    if (url?.trim()) lista.push({ slot, url: url.trim() });
  }
  return lista;
}
