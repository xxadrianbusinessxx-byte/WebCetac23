import "server-only";
import * as XLSX from "xlsx";

/**
 * Convierte una matriz de filas en un libro .xlsx y devuelve su contenido
 * binario en base64 (para descargarlo desde el cliente).
 *
 * ESTÁNDAR DE ENTREGABLES: todos los archivos generados por la plataforma
 * (plantillas de asistencias/materia, credenciales, reportes) se exportan como
 * .xlsx, NUNCA como .csv, porque el CSV corrompe o exporta mal datos como
 * nombres con acentos/ñ, CURP, fechas y celdas numéricas.
 *
 * @param filas Matriz de celdas (strings o números).
 * @param nombreHoja Nombre de la primera (única) hoja del libro.
 * @param anchosColumnas Anchos opcionales (wch) por columna.
 * @returns Contenido binario del .xlsx en base64.
 */
export function matrizAXlsxBase64(
  filas: (string | number)[][],
  nombreHoja: string,
  anchosColumnas?: number[],
): string {
  const hoja = XLSX.utils.aoa_to_sheet(
    filas.map((fila) => fila.map((celda) => (celda == null ? "" : celda))),
  );
  if (anchosColumnas && anchosColumnas.length > 0) {
    hoja["!cols"] = anchosColumnas.map((wch) => ({ wch }));
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(buffer).toString("base64");
}
