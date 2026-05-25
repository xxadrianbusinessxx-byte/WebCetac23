/** Vista previa local sin blob: ni workers (compatible con Vercel / SmartScreen). */

export function revocarPreviewSiBlob(url: string | null): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function archivoAPreviewDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Solo se permiten imágenes."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data === "string") resolve(data);
      else reject(new Error("No se pudo previsualizar la imagen."));
    };
    reader.onerror = () =>
      reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.readAsDataURL(file);
  });
}
