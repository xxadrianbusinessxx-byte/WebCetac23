/**
 * Arma FormData sin librerías de compresión en el navegador.
 * La compresión ocurre solo en el servidor (sharp) antes de Cloudinary.
 */

export function prepararFormDataImagen(
  archivo: File,
  campo = "archivo",
): FormData {
  const fd = new FormData();
  const nombre =
    archivo.name && /\.(jpe?g|png|webp|gif)$/i.test(archivo.name)
      ? archivo.name
      : "imagen.jpg";
  fd.set(campo, archivo, nombre);
  return fd;
}
