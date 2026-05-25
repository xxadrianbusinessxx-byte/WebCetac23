import "server-only";

import { MAX_BYTES_ENTRADA } from "./comprimir-servidor";

export type ImagenFormResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; error: string };

/** Lee y valida el campo de imagen en FormData (Server Actions). */
export async function bufferImagenDesdeFormData(
  formData: FormData,
  campo = "archivo",
): Promise<ImagenFormResult> {
  const archivo = formData.get(campo);
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ok: false, error: "Solo se permiten imágenes." };
  }
  if (archivo.size > MAX_BYTES_ENTRADA) {
    return {
      ok: false,
      error: "La imagen es demasiado grande. Usa una foto menor a 12 MB.",
    };
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  return { ok: true, buffer };
}
