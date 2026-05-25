/** Comprime imágenes en el cliente antes de subir (Cloudinary / chat / perfil / noticias). */
export async function comprimirImagenSiPosible(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    const { default: imageCompression } = await import(
      "browser-image-compression"
    );
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.45,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      fileType: file.type === "image/png" ? "image/jpeg" : undefined,
      initialQuality: 0.82,
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
  fd.set(campo, comprimida);
  return fd;
}
