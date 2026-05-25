import type { PortalRole } from "@/lib/auth/types";
import type { ExtensionCalificaciones } from "./constants";

export type CalificacionesUploaderRole = Extract<PortalRole, "maestro" | "directivo">;

export type MateriaRef = {
  id: string;
  nombre: string;
};

export type CalificacionesArchivoMeta = {
  materiaId: string;
  storagePath: string;
  fileName: string;
  extension: ExtensionCalificaciones;
  mimeType: string;
  uploadedBy: string;
  uploaderRole: CalificacionesUploaderRole;
  updatedAt: string;
};

export type SubirCalificacionesInput = {
  materiaId: string;
  file: File | Blob;
  fileName: string;
  uploadedBy: string;
  uploaderRole: CalificacionesUploaderRole;
};

export type SubirCalificacionesResult =
  | { ok: true; meta: CalificacionesArchivoMeta }
  | { ok: false; error: string };

export type ObtenerCalificacionesResult =
  | { ok: true; signedUrl: string; meta: CalificacionesArchivoMeta | null }
  | { ok: false; error: string };
