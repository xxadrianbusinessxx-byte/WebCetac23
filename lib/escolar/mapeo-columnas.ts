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
  | "sApellido"
  | "grado"
  | "grupo"
  | "carrera";

/**
 * Mapeo campo → índice de columna (0-based) en el archivo. -1 = no usar.
 * Los campos académicos (grado/grupo/carrera) son OPCIONALES: su ausencia en
 * un mapeo recibido se interpreta como -1 (compatibilidad con cargas solo-ALUMNOS).
 */
export type MapeoRoster = {
  curp: number;
  nombre: number;
  pApellido: number;
  sApellido: number;
  grado: number;
  grupo: number;
  carrera: number;
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
  grado: [
    "GRADO",
    "GRADO ESCOLAR",
    "GRADO_ESCOLAR",
    "GRADO ACADEMICO",
    "GRADO_ACADEMICO",
  ],
  grupo: ["GRUPO", "GRUPO ESCOLAR", "GRUPO_ESCOLAR"],
  carrera: ["CARRERA", "CARRERA ESCOLAR", "CARRERA_ESCOLAR"],
};

/**
 * Normaliza un encabezado de columna para comparar: trim, mayúsculas, sin
 * acentos, espacios simples y tratando `_` y `-` como separadores equivalentes
 * al espacio. Así "P_APELLIDO", "P-APELLIDO" y "P APELLIDO" se consideran el
 * mismo encabezado.
 */
export function normalizarEncabezadoColumna(encabezado: string): string {
  return normalizarNombre(encabezado.replace(/[_\-]+/g, " "));
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
    grado: -1,
    grupo: -1,
    carrera: -1,
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

  // Campos de identidad/nombre: OBLIGATORIOS en el mapeo.
  const camposBase: CampoRoster[] = ["curp", "nombre", "pApellido", "sApellido"];
  // Campos académicos: OPCIONALES (si faltan se interpretan como -1).
  const camposAcademicos: CampoRoster[] = ["grado", "grupo", "carrera"];

  const validarIndice = (v: unknown): boolean =>
    typeof v === "number" && Number.isInteger(v) && v >= -1 && v < numColumnas;

  for (const campo of camposBase) {
    if (!validarIndice(m[campo])) return false;
  }

  // No permitir que dos campos usen el mismo índice (salvo -1).
  const usados = new Set<number>();
  for (const campo of [...camposBase, ...camposAcademicos]) {
    const v = m[campo] as number | undefined;
    if (v === undefined) continue; // académico ausente → -1
    if (!validarIndice(v)) return false;
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
    grado: parcial.grado ?? -1,
    grupo: parcial.grupo ?? -1,
    carrera: parcial.carrera ?? -1,
  };
}
