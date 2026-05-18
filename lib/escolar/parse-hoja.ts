import * as XLSX from "xlsx";

const MARCA_ENCABEZADOS = "__HEADERS__";

export function parseCsvTexto(texto: string): string[][] {
  const lineas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const filas: string[][] = [];
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    filas.push(parseCsvLinea(linea));
  }
  return filas;
}

function parseCsvLinea(linea: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        enComillas = !enComillas;
      }
    } else if ((c === "," || c === ";") && !enComillas) {
      celdas.push(actual.trim());
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual.trim());
  return celdas;
}

export async function parseArchivoCalificaciones(
  file: File,
): Promise<string[][]> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".csv")) {
    const texto = await file.text();
    return parseCsvTexto(texto);
  }
  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const libro = XLSX.read(buffer, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json<string[]>(hoja, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];
    return matriz.map((fila) =>
      fila.map((c) => (c == null ? "" : String(c).trim())),
    );
  }
  throw new Error("Formato no permitido. Usa CSV, XLS o XLSX.");
}

export function filasAMetadataSupabase(filas: string[][]): {
  columna1: string;
  columna2: string;
}[] {
  if (!filas.length) return [];

  const [encabezados, ...datos] = filas;
  const meta: { columna1: string; columna2: string }[] = [
    {
      columna1: MARCA_ENCABEZADOS,
      columna2: JSON.stringify(encabezados ?? []),
    },
  ];

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
    if (r.columna1 === MARCA_ENCABEZADOS || !r.columna2) continue;
    try {
      filas.push(JSON.parse(r.columna2) as string[]);
    } catch {
      filas.push([r.columna1 ?? "", r.columna2]);
    }
  }

  return { encabezados, filas };
}
