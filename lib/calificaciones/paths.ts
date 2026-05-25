import {
  EXTENSIONES_PERMITIDAS,
  type ExtensionCalificaciones,
} from "./constants";

export function extensionDesdeNombre(
  fileName: string,
): ExtensionCalificaciones | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  return EXTENSIONES_PERMITIDAS.includes(ext as ExtensionCalificaciones)
    ? (ext as ExtensionCalificaciones)
    : null;
}

/** Ruta única por materia: un solo archivo activo (se reemplaza con upsert). */
export function rutaCalificacionesMateria(
  materiaId: string,
  extension: ExtensionCalificaciones,
): string {
  return `materias/${materiaId}/calificaciones.${extension}`;
}
