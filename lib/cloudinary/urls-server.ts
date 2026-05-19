import "server-only";

import { cloudinaryConfigurado, getCloudinary } from "./config";
import { publicIdPerfil, urlFotoPerfil } from "./urls";

/** Devuelve URL si el recurso existe en Cloudinary (solo servidor). */
export async function obtenerUrlFotoPerfilSiExiste(
  curp: string,
): Promise<string | null> {
  if (!cloudinaryConfigurado() || !curp.trim()) return null;
  try {
    const cld = getCloudinary();
    const res = await cld.api.resource(publicIdPerfil(curp), {
      resource_type: "image",
    });
    return res.secure_url ?? urlFotoPerfil(curp);
  } catch {
    return null;
  }
}
