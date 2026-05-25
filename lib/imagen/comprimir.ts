import imageCompression from "browser-image-compression";

/**
 * Compresión ligera en el navegador antes del FormData.
 * Sin import() dinámico ni Web Worker (SmartScreen / Defender los suelen bloquear).
 * La compresión principal ocurre en el servidor con sharp → Cloudinary.
 */
export async function comprimirImagenSiPosible(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.45,
      maxWidthOrHeight: 1200,
      useWebWorker: false,
      initialQuality: 0.82,
      alwaysKeepResolution: false,
      fileType: "image/jpeg",
    });
    return compressed;
  } catch {
    return file;
  }
}

/** Para FormData en Server Actions: comprime en cliente y adjunta al form. */
export async function prepararFormDataImagen(
  archivo: File,
  campo = "archivo",
): Promise<FormData> {
  const comprimida = await comprimirImagenSiPosible(archivo);
  const fd = new FormData();
  fd.set(campo, comprimida, comprimida.name || "imagen.jpg");
  return fd;
}
