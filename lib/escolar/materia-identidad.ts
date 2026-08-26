/**
 * IDENTIDAD LÓGICA DE UNA MATERIA — BLOQUE 7A
 *
 * En este sistema el identificador técnico REAL de una materia es el nombre
 * exacto de su tabla en Supabase (ej. «2DO A MECATRONICA CONCIENCIA
 * HISTORICA»). Ese nombre NUNCA cambia y es el único que se usa para acceder
 * a Supabase (lectura, subida de calificaciones, RPC escolar_sync_columns,
 * resolución de boletas, permisos).
 *
 * Esta capa SOLO separa, de forma pura y sin dependencias de servidor:
 *   - idInterno  → nombre exacto de la tabla (nunca cambia).
 *   - grado      → grado real (1RO, 2DO, …).
 *   - grupo      → grupo real (A, B, C, …).
 *   - carrera    → carrera real si la tabla la incluye (o null).
 *   - asignatura → identidad lógica / asignatura (se agrupa y se busca).
 *
 * Ejemplos reales del proyecto:
 *   «1RO A INGLES»                     → grado=1RO, grupo=A, carrera=null,
 *                                        asignatura=INGLES
 *   «2DO A MECATRONICA CONCIENCIA HISTORICA» → grado=2DO, grupo=A,
 *                                        carrera=MECATRONICA,
 *                                        asignatura=CONCIENCIA HISTORICA
 *   «2DO B RH MATEMATICAS»             → grado=2DO, grupo=B, carrera=RH,
 *                                        asignatura=MATEMATICAS
 */
import { normalizarNombre } from "./nombres";

export type MateriaIdentidad = {
  idInterno: string;
  grado: string;
  grupo: string;
  carrera: string | null;
  asignatura: string;
};

/**
 * Carreras observadas en los nombres REALES de tablas del proyecto
 * (revisadas en `lib/escolar/materias-list.ts` y `Name_of_archives_excels_CSVs`).
 * Se usan como base para extraer la asignatura; se complementan de forma
 * dinámica con `carrerasDesdeTablas` cuando se dispone de la lista real.
 */
export const CARRERAS_ESCOLAR: readonly string[] = ["MECATRONICA", "RH"];

const CARRERAS_DEFAULT: ReadonlySet<string> = new Set(
  CARRERAS_ESCOLAR.map((c) => c.toUpperCase()),
);

function partesTabla(nombreTabla: string): string[] {
  return nombreTabla.trim().split(/\s+/).filter(Boolean);
}

function sufijoSinGradoGrupo(nombreTabla: string): string {
  const partes = partesTabla(nombreTabla);
  return partes.slice(2).join(" ").toUpperCase();
}

/**
 * Detecta de forma dinámica los tokens que actúan como CARRERA en los
 * nombres reales de tabla. Un token es carrera si, tras quitarlo, el resto
 * (la asignatura) también existe en una tabla SIN carrera (p. ej. las de 1RO).
 * Así no se hardcodea una lista de materias: solo se observan los datos.
 */
export function carrerasDesdeTablas(
  nombresTablas: readonly string[],
  base: readonly string[] = CARRERAS_ESCOLAR,
): Set<string> {
  const carreras = new Set(base.map((c) => c.toUpperCase()));
  if (!nombresTablas?.length) return carreras;

  const sufijos = new Set<string>();
  for (const t of nombresTablas) {
    const s = sufijoSinGradoGrupo(t);
    if (s) sufijos.add(s);
  }

  for (const t of nombresTablas) {
    const partes = partesTabla(t);
    if (partes.length < 4) continue;
    const candidato = partes[2]!.toUpperCase();
    if (carreras.has(candidato)) continue;
    const resto = partes.slice(3).join(" ").toUpperCase();
    if (resto && sufijos.has(resto)) carreras.add(candidato);
  }

  return carreras;
}

/**
 * Función pura: extrae la identidad lógica de una materia a partir del
 * nombre real de su tabla. Devuelve null si el nombre no tiene forma
 * reconocible (menos de grado+grupo).
 *
 * @param nombreTabla Nombre exacto de la tabla Supabase (idInterno real).
 * @param carreras    Set opcional de carreras conocidas (normalizadas).
 */
export function materiaIdDesdeNombreTabla(
  nombreTabla: string,
  carreras?: ReadonlySet<string>,
): MateriaIdentidad | null {
  const base = nombreTabla.trim();
  if (!base) return null;

  const partes = partesTabla(base);
  if (partes.length < 2) return null;

  const set =
    carreras && carreras.size > 0 ? carreras : CARRERAS_DEFAULT;

  const grado = partes[0]!.toUpperCase();
  const grupo = partes[1]!.toUpperCase();

  let carrera: string | null = null;
  let asignatura: string;

  if (partes.length >= 3 && set.has(partes[2]!.toUpperCase())) {
    carrera = partes[2]!.toUpperCase();
    asignatura = partes.slice(3).join(" ");
  } else {
    asignatura = partes.slice(2).join(" ");
  }

  if (!asignatura) return null;

  return {
    idInterno: base,
    grado,
    grupo,
    carrera,
    asignatura,
  };
}

/** Normaliza un texto para búsquedas de identidad (sin acentos, mayúsculas). */
export function normalizarIdentidad(texto: string): string {
  return normalizarNombre(texto);
}
