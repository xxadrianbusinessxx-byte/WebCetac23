/**
 * MÓDULO ETIQUETAS DINÁMICAS — alumno_etiquetas (FASE 2 · PASO 2 + PASO 3)
 *
 * Capa PURA (tipos, constantes, normalización y validación SIN acceso a
 * Supabase): es segura de importar desde Client Components (mismo patrón que
 * lib/escolar/tutores-types.ts).
 *
 * ESTADO: capa pura del módulo. El servicio/repositorio (lectura/escritura en
 * Supabase) vive en lib/escolar/etiquetas-dinamicas-servicio.ts (FASE 2 ·
 * PASO 3). La importación desde Excel pertenece al módulo de importación y NO
 * debe conocer la tabla.
 *
 * Fuente de verdad del módulo: tabla `alumno_etiquetas` (ver
 * supabase/crear-tabla-alumno-etiquetas.sql). La identidad académica
 * (grado/grupo/carrera/materias) NO vive aquí: pertenece al catálogo académico
 * (ver filosofia.estructural §4–§6).
 */
import { normalizarCurp } from "./buscar-en-filas";
import { TABLA_ALUMNO_ETIQUETAS } from "./tables";
import { normalizarNombre } from "./nombres";

export { TABLA_ALUMNO_ETIQUETAS };

/** Máximo de etiquetas por alumno (regla de negocio; ver SQL del módulo). */
export const MAX_ETIQUETAS_POR_ALUMNO = 20;

/** Límites de longitud (validados por el servicio en el PASO 3). */
export const ETIQUETA_TITULO_MAX_LENGTH = 200;
export const ETIQUETA_VALOR_MAX_LENGTH = 2000;

/** Fila física de `alumno_etiquetas`. */
export type AlumnoEtiquetaRow = {
  id: string;
  curp: string;
  titulo: string;
  valor: string;
  orden: number;
  created_at: string;
  updated_at: string;
};

/** Par (título, valor) de presentación, con su orden. */
export type EtiquetaAlumno = {
  titulo: string;
  valor: string;
  orden: number;
};

/**
 * Normaliza un título para comparar DUPLICADOS a nivel de servicio: trim,
 * mayúsculas y sin acentos.
 *
 * Diferencia documentada con la BD:
 *   · BD (garantía fuerte): índice UNIQUE (curp, lower(titulo)) — detecta
 *     duplicados exactos ignorando mayúsculas/minúsculas y espacios laterales
 *     (el servicio hace trim antes de guardar).
 *   · Servicio (primera línea): esta función añade la comparación SIN ACENTOS
 *     («METÁ» = «META»), que la BD no cubre por sí sola.
 */
export function normalizarTituloEtiqueta(titulo: string): string {
  return normalizarNombre(titulo);
}

/** ¿Dos títulos representan la misma etiqueta? (normalización de servicio). */
export function titulosEtiquetaCoinciden(a: string, b: string): boolean {
  return normalizarTituloEtiqueta(a) === normalizarTituloEtiqueta(b);
}

/**
 * ¿Agregar `nuevas` etiquetas a un alumno que ya tiene `actuales` superaría el
 * límite de 20? (validación de servicio; el SQL del módulo añade la red de
 * seguridad a nivel de base de datos).
 */
export function excedeLimiteEtiquetas(
  actuales: number,
  nuevas: number,
): boolean {
  return actuales + nuevas > MAX_ETIQUETAS_POR_ALUMNO;
}

/** Ordena etiquetas por `orden` para presentación. */
export function ordenarEtiquetas(
  etiquetas: readonly EtiquetaAlumno[],
): EtiquetaAlumno[] {
  return [...etiquetas].sort((a, b) => a.orden - b.orden);
}

/* ---------------------------------------------------------------------------
 * NORMALIZACIÓN DE VALORES
 * ------------------------------------------------------------------------- */

/** Título PRESENTADO al usuario: solo trim. NO cambia mayúsculas ni acentos. */
export function normalizarTituloPresentado(titulo: unknown): string {
  return typeof titulo === "string" ? titulo.trim() : "";
}

/** Valor normalizado a string; permite vacío (regla «las etiquetas pueden quedar vacías»). */
export function normalizarValorEtiqueta(valor: unknown): string {
  if (valor == null) return "";
  return String(valor).trim();
}

/** Núcleo normalizado de una etiqueta (título presentado + valor). */
export type EtiquetaDinamicaNucleo = {
  titulo: string;
  valor: string;
};

/* ---------------------------------------------------------------------------
 * VALIDACIÓN (reglas de negocio del módulo; reutilizadas por el servicio)
 * ------------------------------------------------------------------------- */

/**
 * Valida el CURP de la etiqueta. Reutiliza `normalizarCurp` (buscar-en-filas):
 * NO crea una implementación paralela.
 */
export function validarCurpEtiqueta(
  curp: unknown,
): { ok: true; curp: string } | { ok: false; error: string } {
  if (typeof curp !== "string") {
    return { ok: false, error: "El CURP del alumno es obligatorio." };
  }
  const c = normalizarCurp(curp);
  if (!c) return { ok: false, error: "El CURP del alumno es obligatorio." };
  return { ok: true, curp: c };
}

/**
 * Valida el núcleo (título + valor) de una etiqueta.
 *  · Título: trim, no vacío, longitud razonable.
 *  · Valor: se convierte a string, trim, puede quedar vacío.
 * Devuelve el núcleo NORMALIZADO (el título conserva la presentación del
 * usuario; la normalización de unicidad es solo para comparar).
 */
export function validarEtiquetaNucleo(item: {
  titulo?: unknown;
  valor?: unknown;
}): { ok: true; nucleo: EtiquetaDinamicaNucleo } | { ok: false; errores: string[] } {
  const errores: string[] = [];

  const titulo = normalizarTituloPresentado(item.titulo);
  if (!titulo) {
    errores.push("El título de la etiqueta no puede estar vacío.");
  } else if (titulo.length > ETIQUETA_TITULO_MAX_LENGTH) {
    errores.push(
      `El título no puede superar ${ETIQUETA_TITULO_MAX_LENGTH} caracteres.`,
    );
  }

  const valor = normalizarValorEtiqueta(item.valor);
  if (valor.length > ETIQUETA_VALOR_MAX_LENGTH) {
    errores.push(
      `El valor no puede superar ${ETIQUETA_VALOR_MAX_LENGTH} caracteres.`,
    );
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, nucleo: { titulo, valor } };
}

/** Valida el orden: entero mayor o igual a 0. */
export function validarOrdenEtiqueta(
  orden: unknown,
): { ok: true; orden: number } | { ok: false; error: string } {
  if (typeof orden !== "number" || !Number.isInteger(orden) || orden < 0) {
    return {
      ok: false,
      error: "El orden debe ser un número entero mayor o igual a 0.",
    };
  }
  return { ok: true, orden };
}

/**
 * Valida un CONJUNTO completo de etiquetas (0..20):
 *  · máximo 20 (regla de negocio);
 *  · cada título/valor válido;
 *  · sin duplicados según la normalización de servicio (sin acentos).
 * Devuelve el conjunto normalizado en el MISMO orden de entrada.
 * El `orden` final (0..n-1) lo asigna el servicio según la posición del array.
 */
export function validarConjuntoEtiquetas(
  items: readonly { titulo?: unknown; valor?: unknown }[],
): { ok: true; etiquetas: EtiquetaDinamicaNucleo[] } | { ok: false; errores: string[] } {
  if (items.length > MAX_ETIQUETAS_POR_ALUMNO) {
    return {
      ok: false,
      errores: [`Máximo ${MAX_ETIQUETAS_POR_ALUMNO} etiquetas por alumno.`],
    };
  }

  const errores: string[] = [];
  const etiquetas: EtiquetaDinamicaNucleo[] = [];
  const vistos = new Set<string>();

  for (const item of items) {
    const r = validarEtiquetaNucleo(item);
    if (!r.ok) {
      errores.push(...r.errores);
      continue;
    }
    const norm = normalizarTituloEtiqueta(r.nucleo.titulo);
    if (vistos.has(norm)) {
      errores.push(`Título duplicado: «${r.nucleo.titulo}».`);
      continue;
    }
    vistos.add(norm);
    etiquetas.push(r.nucleo);
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, etiquetas };
}

/* ---------------------------------------------------------------------------
 * SERVICIO / REPOSITORIO
 * ---------------------------------------------------------------------------
 * La lectura/escritura en `alumno_etiquetas` vive en
 * lib/escolar/etiquetas-dinamicas-servicio.ts (FASE 2 · PASO 3):
 *
 *   obtenerEtiquetasDinamicas(supabase, curp)
 *   obtenerEtiquetasDinamicasPorCurps(supabase, curps)   → Map por CURP (sin N+1)
 *   guardarEtiquetaDinamica(supabase, curp, etiqueta)
 *   guardarEtiquetasDinamicas(supabase, curp, etiquetas) → conjunto completo
 *   eliminarEtiquetaDinamica(supabase, id, curp)
 *   actualizarOrdenEtiquetasDinamicas(supabase, curp, idsOrdenados)
 *
 * Los consumidores (Server Actions → perfil) usan esas funciones; NUNCA deben
 * hacer supabase.from("alumno_etiquetas") directamente (módulo reemplazable).
 * El servicio NO decide autorización: sesión/rol/relación se validan en la
 * capa de Server Actions (filosofia.estructural §7).
 * ---------------------------------------------------------------------------
 */
