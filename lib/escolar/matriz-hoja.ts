/** Tablas de registro final: encabezados de columnas en la 5.ª fila del Excel. */
export function esRegistroCalificacionesFinales(nombreTabla: string): boolean {
  return /REGISTRO DE CALIFICACIONES FINALES/i.test(nombreTabla.trim());
}

/** Fila fija de encabezados de columnas en registros finales (1-based fila 5). */
export const INDICE_ENCABEZADOS_REGISTRO = 4;

function celdaVacia(s: string | undefined): boolean {
  return !(s ?? "").trim();
}

export function filaTieneAlgunaCelda(fila: string[]): boolean {
  return fila.some((c) => !celdaVacia(c));
}

/**
 * Elimina columnas donde todas las celdas están vacías (incluye encabezado).
 */
export function eliminarColumnasTotalmenteVacias(matriz: string[][]): string[][] {
  if (!matriz.length) return [];
  const maxCol = Math.max(0, ...matriz.map((r) => r.length));
  if (maxCol === 0) return matriz.map(() => []);

  const indices: number[] = [];
  for (let j = 0; j < maxCol; j++) {
    let todaVacia = true;
    for (const row of matriz) {
      if (!celdaVacia(j < row.length ? row[j] : undefined)) {
        todaVacia = false;
        break;
      }
    }
    if (!todaVacia) indices.push(j);
  }

  return matriz.map((row) =>
    indices.map((j) => (j < row.length ? String(row[j] ?? "").trim() : "")),
  );
}

/** Quita filas donde todas las celdas están vacías. */
export function eliminarFilasCompletamenteVacias(matriz: string[][]): string[][] {
  return matriz.filter((row) => filaTieneAlgunaCelda(row));
}

/** Alinea ancho de filas al máximo encontrado (relleno con ""). */
export function normalizarAnchoFilas(matriz: string[][]): string[][] {
  if (!matriz.length) return [];
  const w = Math.max(...matriz.map((r) => r.length));
  return matriz.map((row) => {
    const out = [...row];
    while (out.length < w) out.push("");
    return out.slice(0, w).map((c) => (c == null ? "" : String(c)));
  });
}

/**
 * Limpia matriz antes de guardar en Supabase:
 * normaliza ancho, elimina filas/columnas totalmente vacías.
 */
export function prepararMatrizParaSupabase(matriz: string[][]): string[][] {
  const norm = normalizarAnchoFilas(matriz);
  const sinFilasVacias = eliminarFilasCompletamenteVacias(norm);
  return eliminarColumnasTotalmenteVacias(sinFilasVacias);
}
