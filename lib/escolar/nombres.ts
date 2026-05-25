/** Comparación de nombres sin acentos ni diferencias de mayúsculas. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function nombresCoinciden(a: string, b: string): boolean {
  return normalizarNombre(a) === normalizarNombre(b);
}

/** Partes del nombre (sin palabras de 1 letra). */
export function tokensNombre(texto: string): string[] {
  return normalizarNombre(texto)
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Mismo alumno aunque el Excel use «APELLIDO APELLIDO NOMBRE»
 * y ALUMNOS tenga «NOMBRE APELLIDO APELLIDO».
 */
export function nombresMismoAlumno(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  if (nombresCoinciden(a, b)) return true;

  const ta = tokensNombre(a);
  const tb = tokensNombre(b);
  if (ta.length < 2 || tb.length < 2) return false;

  const [menor] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const setMayor = new Set(ta.length <= tb.length ? tb : ta);

  const enComun = menor.filter((t) => setMayor.has(t)).length;
  const minimo = Math.min(menor.length, 3);
  if (enComun >= minimo) return true;

  if (ta.length === tb.length && enComun === ta.length) return true;

  const na = normalizarNombre(a);
  const nb = normalizarNombre(b);
  return na.includes(nb) || nb.includes(na);
}

/** Variantes de orden (nombre/apellidos) para buscar en hojas de calificaciones. */
export function variantesNombreCompleto(texto: string): string[] {
  const partes = texto
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 1);
  if (partes.length < 2) return [texto.trim()].filter(Boolean);

  const unicas = new Set<string>([texto.trim()]);
  if (partes.length >= 3) {
    const [a, b, c, ...rest] = partes;
    unicas.add([a, b, c, ...rest].join(" "));
    unicas.add([b, c, a, ...rest].join(" "));
    unicas.add([c, b, a, ...rest].join(" "));
  }
  if (partes.length === 2) {
    unicas.add([partes[1], partes[0]].join(" "));
  }
  return [...unicas];
}
