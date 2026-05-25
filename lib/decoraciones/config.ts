/**
 * Imágenes de fondo: coloca archivos en public/decoraciones-imagenes/
 * (o en la carpeta local "decoraciones imagenes" y ejecuta npm run sync:decoraciones)
 */
export const CARPETA_DECORACIONES_PUBLIC = "/decoraciones-imagenes";

/** Logo CETAC en las cuatro esquinas (sync:decoraciones lo copia a public). */
export const LOGO_ESQUINAS_ARCHIVO =
  "Gemini_Generated_Image_jburdjburdjburdj-removebg-preview.png";

export const LOGO_ESQUINAS_SRC = `${CARPETA_DECORACIONES_PUBLIC}/${LOGO_ESQUINAS_ARCHIVO}`;

/** Añade aquí los nombres de archivo que copies a public/decoraciones-imagenes */
export const DECORACIONES_ARCHIVOS: readonly string[] = [];

export function rutasDecoraciones(): string[] {
  return DECORACIONES_ARCHIVOS.map(
    (nombre) => `${CARPETA_DECORACIONES_PUBLIC}/${nombre}`,
  );
}
