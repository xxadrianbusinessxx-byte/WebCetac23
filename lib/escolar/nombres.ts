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
