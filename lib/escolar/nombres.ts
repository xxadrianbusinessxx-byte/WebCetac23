/** Comparación de nombres sin acentos ni diferencias de mayúsculas. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * C4.24 — ¿El mismo conjunto de tokens normalizados (mismo nombre humano)
 * aunque el orden apellidos/nombre esté invertido?
 * Ej.: "ADRIAN URIEL TREJO ZARATE" == "Trejo Zarate Adrian Uriel".
 */
export function mismosTokensNormalizados(a: string, b: string): boolean {
  const ta = normalizarNombre(a).split(" ").filter(Boolean);
  const tb = normalizarNombre(b).split(" ").filter(Boolean);
  if (ta.length === 0 || ta.length !== tb.length) return false;
  const sa = [...ta].sort().join(" ");
  const sb = [...tb].sort().join(" ");
  return sa === sb;
}

export function nombresCoinciden(a: string, b: string): boolean {
  if (normalizarNombre(a) === normalizarNombre(b)) return true;
  // Las tablas legacy de calificaciones guardan el nombre en orden
  // "APELLIDO P APELLIDO M NOMBRE"; la identidad oficial es
  // "NOMBRE APELLIDO P APELLIDO M". Comparar por tokens evita no encontrar
  // la fila del alumno cuando la tabla no tiene columna CURP.
  return mismosTokensNormalizados(a, b);
}

/**
 * Letras que tienen variante acentuada en un nombre (Á É Í Ó Ú Ü Ñ Ç Ý): en el
 * patrón de `patronFiltroNombre` van como comodín, porque la base guarda «GARCÍA»
 * y quien escribe pone «GARCIA» (o al revés).
 */
const LETRA_CON_VARIANTE = /[AEIOUNCY]/;

/**
 * PROMPT Y (C-1) — Patrón ILIKE para traer de la base un SUPERCONJUNTO de las
 * filas que `nombresCoinciden` o la búsqueda por subcadena aceptarían para
 * `texto`, sin descargar la tabla entera. null = no hay patrón útil: no filtrar.
 *
 * Por qué nunca deja fuera una fila buena: las dos comparaciones del login
 * exigen que el texto normalizado esté DENTRO del nombre completo normalizado
 * (igual, mismos tokens o subcadena). Un tramo alfanumérico del texto no lleva
 * espacios, así que cae entero dentro de una palabra del nombre, y cada palabra
 * vive en UNA columna (NOMBRE, P_APELLIDO o S_APELLIDO). Basta con que una
 * columna contenga ese tramo, con las letras acentuables como `%`: `%` también
 * absorbe un acento guardado descompuesto (N + tilde). Se elige el tramo con más
 * letras fijas; con menos de 2, el patrón no filtraría nada y se devuelve null.
 *
 * Supuesto, medido el 2026-10-24: los nombres de ALUMNOS solo llevan letras
 * A-Z y Á É Í Ó Ú Ñ. Una letra con otra marca (Š, Ł…) que el texto escriba sin
 * ella quedaría fuera; `scripts/test-login-filtro-nombres.mjs` lo documenta.
 */
export function patronFiltroNombre(texto: string): string | null {
  const tramos = normalizarNombre(texto).split(/[^A-Z0-9]+/).filter(Boolean);
  let mejor: string | null = null;
  let fijas = 0;
  for (const t of tramos) {
    const n = [...t].filter((c) => !LETRA_CON_VARIANTE.test(c)).length;
    if (n > fijas) {
      fijas = n;
      mejor = t;
    }
  }
  if (!mejor || fijas < 2) return null;
  const patron = [...mejor]
    .map((c) => (LETRA_CON_VARIANTE.test(c) ? "%" : c))
    .join("")
    .replace(/%+/g, "%");
  return `%${patron}%`.replace(/%+/g, "%");
}

/** Alias semántico: ¿el texto corresponde al mismo alumno? (comparación normalizada). */
export function nombresMismoAlumno(a: string, b: string): boolean {
  return nombresCoinciden(a, b);
}
