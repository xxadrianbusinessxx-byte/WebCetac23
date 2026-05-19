/** Comprime imágenes en el cliente antes de subir (menos peso en Cloudinary). */
export async function comprimirImagenSiPosible(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 80_000) {
    return file;
  }
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
    });
    return compressed;
  } catch {
    return file;
  }
}
