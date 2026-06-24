export function mensajeArchivoSubido(
  filas: number,
  advertencia?: string,
): string {
  let msg = `Archivo subido correctamente (${filas} filas).`;
  if (advertencia) {
    msg += ` Los datos se guardaron; aviso: ${advertencia}`;
  }
  return msg;
}
