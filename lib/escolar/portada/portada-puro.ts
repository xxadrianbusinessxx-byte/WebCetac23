/**
 * portada-puro.ts — MÓDULO PURO. Todas las reglas de la portada administrable:
 * qué imagen o video es válido, cuántos caben, cómo se ordenan, qué rótulo lleva
 * cada carrera y qué forma tiene cada ajuste de contacto. Cero I/O.
 *
 * ── Por qué todo aquí ──────────────────────────────────────────────────────
 * Estas reglas las aplican DOS sitios: el navegador, antes de subir, para avisar
 * a tiempo (prompt N), y el servidor, después de subir, contra el archivo real de
 * Cloudinary, que es la comprobación que manda (prompt M, §7 de la filosofía).
 * Dos copias de «qué tamaño es válido» divergen el primer día (R6).
 *
 * ── Cómo se eligieron los números ──────────────────────────────────────────
 * Las proporciones salen de medir el diseño
 * (`things/figma-oceano/Pantalla de bienvenida.png`, 2880 × 4060): el hero mide
 * 2880 × 1231, que es 2,34 : 1, prácticamente 7:3. Los topes de peso son los del
 * plan gratuito de Cloudinary. Si el plan cambia, cambian aquí y en ningún otro
 * sitio.
 *
 * Nada de `Date.now()`, aleatorios ni `process.env`: lo que varía se recibe.
 */

/* ── Tipos básicos ──────────────────────────────────────────────────────── */

export type TipoMedio = "imagen" | "video";
/** Variante de una imagen de carrusel. El video no tiene variantes. */
export type Variante = "escritorio" | "movil";

export type Resultado = { ok: true } | { ok: false; error: string };

const bien: Resultado = { ok: true };
const mal = (error: string): Resultado => ({ ok: false, error });

/* ── Límites ────────────────────────────────────────────────────────────── */

/** Imágenes del carrusel. La base lo garantiza también (`orden between 1 and 5`). */
export const MAX_IMAGENES = 5;

/**
 * Proporción ancho/alto de cada formato.
 * - escritorio: 7:3, la del hero del diseño (medido 2,34 : 1).
 * - movil: 4:5, vertical, la que ocupa bien la pantalla de un teléfono sin
 *   obligar a desplazarse. Decisión 1 del PROMPT L: es OPCIONAL.
 * - video: 16:9, lo que graba cualquier celular o cámara en horizontal.
 *   Decisión 2: no se recorta a la caja del diseño (2,62 : 1).
 */
export const PROPORCION = {
  escritorio: 7 / 3,
  movil: 4 / 5,
  video: 16 / 9,
} as const;

/** Desviación relativa admitida: 3 % sobre 7:3 es el rango [2,263 – 2,403]. */
export const TOLERANCIA_PROPORCION = 0.03;

type Medidas = { ancho: number; alto: number };

/** Lo que se pide a quien sube. `minimo` rechaza; `ideal` es lo que se recomienda. */
export const MEDIDAS: Readonly<Record<Variante | "video", { ideal: Medidas; minimo: Medidas }>> = {
  escritorio: { ideal: { ancho: 2800, alto: 1200 }, minimo: { ancho: 1400, alto: 600 } },
  movil: { ideal: { ancho: 1080, alto: 1350 }, minimo: { ancho: 810, alto: 1013 } },
  video: { ideal: { ancho: 1920, alto: 1080 }, minimo: { ancho: 640, alto: 360 } },
};

const MB = 1024 * 1024;
/** Tope de Cloudinary (plan gratuito) para una imagen. Se sirve optimizada: el peso subido no es el servido. */
export const MAX_BYTES_IMAGEN = 10 * MB;
/** Tope de Cloudinary (plan gratuito) para un video. */
export const MAX_BYTES_VIDEO = 100 * MB;
/** Lo que se RECOMIENDA en la interfaz: cada reproducción completa gasta ese peso en ancho de banda. */
export const RECOMENDADO_BYTES_VIDEO = 50 * MB;
export const MAX_DURACION_VIDEO_S = 120;

/** Cloudinary informa `jpg` aunque el archivo se llamara `.jpeg`: se aceptan los dos. */
export const FORMATOS_IMAGEN = ["jpg", "jpeg", "png", "webp"] as const;
/** `mov` es lo que graba un iPhone; Cloudinary lo sirve como mp4 con `f_auto`. */
export const FORMATOS_VIDEO = ["mp4", "mov", "webm"] as const;

/**
 * Zonas que la imagen debe dejar libres, porque la portada pinta encima:
 * el rótulo «Conoce nuestra oferta educativa» en el 25 % inferior, y las
 * flechas del carrusel en el 5 % de cada lado.
 */
export const ZONA_SEGURA = { inferior: 0.25, lateral: 0.05 } as const;

/** Transformaciones de entrega de Cloudinary. El archivo subido no se toca: se optimiza al servirlo. */
export const TRANSFORMACION = {
  escritorio: "f_auto,q_auto,w_2400",
  movil: "f_auto,q_auto,w_1080",
  video: "f_auto,q_auto,w_1280",
  /** Primer fotograma del video como imagen de espera: nada se descarga hasta pulsar «play». */
  poster: "so_0,f_jpg,q_auto,w_1280",
} as const;

/* ── Validación de archivos ─────────────────────────────────────────────── */

function formatearMB(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace(".", ",")} MB`;
}

/** «16:9», «4:5»… si se parece a una conocida; si no, «2,10 : 1». */
export function describirProporcion(ancho: number, alto: number): string {
  if (!(ancho > 0 && alto > 0)) return "desconocida";
  const r = ancho / alto;
  const conocidas: Array<[string, number]> = [
    ["7:3", 7 / 3], ["16:9", 16 / 9], ["4:3", 4 / 3], ["3:2", 3 / 2], ["1:1", 1],
    ["4:5", 4 / 5], ["3:4", 3 / 4], ["9:16", 9 / 16],
  ];
  for (const [nombre, valor] of conocidas) {
    if (Math.abs(r - valor) / valor <= 0.01) return nombre;
  }
  return `${r.toFixed(2).replace(".", ",")} : 1`;
}

function proporcionCuadra(ancho: number, alto: number, objetivo: number): boolean {
  return ancho > 0 && alto > 0 && Math.abs(ancho / alto - objetivo) / objetivo <= TOLERANCIA_PROPORCION;
}

function normalizarFormato(formato: string): string {
  return formato.trim().toLowerCase().replace(/^\./, "");
}

export type MedicionImagen = {
  ancho: number;
  alto: number;
  bytes: number;
  formato: string;
  variante: Variante;
};

/**
 * ¿Sirve esta imagen para la portada? Los mensajes están escritos para la
 * persona de dirección que la sube: dicen qué pasa Y qué hacer.
 */
export function validarImagen(m: MedicionImagen): Resultado {
  const formato = normalizarFormato(m.formato);
  if (!(FORMATOS_IMAGEN as readonly string[]).includes(formato)) {
    return mal(`El formato «${formato || "desconocido"}» no sirve. Usa JPG, PNG o WebP.`);
  }
  if (m.bytes > MAX_BYTES_IMAGEN) {
    return mal(`La imagen pesa ${formatearMB(m.bytes)} y el máximo es ${formatearMB(MAX_BYTES_IMAGEN)}. Expórtala como JPG con calidad media.`);
  }
  const { ideal, minimo } = MEDIDAS[m.variante];
  const objetivo = m.variante === "escritorio" ? "7:3" : "4:5 (vertical)";
  const para = m.variante === "escritorio" ? "la portada" : "la versión para teléfono";
  if (!proporcionCuadra(m.ancho, m.alto, PROPORCION[m.variante])) {
    return mal(
      `La imagen mide ${m.ancho} × ${m.alto} (${describirProporcion(m.ancho, m.alto)}) y ${para} necesita ${objetivo}. ` +
        `Recórtala a ${ideal.ancho} × ${ideal.alto}.`,
    );
  }
  if (m.ancho < minimo.ancho || m.alto < minimo.alto) {
    return mal(
      `La imagen mide ${m.ancho} × ${m.alto} y se vería borrosa. El mínimo es ${minimo.ancho} × ${minimo.alto}; ` +
        `lo ideal, ${ideal.ancho} × ${ideal.alto}.`,
    );
  }
  return bien;
}

export type MedicionVideo = {
  ancho: number;
  alto: number;
  bytes: number;
  formato: string;
  duracion_s: number;
};

export function validarVideo(m: MedicionVideo): Resultado {
  const formato = normalizarFormato(m.formato);
  if (!(FORMATOS_VIDEO as readonly string[]).includes(formato)) {
    return mal(`El formato «${formato || "desconocido"}» no sirve. Usa MP4 (o MOV, el de iPhone).`);
  }
  if (m.bytes > MAX_BYTES_VIDEO) {
    return mal(
      `El video pesa ${formatearMB(m.bytes)} y el máximo es ${formatearMB(MAX_BYTES_VIDEO)}. ` +
        `Expórtalo a 1080p o a 720p; lo recomendable es no pasar de ${formatearMB(RECOMENDADO_BYTES_VIDEO)}.`,
    );
  }
  if (!(m.duracion_s > 0)) return mal("No se pudo leer la duración del video. Prueba a exportarlo de nuevo como MP4.");
  if (m.duracion_s > MAX_DURACION_VIDEO_S + 0.5) {
    return mal(`El video dura ${Math.round(m.duracion_s)} s y el máximo son ${MAX_DURACION_VIDEO_S} s (2 minutos).`);
  }
  if (!proporcionCuadra(m.ancho, m.alto, PROPORCION.video)) {
    const vertical = m.alto > m.ancho;
    return mal(
      `El video mide ${m.ancho} × ${m.alto} (${describirProporcion(m.ancho, m.alto)}) y la portada necesita 16:9. ` +
        (vertical ? "Parece grabado en vertical: grábalo con el teléfono en horizontal." : "Expórtalo a 1920 × 1080."),
    );
  }
  const { minimo } = MEDIDAS.video;
  if (m.ancho < minimo.ancho || m.alto < minimo.alto) {
    return mal(`El video mide ${m.ancho} × ${m.alto} y se vería borroso. El mínimo es ${minimo.ancho} × ${minimo.alto}.`);
  }
  return bien;
}

/* ── Carreras ───────────────────────────────────────────────────────────── */

/**
 * Rótulo PÚBLICO de cada carrera, por su `clave`. Decisión 4 del PROMPT L.
 *
 * No se toca `carreras.nombre` («RH»): ese campo se usa en otros sitios y
 * renombrarlo sería una migración ajena a la portada. Tampoco sirve
 * `etiquetaCarrera()` de `materia/facetas-materia.ts`: da rótulos CORTOS («MC»,
 * «RH») para filtros.
 */
export const ROTULOS_CARRERA: Readonly<Record<string, string>> = {
  MECATRONICA: "MECATRÓNICA",
  RH: "RECURSOS HUMANOS",
};

/** Rótulo público; una clave sin rótulo cae al nombre del catálogo, y luego a la clave. */
export function rotuloCarrera(clave: string | null, nombre: string | null): string {
  const c = (clave ?? "").trim().toUpperCase();
  // `||` y no `??`: un nombre VACÍO también tiene que caer a la clave.
  return ROTULOS_CARRERA[c] || (nombre ?? "").trim() || c;
}

/* ── Orden del carrusel ─────────────────────────────────────────────────── */

/** El primer hueco libre del 1 al 5, o `null` si el carrusel está lleno. */
export function siguienteOrdenLibre(ordenes: readonly number[]): number | null {
  const ocupados = new Set(ordenes);
  for (let o = 1; o <= MAX_IMAGENES; o++) if (!ocupados.has(o)) return o;
  return null;
}

export type ConOrden = { id: string; orden: number };

/**
 * Tras eliminar una imagen, las demás se compactan de 1 a n conservando su
 * orden relativo: el carrusel nunca tiene huecos. No muta la entrada.
 */
export function ordenTrasEliminar(lista: readonly ConOrden[], idEliminado: string): ConOrden[] {
  return lista
    .filter((x) => x.id !== idEliminado)
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((x, i) => ({ id: x.id, orden: i + 1 }));
}

/** ¿`nuevos` son exactamente `actuales`, sin faltar ni repetir ninguno? */
export function esPermutacion(nuevos: readonly string[], actuales: readonly string[]): boolean {
  if (nuevos.length !== actuales.length) return false;
  const a = [...nuevos].sort();
  const b = [...actuales].sort();
  return a.every((x, i) => x === b[i]) && new Set(nuevos).size === nuevos.length;
}

/* ── Identificadores en Cloudinary ──────────────────────────────────────── */

/** Carpeta de la portada dentro de Cloudinary. */
export const CARPETA_PORTADA = "cetac23/portada";

/**
 * `public_id` NUEVO para cada subida: `cetac23/portada/imagen_escritorio_<sufijo>`.
 *
 * Reemplazar crea un id nuevo y el anterior se borra (prompt M): así ninguna
 * caché de CDN puede servir la versión vieja. El sufijo lo RECIBE —este módulo
 * no genera aleatorios— y solo admite [a-z0-9-], para que nadie cuele una ruta.
 */
export function publicIdNuevo(tipo: TipoMedio, variante: Variante | null, sufijo: string): string {
  const limpio = sufijo.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (limpio.length < 8) throw new Error("publicIdNuevo: sufijo demasiado corto");
  const parte = tipo === "video" ? "video" : `imagen_${variante ?? "escritorio"}`;
  return `${CARPETA_PORTADA}/${parte}_${limpio}`;
}

/** ¿Este `public_id` pertenece a la portada? El servidor no registra nada de otra carpeta. */
export function esPublicIdDePortada(publicId: string): boolean {
  return /^cetac23\/portada\/(imagen_(escritorio|movil)|video)_[a-z0-9-]{8,}$/.test(publicId);
}

/* ── Ajustes de contacto ────────────────────────────────────────────────── */

/**
 * Lo configurable de la barra superior y el pie (decisión 5). Las claves son las
 * mismas que admite el CHECK de `portada_ajustes` en la base.
 */
export const AJUSTES_PORTADA = [
  { clave: "tiktok_url", etiqueta: "TikTok", tipo: "url", dominios: ["tiktok.com"], ejemplo: "https://www.tiktok.com/@cetac23" },
  { clave: "facebook_url", etiqueta: "Facebook", tipo: "url", dominios: ["facebook.com", "fb.com"], ejemplo: "https://www.facebook.com/cetac23" },
  { clave: "whatsapp_numero", etiqueta: "WhatsApp", tipo: "whatsapp", dominios: [], ejemplo: "442 123 4567" },
  { clave: "correo", etiqueta: "Correo", tipo: "correo", dominios: [], ejemplo: "contacto@cetac23.edu.mx" },
  { clave: "telefono", etiqueta: "Teléfono", tipo: "texto", dominios: [], ejemplo: "442 123 4567" },
  { clave: "direccion", etiqueta: "Dirección", tipo: "texto", dominios: [], ejemplo: "Avenida Villas de la Piedad, …" },
] as const;

export type ClaveAjuste = (typeof AJUSTES_PORTADA)[number]["clave"];
export const CLAVES_AJUSTE: readonly ClaveAjuste[] = AJUSTES_PORTADA.map((a) => a.clave);
export const MAX_LARGO_AJUSTE = 300;

export function esClaveAjuste(x: string): x is ClaveAjuste {
  return (CLAVES_AJUSTE as readonly string[]).includes(x);
}

/** Solo dígitos. 10 dígitos se entienden como número de México y se les antepone 52. */
export function normalizarWhatsApp(numero: string): string | null {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length >= 11 && digitos.length <= 13) return digitos;
  return null;
}

export function enlaceWhatsApp(numero: string): string | null {
  const n = normalizarWhatsApp(numero);
  return n ? `https://wa.me/${n}` : null;
}

/**
 * ¿Es válido este valor para este ajuste? Un valor VACÍO es válido: significa
 * «quitarlo», y la portada simplemente no muestra ese icono.
 */
export function validarAjuste(clave: string, valor: string): Resultado {
  if (!esClaveAjuste(clave)) return mal(`«${clave}» no es un ajuste de la portada.`);
  const v = valor.trim();
  if (v === "") return bien;
  if (v.length > MAX_LARGO_AJUSTE) return mal(`Es demasiado largo (máximo ${MAX_LARGO_AJUSTE} caracteres).`);
  const def = AJUSTES_PORTADA.find((a) => a.clave === clave)!;

  if (def.tipo === "url") {
    let url: URL;
    try {
      url = new URL(v);
    } catch {
      return mal(`No es un enlace válido. Cópialo entero desde el navegador, como ${def.ejemplo}`);
    }
    if (url.protocol !== "https:") return mal("El enlace tiene que empezar por https://");
    const host = url.hostname.toLowerCase();
    const dominioOk = def.dominios.some((d) => host === d || host.endsWith(`.${d}`));
    if (!dominioOk) return mal(`Ese enlace no es de ${def.etiqueta}. Debería parecerse a ${def.ejemplo}`);
    return bien;
  }
  if (def.tipo === "whatsapp") {
    return normalizarWhatsApp(v) ? bien : mal("Escribe el número de WhatsApp con 10 dígitos (o con su código de país).");
  }
  if (def.tipo === "correo") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? bien : mal("No parece un correo válido.");
  }
  return bien;
}
