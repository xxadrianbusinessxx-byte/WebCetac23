import "server-only";

import { CLOUDINARY_FOLDER, getCloudinary } from "./config";

export async function subirImagenCloudinary(
  buffer: Buffer,
  publicId: string,
): Promise<
  { ok: true; url: string; clave: string } | { ok: false; error: string }
> {
  try {
    const sanitized = publicId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const clave = `${CLOUDINARY_FOLDER}/${sanitized}`;
    const cld = getCloudinary();
    const result = await new Promise<{ secure_url?: string; error?: { message: string } }>(
      (resolve, reject) => {
        const stream = cld.uploader.upload_stream(
          {
            folder: CLOUDINARY_FOLDER,
            public_id: sanitized,
            overwrite: true,
            resource_type: "image",
          },
          (err, res) => {
            if (err) reject(err);
            else resolve(res ?? {});
          },
        );
        stream.end(buffer);
      },
    );

    if (!result.secure_url) {
      return {
        ok: false,
        error: result.error?.message ?? "No se pudo subir la imagen.",
      };
    }
    return { ok: true, url: result.secure_url, clave };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al subir imagen.";
    return { ok: false, error: msg };
  }
}
