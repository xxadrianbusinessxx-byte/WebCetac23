import { v2 as cloudinary } from "cloudinary";
import { CLOUDINARY_FOLDER } from "@/lib/escolar/tables";

export function cloudinaryConfigurado(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

export function getCloudinary() {
  if (!cloudinaryConfigurado()) {
    throw new Error(
      "Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET.",
    );
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

export { CLOUDINARY_FOLDER };
