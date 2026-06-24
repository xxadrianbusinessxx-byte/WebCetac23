import { parseCsvTexto } from "./csv";
import type { MateriaTablaVista } from "./types";

/** Versión guardada como JSON (materias / actividades). */
export const CONTENIDO_TABLA_JSON_VERSION = 2 as const;

export type ContenidoTablaJson = {
  _v: typeof CONTENIDO_TABLA_JSON_VERSION;
  encabezados: string[];
  filas: string[][];
};

export function esContenidoTablaJson(texto: string): boolean {
  const t = texto.trim();
  return t.startsWith("{") && t.includes('"encabezados"') && t.includes('"filas"');
}

/** Parsea un bloque de texto guardado en `contenido` (JSON estructurado o CSV). */
export function contenidoTextoAVista(raw: string): MateriaTablaVista | null {
  const t = raw.trim();
  if (!t) return null;

  if (esContenidoTablaJson(t)) {
    try {
      const o = JSON.parse(t) as Partial<ContenidoTablaJson>;
      if (
        Array.isArray(o.encabezados) &&
        Array.isArray(o.filas) &&
        o.filas.every((r) => Array.isArray(r))
      ) {
        return {
          encabezados: o.encabezados.map((h) => String(h ?? "")),
          filas: o.filas as string[][],
        };
      }
    } catch {
      /* seguir como CSV */
    }
  }

  const matriz = parseCsvTexto(t);
  if (!matriz.length) return null;
  const [encabezados, ...filas] = matriz;
  return {
    encabezados: encabezados ?? [],
    filas,
  };
}
