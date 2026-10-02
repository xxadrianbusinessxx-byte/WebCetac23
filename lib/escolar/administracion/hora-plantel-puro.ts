/**
 * hora-plantel-puro.ts — MÓDULO PURO. La hora LOCAL del plantel, en un solo sitio.
 *
 * Por qué existe: la base guarda instantes (`timestamptz`, en UTC) y las personas
 * piensan en «el martes a las 10». Convertir con `toISOString().slice(0, 10)` da
 * el día UTC, no el del plantel: un reporte de las 19:00 locales caería al día
 * siguiente. Y convertir con `new Date().getHours()` da la hora del SERVIDOR, que
 * en Vercel es UTC. Las dos conversiones viven aquí y en ningún otro sitio.
 *
 * Lo usan los reportes (fecha local de `ocurrido_at` en Notificaciones) y la
 * agenda de citas (huecos «fecha + hora» ↔ `citas.propuesta_at`).
 *
 * Sin I/O: `Intl` es cálculo, no lectura.
 */

/** Zona del plantel (CETAC 23). */
export const ZONA_PLANTEL = "America/Mexico_City";

/**
 * Desfase FIJO de esa zona. México dejó el horario de verano en octubre de 2022,
 * así que no varía con la estación. Si algún día vuelve a variar, este es el
 * único sitio que cambia (`fechaHoraLocal` ya usa la zona y se adaptaría sola).
 */
export const DESFASE_PLANTEL = "-06:00";

/** Un instante leído en la hora del plantel: «YYYY-MM-DD» y «HH:MM». */
export type FechaHoraLocal = { fecha: string; hora: string };

const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_PLANTEL,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Un instante (ISO con zona, como lo devuelve PostgREST) → fecha y hora del
 * plantel. `null` si el texto no es un instante válido: inventar una fecha
 * sería peor que no mostrarla.
 */
export function fechaHoraLocal(iso: string): FechaHoraLocal | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const partes: Record<string, string> = {};
  for (const p of FORMATO.formatToParts(new Date(t))) partes[p.type] = p.value;
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

/**
 * Fecha y hora del plantel → instante ISO que se guarda en la base. No valida
 * que el hueco exista: eso lo decide quien llama (`agenda-citas-puro`).
 */
export function instanteDelPlantel(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00${DESFASE_PLANTEL}`;
}
