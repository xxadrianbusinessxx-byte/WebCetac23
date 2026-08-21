import { normalizarNombre } from "./nombres";

/**
 * Detección determinística y local de columnas de un archivo (CSV/Excel).
 * Reutilizable para cualquier módulo que necesite importar archivos escolares
 * (alumnos, materias, docentes, grupos, calificaciones, etc.).
 *
 * NO usa APIs externas ni IA: solo reglas de aliases normalizados.
 */

/** Campos del roster de alumnos que se pueden mapear. */
export type CampoRoster =
  | "curp"
  | "nombre"
  | "pApellido"
  | "sApellido";

/** Mapeo campo → índice de columna (0-based) en el archivo. -1 = no usar. */
export type MapeoRoster = {
  curp: number;
  nombre: number;
  pApellido: number;
  sApellido: number;
};

/** Catálogo de aliases por campo (normalizados). */
export const CAMPO_ROSTER_ALIASES: Record<CampoRoster, string[]> = {
  curp: [
    "CURP",
    "CURP_ALUMNO",
    "CURP ALUMNO",
    "CLAVE CURP",
    "CLAVE_CURP",
    "CURP DEL ALUMNO",
  ],
  nombre: [
    "NOMBRE",
    "NOMBRES",
    "NOMBRE_ALUMNO",
    "NOMBRE ALUMNO",
    "NOMBRE COMPLETO",
    "NOMBRE DEL ALUMNO",
    "NOMBRE(S)",
    "NOMBRES DEL ALUMNO",
  ],
  pApellido: [
    "P_APELLIDO",
    "PATERNO",
    "APELLIDO_PATERNO",
    "APELLIDO PATERNO",
    "PRIMER_APELLIDO",
    "PRIMER APELLIDO",
    "1ER APELLIDO",
    "1ER_APELLIDO",
    "APELLIDO PATERNO DEL ALUMNO",
  ],
  sApellido: [
    "S_APELLIDO",
    "MATERNO",
    "APELLIDO_MATERNO",
    "APELLIDO MATERNO",
    "SEGUNDO_APELLIDO",
    "SEGUNDO APELLIDO",
    "2DO APELLIDO",
    "2DO_APELLIDO",
    "APELLIDO MATERNO DEL ALUMNO",
  ],
};

/** Normaliza un encabezado para comparar: trim, mayúsculas, sin acentos, espacios simples. */
export function normalizarEncabezadoColumna(encabezado: string): string {
  return normalizarNombre(encabezado);
}

/**
 * Detecta a qué campo del roster corresponde un encabezado (o null si no coincide).
 * Devuelve el campo y el alias que coincidió (para depuración).
 */
export function detectarCampoPorEncabezado(
  encabezado: string,
): { campo: CampoRoster; alias: string } | null {
  const norm = normalizarEncabezadoColumna(encabezado);
  if (!norm) return null;

  for (const campo of Object.keys(CAMPO_ROSTER_ALIASES) as CampoRoster[]) {
    for (const alias of CAMPO_ROSTER_ALIASES[campo]) {
      if (normalizarEncabezadoColumna(alias) === norm) {
        return { campo, alias };
      }
    }
  }
  return null;
}

/**
 * Sugiere automáticamente el mapeo de columnas del roster a partir de los
 * encabezados del archivo. Cada campo se asigna a la primera columna que
 * coincida con un alias; si no hay coincidencia queda en -1 ("No identificado").
 */
export function detectarColumnasRoster(encabezados: string[]): MapeoRoster {
  const mapeo: MapeoRoster = {
    curp: -1,
    nombre: -1,
    pApellido: -1,
    sApellido: -1,
  };
  const usados = new Set<number>();

  encabezados.forEach((encabezado, indice) => {
    const deteccion = detectarCampoPorEncabezado(encabezado);
    if (!deteccion) return;
    if (usados.has(indice)) return;
    if (mapeo[deteccion.campo] !== -1) return; // ya asignado
    mapeo[deteccion.campo] = indice;
    usados.add(indice);
  });

  return mapeo;
}

/** Valida que un mapeo sea estructuralmente correcto (índices enteros válidos). */
export function mapeoRosterValido(
  mapeo: unknown,
  numColumnas: number,
): mapeo is MapeoRoster {
  if (!mapeo || typeof mapeo !== "object") return false;
  const m = mapeo as Record<string, unknown>;

  const campos: CampoRoster[] = ["curp", "nombre", "pApellido", "sApellido"];
  for (const campo of campos) {
    const v = m[campo];
    if (typeof v !== "number" || !Number.isInteger(v)) return false;
    if (v < -1 || v >= numColumnas) return false;
  }

  // No permitir que dos campos usen el mismo índice (salvo -1).
  const usados = new Set<number>();
  for (const campo of campos) {
    const v = m[campo] as number;
    if (v === -1) continue;
    if (usados.has(v)) return false;
    usados.add(v);
  }

  return true;
}

/** Crea un mapeo a partir de un objeto parcial (para la UI). */
export function crearMapeoRoster(parcial: Partial<MapeoRoster>): MapeoRoster {
  return {
    curp: parcial.curp ?? -1,
    nombre: parcial.nombre ?? -1,
    pApellido: parcial.pApellido ?? -1,
    sApellido: parcial.sApellido ?? -1,
  };
}
