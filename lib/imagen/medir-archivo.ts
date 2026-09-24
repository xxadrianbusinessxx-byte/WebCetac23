/**
 * medir-archivo.ts — medidas de un archivo ANTES de subirlo, en el navegador.
 * PROMPT N (portada administrable), 2026-09-23.
 *
 * Solo sirve para AVISAR a tiempo: si una imagen no es 7:3, quien la sube lo sabe
 * antes de esperar la subida. La comprobación que manda la hace el servidor
 * después, contra el archivo real de Cloudinary (`registrarMedio`). Por eso un
 * fallo al medir aquí no bloquea: devuelve `null` y el servidor decide.
 *
 * Solo navegador: usa `Image`, `document` y `URL.createObjectURL`.
 */

export type MedidaArchivo = { ancho: number; alto: number; duracion_s: number; formato: string };

/** Extensión canónica desde el tipo MIME o el nombre: la misma que informa Cloudinary. */
export function formatoDeArchivo(archivo: File): string {
  const porMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  if (porMime[archivo.type]) return porMime[archivo.type];
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpeg" ? "jpg" : ext;
}

export function medirImagen(archivo: File): Promise<MedidaArchivo | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      resolver({ ancho: img.naturalWidth, alto: img.naturalHeight, duracion_s: 0, formato: formatoDeArchivo(archivo) });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolver(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function medirVideo(archivo: File): Promise<MedidaArchivo | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(archivo);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      resolver({ ancho: v.videoWidth, alto: v.videoHeight, duracion_s: v.duration, formato: formatoDeArchivo(archivo) });
      URL.revokeObjectURL(url);
    };
    // Algunos formatos (el HEVC de iPhone en ciertos navegadores) no se pueden
    // leer aquí aunque Cloudinary sí los acepte: no se bloquea, decide el servidor.
    v.onerror = () => {
      resolver(null);
      URL.revokeObjectURL(url);
    };
    v.src = url;
  });
}
