/** Tablas de registro final: no recortar columnas ni reestructurar. */
export function esRegistroCalificacionesFinales(nombreTabla: string): boolean {
  return /REGISTRO DE CALIFICACIONES FINALES/i.test(nombreTabla.trim());
}

function celdaVacia(s: string | undefined): boolean {
  return !(s ?? "").trim();
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

/** Quita filas de datos que están completamente vacías (conserva la primera fila = encabezados). */
export function eliminarFilasDatosVacias(matriz: string[][]): string[][] {
  if (matriz.length <= 1) return matriz;
  const [head, ...rest] = matriz;
  const kept = rest.filter((row) => row.some((c) => !celdaVacia(c)));
  return [head, ...kept];
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

export function prepararMatrizMateriaParaGuardar(matriz: string[][]): {
  encabezados: string[];
  filas: string[][];
} {
  const norm = normalizarAnchoFilas(matriz);
  const sinFilasVacias = eliminarFilasDatosVacias(norm);
  const limpia = eliminarColumnasTotalmenteVacias(sinFilasVacias);
  if (!limpia.length) return { encabezados: [], filas: [] };
  const [encabezados, ...filas] = limpia;
  return {
    encabezados: encabezados ?? [],
    filas,
  };
}
