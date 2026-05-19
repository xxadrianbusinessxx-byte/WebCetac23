import { archivoCsvAFilas } from "./csv";

const MARCA_ENCABEZADOS = "__HEADERS__";
const MARCA_CSV_COMPLETO = "__CSV__";

export { parseCsvTexto } from "./csv";

/** @deprecated Usa archivoCsvAFilas */
export async function parseArchivoCalificaciones(
  file: File,
): Promise<string[][]> {
  const { filas } = await archivoCsvAFilas(file);
  return filas;
}

export function filasAMetadataSupabase(
  filas: string[][],
  csvTexto?: string,
): { columna1: string; columna2: string }[] {
  if (!filas.length && !csvTexto) return [];

  const [encabezados, ...datos] = filas;
  const meta: { columna1: string; columna2: string }[] = [];

  if (csvTexto) {
    meta.push({
      columna1: MARCA_CSV_COMPLETO,
      columna2: csvTexto,
    });
  }

  meta.push({
    columna1: MARCA_ENCABEZADOS,
    columna2: JSON.stringify(encabezados ?? []),
  });

  for (const fila of datos) {
    if (fila.every((c) => !c)) continue;
    meta.push({
      columna1: fila[0] ?? "",
      columna2: JSON.stringify(fila),
    });
  }
  return meta;
}

export function metadataAVista(
  rows: { columna1: string | null; columna2: string | null }[],
): { encabezados: string[]; filas: string[][] } | null {
  const headerRow = rows.find((r) => r.columna1 === MARCA_ENCABEZADOS);
  if (!headerRow?.columna2) return null;

  let encabezados: string[] = [];
  try {
    encabezados = JSON.parse(headerRow.columna2) as string[];
  } catch {
    return null;
  }

  const filas: string[][] = [];
  for (const r of rows) {
    if (
      r.columna1 === MARCA_ENCABEZADOS ||
      r.columna1 === MARCA_CSV_COMPLETO ||
      !r.columna2
    ) {
      continue;
    }
    try {
      filas.push(JSON.parse(r.columna2) as string[]);
    } catch {
      filas.push([r.columna1 ?? "", r.columna2]);
    }
  }

  return { encabezados, filas };
}
