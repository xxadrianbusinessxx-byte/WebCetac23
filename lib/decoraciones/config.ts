/**
 * Imágenes de fondo: coloca archivos en public/decoraciones-imagenes/
 * (o en la carpeta local "decoraciones imagenes" y ejecuta npm run sync:decoraciones)
 */
export const CARPETA_DECORACIONES_PUBLIC = "/decoraciones-imagenes";

/** Añade aquí los nombres de archivo que copies a public/decoraciones-imagenes */
export const DECORACIONES_ARCHIVOS: readonly string[] = [
  // ej. "nubes.png", "pasto.png"
];

export function rutasDecoraciones(): string[] {
  return DECORACIONES_ARCHIVOS.map(
    (nombre) => `${CARPETA_DECORACIONES_PUBLIC}/${nombre}`,
  );
}
