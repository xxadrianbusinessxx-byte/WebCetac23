import { CARPETA_DECORACIONES_PUBLIC } from "./config";
import { DECORACIONES_GENERADAS } from "./imagenes-generadas";

export const ARCHIVO_FONDO = "BACKGROUND.jpg";

export type CapaDecoracion = {
  src: string;
  nombre: string;
};

export type DecoracionCapas = {
  fondo: CapaDecoracion | null;
  stickers: CapaDecoracion[];
};

function esFondo(nombre: string): boolean {
  return nombre.toLowerCase() === ARCHIVO_FONDO.toLowerCase();
}

export function separarCapasDecoracion(): DecoracionCapas {
  let fondo: CapaDecoracion | null = null;
  const stickers: CapaDecoracion[] = [];

  for (const nombre of DECORACIONES_GENERADAS) {
    const capa: CapaDecoracion = {
      nombre,
      src: `${CARPETA_DECORACIONES_PUBLIC}/${nombre}`,
    };
    if (esFondo(nombre)) {
      fondo = capa;
    } else {
      stickers.push(capa);
    }
  }

  return { fondo, stickers };
}

/** Posiciones fijas para repartir stickers (por índice). */
export const STICKER_LAYOUT: readonly {
  left: string;
  top: string;
  width: string;
  anim: string;
  delay: string;
}[] = [
  { left: "2%", top: "58%", width: "min(28vw, 220px)", anim: "decor-drift-a", delay: "0s" },
  { left: "right", top: "8%", width: "min(32vw, 260px)", anim: "decor-drift-b", delay: "1.2s" },
  { left: "68%", top: "42%", width: "min(26vw, 200px)", anim: "decor-drift-c", delay: "2.4s" },
  { left: "38%", top: "72%", width: "min(24vw, 190px)", anim: "decor-drift-b", delay: "0.8s" },
  { left: "78%", top: "12%", width: "min(22vw, 180px)", anim: "decor-drift-a", delay: "1.8s" },
];
