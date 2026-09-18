/**
 * documentos-permisos-puro.ts — MÓDULO PURO. Las decisiones de permiso y de
 * navegación de Documentos, sin una línea de I/O.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Estas funciones vivían dentro de `documentos.ts`, un archivo de 421 líneas
 * con 14 funciones que hablan con Supabase, y por eso **no tenían suite**: no
 * se puede probar un módulo que necesita una base de datos para cargarse.
 *
 * Y tres de ellas —`puedeVer`, `puedeSubir`, `puedeEliminar`— deciden qué
 * controles ve el usuario en Documentos. Un `||` invertido ahí enseña un botón
 * que el servidor va a rechazar, que es exactamente lo que la regla 4 del
 * PROMPT-3 prohíbe, y hasta hoy nada lo habría detectado.
 *
 * `documentos.ts` re-exporta todo lo de aquí, así que ningún import existente
 * cambia de ruta (mismo criterio que el PROMPT E).
 *
 * NO decide el alcance: «qué carpetas puede ver ESTE profesor» sigue siendo una
 * consulta, y vive en `documentos.ts`. Aquí solo se responde, dado un nivel ya
 * resuelto, qué habilita ese nivel.
 */
import { type NivelPermiso } from "./tables";

/** Fila de carpeta. Lo mínimo que necesita `rutaCarpeta`; la fila completa la
 *  define `documentos.ts`, que es quien la lee de la base. */
export type CarpetaRow = {
  id: string;
  nombre: string;
  parent_id: string | null;
  creado_por: string | null;
  created_at: string | null;
};

/** Nivel efectivo de acceso de un profesor a una carpeta (o null si no tiene). */
export type NivelAcceso = NivelPermiso | null;

/** Orden de niveles: eliminar > subir > ver. */
const ORDEN_NIVEL: Record<NivelPermiso, number> = {
  ver: 1,
  subir: 2,
  eliminar: 3,
};

export function nivelMayor(a: NivelPermiso, b: NivelPermiso): NivelPermiso {
  return ORDEN_NIVEL[a] >= ORDEN_NIVEL[b] ? a : b;
}

/** ¿El nivel permite subir archivos? (subir o eliminar). */
export function puedeSubir(nivel: NivelPermiso | null): boolean {
  return nivel === "subir" || nivel === "eliminar";
}

/** ¿El nivel permite eliminar? (solo eliminar). */
export function puedeEliminar(nivel: NivelPermiso | null): boolean {
  return nivel === "eliminar";
}

/** ¿El nivel permite al menos ver? */
export function puedeVer(nivel: NivelPermiso | null): boolean {
  return nivel !== null;
}

/**
 * Migas de pan: de la carpeta dada hacia la raíz, en orden raíz → hoja.
 *
 * Si un padre no está en la lista, la ruta se CORTA ahí y devuelve lo que pudo
 * reconstruir. Es el comportamiento actual y la suite lo fija: una lista
 * parcial es preferible a un bucle infinito o a una excepción en pantalla.
 */
export function rutaCarpeta(
  carpetas: CarpetaRow[],
  carpetaId: string | null,
): CarpetaRow[] {
  const mapa = new Map(carpetas.map((c) => [c.id, c]));
  const ruta: CarpetaRow[] = [];
  let actual = carpetaId;
  while (actual) {
    const c = mapa.get(actual);
    if (!c) break;
    ruta.unshift(c);
    actual = c.parent_id;
  }
  return ruta;
}
