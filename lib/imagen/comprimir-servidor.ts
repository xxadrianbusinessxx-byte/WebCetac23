import "server-only";

import sharp from "sharp";

/** Tamaño máximo antes de comprimir (evita cargar RAW enormes en memoria). */
export const MAX_BYTES_ENTRADA = 12 * 1024 * 1024;

/** Objetivo tras compresión (~450 KB, similar al cliente anterior). */
const MAX_BYTES_SALIDA = 480_000;
const MAX_LADO = 1200;
const CALIDAD_INICIAL = 82;
const CALIDAD_MINIMA = 52;

/**
 * Normaliza y comprime en el servidor (chat, perfil, noticias → Cloudinary).
 * Convierte a JPEG, corrige orientación EXIF y reduce dimensiones.
 */
export async function comprimirBufferImagen(buffer: Buffer): Promise<Buffer> {
  if (!buffer.length) return buffer;

  try {
    const base = sharp(buffer, { failOn: "none" }).rotate();
    const meta = await base.metadata();
    const ancho = meta.width ?? 0;
    const alto = meta.height ?? 0;

    let pipeline = sharp(buffer, { failOn: "none" }).rotate();
    if (ancho > MAX_LADO || alto > MAX_LADO) {
      pipeline = pipeline.resize(MAX_LADO, MAX_LADO, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    let calidad = CALIDAD_INICIAL;
    let salida = await pipeline
      .jpeg({ quality: calidad, mozjpeg: true })
      .toBuffer();

    while (salida.length > MAX_BYTES_SALIDA && calidad > CALIDAD_MINIMA) {
      calidad -= 10;
      salida = await sharp(buffer, { failOn: "none" })
        .rotate()
        .resize(MAX_LADO, MAX_LADO, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: calidad, mozjpeg: true })
        .toBuffer();
    }

    return salida;
  } catch {
    return buffer;
  }
}
