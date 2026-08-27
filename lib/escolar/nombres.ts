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

/** Alias semántico: ¿el texto corresponde al mismo alumno? (comparación normalizada). */
export function nombresMismoAlumno(a: string, b: string): boolean {
  return nombresCoinciden(a, b);
}
