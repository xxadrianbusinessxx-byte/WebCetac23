import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";

export type CredencialesCloudinary = {
  cloud_name: string;
  api_key: string;
  api_secret: string;
};

const MARCAS_PLANTILLA = /CLOUDINARY_URL|cloudinary:\/\/|your_api|tu_api|<|>|ejemplo|example/i;

/** Solo variables individuales; nunca el string compuesto CLOUDINARY_URL. */
export function leerCredencialesCloudinary(): CredencialesCloudinary | null {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  const api_key = process.env.CLOUDINARY_API_KEY?.trim() ?? "";
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim() ?? "";

  if (!cloud_name || !api_key || !api_secret) return null;

  for (const valor of [cloud_name, api_key, api_secret]) {
    if (MARCAS_PLANTILLA.test(valor)) return null;
  }

  return { cloud_name, api_key, api_secret };
}

export function cloudinaryConfigurado(): boolean {
  return leerCredencialesCloudinary() !== null;
}

/**
 * Inicializa el SDK solo con CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y
 * CLOUDINARY_API_SECRET. Ignora CLOUDINARY_URL para evitar URLs rotas en Vercel.
 */
export function getCloudinary() {
  const creds = leerCredencialesCloudinary();
  if (!creds) {
    throw new Error(
      "Cloudinary mal configurado: usa CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en Vercel (sin CLOUDINARY_URL ni texto de plantilla).",
    );
  }

  // El paquete `cloudinary` auto-lee process.env.CLOUDINARY_URL al importarse.
  if ("CLOUDINARY_URL" in process.env) {
    delete process.env.CLOUDINARY_URL;
  }

  cloudinary.config({
    cloud_name: creds.cloud_name,
    api_key: creds.api_key,
    api_secret: creds.api_secret,
    secure: true,
  });

  return cloudinary;
}

export { CLOUDINARY_FOLDER };
