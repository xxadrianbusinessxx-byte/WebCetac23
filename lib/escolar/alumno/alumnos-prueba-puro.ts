/**
 * alumnos-prueba-puro.ts — la decisión de quitar al alumno de prueba de una
 * lista. 2026-11-12, PROMPT AC (perfiles de visualización).
 *
 * El alumno de prueba existe para ver el portal como alumno y como tutor:
 * está inscrito en un grupo REAL, pero no es una persona. Quién lo es lo dice
 * SOLO `ALUMNOS.es_prueba` (la lectura vive en `alumnos-prueba.ts`); aquí se
 * decide qué hacer con esa respuesta, sin base de datos.
 *
 * Conjunto vacío = nadie es de prueba = la lista sale igual que antes. Es el
 * caso de hoy y el de cuando la columna no existe.
 */

/** La CURP tal como se compara en todo el sistema: sin espacios y en mayúsculas. */
function normCurp(curp: string): string {
  return String(curp ?? "").trim().toUpperCase();
}

/**
 * `filas` sin las que pertenecen a un alumno de prueba, en el mismo orden.
 * No muta la entrada: devuelve siempre un arreglo nuevo.
 */
export function quitarAlumnosDePrueba<T>(
  filas: readonly T[],
  curpDe: (fila: T) => string,
  curpsPrueba: ReadonlySet<string>,
): T[] {
  if (curpsPrueba.size === 0) return [...filas];
  return filas.filter((f) => !curpsPrueba.has(normCurp(curpDe(f))));
}

/**
 * Las CURP de `curps` que NO son de prueba, como un `Set` nuevo. Para los
 * lectores que ya trabajan con `Set<string>` (padrón de un grupo, de una materia).
 */
export function quitarCurpsDePrueba(
  curps: Iterable<string>,
  curpsPrueba: ReadonlySet<string>,
): Set<string> {
  const salida = new Set<string>();
  for (const c of curps) {
    if (!curpsPrueba.has(normCurp(c))) salida.add(c);
  }
  return salida;
}

/** Normaliza las CURP que devuelve la lectura, para que `has` compare igual. */
export function conjuntoDeCurpsPrueba(filas: ReadonlyArray<{ CURP?: string | null }>): Set<string> {
  const salida = new Set<string>();
  for (const f of filas) {
    const c = normCurp(f.CURP ?? "");
    if (c) salida.add(c);
  }
  return salida;
}
