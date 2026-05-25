import * as XLSX from "xlsx";

/** Convierte hoja Excel a texto CSV (UTF-8). */
export function matrizACsvTexto(filas: string[][]): string {
  return filas
    .map((fila) =>
      fila
        .map((celda) => {
          const v = celda ?? "";
          if (/[",;\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(","),
    )
    .join("\n");
}

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

/** Acepta .csv o convierte .xlsx/.xls a filas vía CSV. */
export async function archivoCsvAFilas(
  file: File,
): Promise<{ filas: string[][]; csvTexto: string }> {
  const nombre = file.name.toLowerCase();

  if (nombre.endsWith(".csv")) {
    const texto = await file.text();
    const filas = parseCsvTexto(texto);
    return { filas, csvTexto: texto };
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
    const filas = matriz.map((fila) =>
      fila.map((c) => (c == null ? "" : String(c).trim())),
    );
    const csvTexto = matrizACsvTexto(filas);
    return { filas, csvTexto };
  }

  throw new Error(
    "Formato no permitido. Usa CSV o Excel (.xlsx / .xls); Excel se convierte a CSV al subir.",
  );
}
