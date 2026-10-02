/**
 * portada-puro.ts — MÓDULO PURO. Todas las reglas de la portada administrable:
 * qué imagen es válida, cuántas caben, cómo se ordenan, qué rótulo lleva cada
 * carrera, qué enlace de video se acepta y qué forma tiene cada ajuste de
 * contacto. Cero I/O.
 *
 * ── El video de cada carrera es un ENLACE (PROMPT U, 2026-10-01) ───────────
 * Hasta esa fecha se SUBÍA un archivo a Cloudinary (`validarVideo` y sus
 * constantes). Ahora se pega un enlace de YouTube o TikTok y se ve con su
 * reproductor: `analizarEnlaceVideo`, al final de este archivo. Lo de subir video
 * queda `@deprecated` —nunca se usó: 0 videos subidos— y se retira aparte
 * (pendiente `retirar-video-cloudinary-portada`).
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
  /** @deprecated PROMPT U: el video ya no se sube. La banda usa `PROPORCION_VIDEO` según el formato del enlace. */
  video: 16 / 9,
} as const;

/** Desviación relativa admitida: 3 % sobre 7:3 es el rango [2,263 – 2,403]. */
export const TOLERANCIA_PROPORCION = 0.03;

type Medidas = { ancho: number; alto: number };

/** Lo que se pide a quien sube. `minimo` rechaza; `ideal` es lo que se recomienda. */
export const MEDIDAS: Readonly<Record<Variante | "video", { ideal: Medidas; minimo: Medidas }>> = {
  escritorio: { ideal: { ancho: 2800, alto: 1200 }, minimo: { ancho: 1400, alto: 600 } },
  movil: { ideal: { ancho: 1080, alto: 1350 }, minimo: { ancho: 810, alto: 1013 } },
  /** @deprecated PROMPT U: el video ya no se sube; es un enlace de YouTube o TikTok (`analizarEnlaceVideo`). */
  video: { ideal: { ancho: 1920, alto: 1080 }, minimo: { ancho: 640, alto: 360 } },
};

const MB = 1024 * 1024;
/** Tope de Cloudinary (plan gratuito) para una imagen. Se sirve optimizada: el peso subido no es el servido. */
export const MAX_BYTES_IMAGEN = 10 * MB;
/**
 * Tope de Cloudinary (plan gratuito) para un video.
 * @deprecated PROMPT U: el video ya no se sube; es un enlace (`analizarEnlaceVideo`).
 */
export const MAX_BYTES_VIDEO = 100 * MB;
/**
 * Lo que se RECOMIENDA en la interfaz: cada reproducción completa gasta ese peso en ancho de banda.
 * @deprecated PROMPT U: el video ya no se sube; es un enlace (`analizarEnlaceVideo`).
 */
export const RECOMENDADO_BYTES_VIDEO = 50 * MB;
/** @deprecated PROMPT U: el video ya no se sube; es un enlace (`analizarEnlaceVideo`). */
export const MAX_DURACION_VIDEO_S = 120;

/** Cloudinary informa `jpg` aunque el archivo se llamara `.jpeg`: se aceptan los dos. */
export const FORMATOS_IMAGEN = ["jpg", "jpeg", "png", "webp"] as const;
/**
 * `mov` es lo que graba un iPhone; Cloudinary lo sirve como mp4 con `f_auto`.
 * @deprecated PROMPT U: el video ya no se sube; es un enlace (`analizarEnlaceVideo`).
 */
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
  /** @deprecated PROMPT U: el video lo sirve YouTube o TikTok (`urlInsercionVideo`), no Cloudinary. */
  video: "f_auto,q_auto,w_1280",
  /**
   * Primer fotograma del video como imagen de espera: nada se descarga hasta pulsar «play».
   * @deprecated PROMPT U: el video lo sirve YouTube o TikTok (`urlInsercionVideo`), no Cloudinary.
   */
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

/** @deprecated PROMPT U: el video ya no se sube; es un enlace (`analizarEnlaceVideo`). */
export type MedicionVideo = {
  ancho: number;
  alto: number;
  bytes: number;
  formato: string;
  duracion_s: number;
};

/**
 * @deprecated PROMPT U (2026-10-01): el video de una carrera ya no se sube a
 * Cloudinary; se pega un enlace de YouTube o TikTok y lo valida
 * `analizarEnlaceVideo`. Sin consumidores en la aplicación; la suite lo sigue
 * probando hasta que se retire (pendiente `retirar-video-cloudinary-portada`).
 */
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

/**
 * ¿Se puede subir una imagen de escritorio a esta posición? Sí si REEMPLAZA una
 * que ya está, o si ocupa la siguiente libre. Saltar a la 5 con el carrusel vacío
 * dejaría huecos, y el carrusel nunca los tiene.
 */
export function ordenPermitidoParaSubir(ocupados: readonly number[], orden: number): boolean {
  return ocupados.includes(orden) || orden === siguienteOrdenLibre(ocupados);
}

/** ¿`nuevos` son exactamente `actuales`, sin faltar ni repetir ninguno? */
export function esPermutacion(nuevos: readonly string[], actuales: readonly string[]): boolean {
  if (nuevos.length !== actuales.length) return false;
  const a = [...nuevos].sort();
  const b = [...actuales].sort();
  return a.every((x, i) => x === b[i]) && new Set(nuevos).size === nuevos.length;
}

/* ── A dónde va una subida ──────────────────────────────────────────────── */

export type Destino = {
  tipo: TipoMedio;
  variante?: Variante | null;
  orden?: number | null;
  carreraId?: string | null;
};

/**
 * ¿Tiene sentido este destino? Una imagen necesita variante y posición. Es una
 * regla ENTRE campos, y por eso vive aquí y no en el esquema de
 * `lib/validacion/`: `leerEntrada` valida campo a campo, y una comprobación a
 * nivel de objeto dentro del esquema se saltaría sin avisar.
 *
 * Un VIDEO ya no es un destino de subida (PROMPT U): se rechaza aquí, que es el
 * primer paso de la firma y del registro, así que el camino de Cloudinary para
 * video queda cerrado en el servidor y no solo escondido en el panel.
 */
export function validarDestino(d: Destino): Resultado {
  if (d.tipo === "imagen") {
    if (d.variante !== "escritorio" && d.variante !== "movil") return mal("Falta indicar si la imagen es para escritorio o para teléfono.");
    if (!Number.isInteger(d.orden) || (d.orden as number) < 1 || (d.orden as number) > MAX_IMAGENES) {
      return mal(`La posición del carrusel tiene que estar entre 1 y ${MAX_IMAGENES}.`);
    }
    if (d.carreraId) return mal("Una imagen del carrusel no va ligada a una carrera.");
    return bien;
  }
  if (d.tipo === "video") return mal(VIDEO_YA_NO_SE_SUBE);
  return mal("Tipo de archivo no válido.");
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

/**
 * ¿Este `public_id` es del tipo que se dice registrar? Sin esto, un video firmado
 * como video podría registrarse como imagen de escritorio: la firma fija el
 * destino al subir, y esto lo vuelve a exigir al registrar.
 */
export function publicIdCorrespondeA(publicId: string, tipo: TipoMedio, variante: Variante | null): boolean {
  if (!esPublicIdDePortada(publicId)) return false;
  const parte = tipo === "video" ? "video" : `imagen_${variante ?? "escritorio"}`;
  return publicId.startsWith(`${CARPETA_PORTADA}/${parte}_`);
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

/* ── Videos por enlace (PROMPT U, 2026-10-01) ───────────────────────────── */
//
// El video de cada carrera es un ENLACE de YouTube o TikTok que se ve con el
// reproductor de la plataforma. Estas reglas las aplican el navegador (para
// avisar mientras se escribe) y el servidor (antes de guardar, y otra vez al
// leer lo guardado). El `src` del reproductor SIEMPRE se construye aquí con un
// id que pasó su regex: la URL que pegó la persona nunca llega tal cual a un
// `<iframe>`.

export type PlataformaVideo = "youtube" | "tiktok";
/** La banda de la carrera se adapta a esto. */
export type FormatoVideo = "horizontal" | "vertical";

/** Proporción ancho/alto de la caja del reproductor según el formato. */
export const PROPORCION_VIDEO: Readonly<Record<FormatoVideo, number>> = {
  horizontal: 16 / 9,
  vertical: 9 / 16,
};
export const FORMATOS_BANDA: readonly FormatoVideo[] = ["horizontal", "vertical"];
export const ETIQUETA_FORMATO: Readonly<Record<FormatoVideo, string>> = {
  horizontal: "Horizontal 16:9",
  vertical: "Vertical 9:16",
};

/** Topes. Los mismos números están en el CHECK de `crear-portada-carreras.sql` (la suite lo comprueba). */
export const MAX_LARGO_ENLACE_VIDEO = 500;
export const MAX_LARGO_DESCRIPCION_CARRERA = 600;

/** Lo que `validarDestino` contesta a quien intente SUBIR un video. */
export const VIDEO_YA_NO_SE_SUBE =
  "Los videos de carrera ya no se suben: pega su enlace de YouTube o TikTok en «Oferta educativa».";

export type EnlaceVideo = {
  plataforma: PlataformaVideo;
  id: string;
  /** La que se guarda: sin parámetros de rastreo ni de tiempo. */
  urlCanonica: string;
  /** Lo que dice la propia URL: Shorts y TikTok son verticales. Quien edita puede corregirlo. */
  formatoSugerido: FormatoVideo;
};

export type AnalisisEnlace =
  | { tipo: "video"; enlace: EnlaceVideo }
  /** Enlace corto de TikTok: hay que seguirlo (I/O) y analizar la dirección final. */
  | { tipo: "corto-tiktok"; url: string }
  | { tipo: "error"; error: string };

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const ID_TIKTOK = /^\d{15,22}$/;
const USUARIO_TIKTOK = /^[A-Za-z0-9._]{1,30}$/;
const CODIGO_CORTO_TIKTOK = /^[A-Za-z0-9]+$/;
/** Un esquema al principio («https:», «javascript:»…). Sin él se entiende https. */
const CON_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i;

const NO_ES_ENLACE = "No es un enlace válido. Cópialo completo desde YouTube o TikTok.";
const FORMA_TIKTOK =
  "Ese enlace de TikTok no es de un video. Abre el video y copia su dirección (…tiktok.com/@cuenta/video/…).";

const errorEnlace = (error: string): AnalisisEnlace => ({ tipo: "error", error });

/** Quita UN prefijo `www.` o `m.`. La comparación de host que sigue es EXACTA. */
function hostSinPrefijo(host: string): string {
  const h = host.toLowerCase();
  if (h.startsWith("www.")) return h.slice(4);
  if (h.startsWith("m.")) return h.slice(2);
  return h;
}

function enlaceYouTube(id: string, esShort: boolean): AnalisisEnlace {
  if (!ID_YOUTUBE.test(id)) {
    return errorEnlace("El identificador del video de YouTube no es válido. Copia el enlace completo otra vez.");
  }
  return {
    tipo: "video",
    enlace: {
      plataforma: "youtube",
      id,
      urlCanonica: esShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
      formatoSugerido: esShort ? "vertical" : "horizontal",
    },
  };
}

/**
 * ¿Qué video es este enlace? Acepta las formas que la gente copia de verdad:
 *   YouTube  youtu.be/ID · /watch?v=ID · /shorts/ID · /embed/ID · /live/ID
 *   TikTok   /@cuenta/video/ID · y los cortos vm.tiktok.com/… · tiktok.com/t/…
 * Con o sin `https://`, con `www.` o `m.`, con parámetros (`si`, `t`…), que se
 * descartan. El host se compara EXACTO: `youtube.com.otro.com` no es YouTube.
 */
export function analizarEnlaceVideo(texto: string): AnalisisEnlace {
  const t = (texto ?? "").trim();
  if (!t) return errorEnlace("Pega el enlace del video.");
  if (t.length > MAX_LARGO_ENLACE_VIDEO) {
    return errorEnlace(`El enlace es demasiado largo (máximo ${MAX_LARGO_ENLACE_VIDEO} caracteres).`);
  }
  let url: URL;
  try {
    url = new URL(CON_ESQUEMA.test(t) ? t : `https://${t}`);
  } catch {
    return errorEnlace(NO_ES_ENLACE);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return errorEnlace(NO_ES_ENLACE);

  const host = hostSinPrefijo(url.hostname);
  const partes = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return partes.length === 1 ? enlaceYouTube(partes[0], false) : errorEnlace(NO_ES_ENLACE);
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (partes.length === 1 && partes[0] === "watch") return enlaceYouTube(url.searchParams.get("v") ?? "", false);
    if (partes.length === 2 && partes[0] === "shorts") return enlaceYouTube(partes[1], true);
    if (partes.length === 2 && ["embed", "live", "v"].includes(partes[0])) return enlaceYouTube(partes[1], false);
    return errorEnlace("Ese enlace de YouTube no es de un video. Abre el video y copia su dirección.");
  }

  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return partes.length === 1 && CODIGO_CORTO_TIKTOK.test(partes[0])
      ? { tipo: "corto-tiktok", url: `https://${host}/${partes[0]}/` }
      : errorEnlace(FORMA_TIKTOK);
  }
  if (host === "tiktok.com") {
    if (partes.length === 2 && partes[0] === "t" && CODIGO_CORTO_TIKTOK.test(partes[1])) {
      return { tipo: "corto-tiktok", url: `https://www.tiktok.com/t/${partes[1]}/` };
    }
    if (partes.length === 3 && partes[0].startsWith("@")) {
      const usuario = partes[0].slice(1);
      if (partes[1] === "photo") return errorEnlace("Es una publicación de fotos, no un video.");
      if (partes[1] === "video" && USUARIO_TIKTOK.test(usuario) && ID_TIKTOK.test(partes[2])) {
        return {
          tipo: "video",
          enlace: {
            plataforma: "tiktok",
            id: partes[2],
            urlCanonica: `https://www.tiktok.com/@${usuario}/video/${partes[2]}`,
            formatoSugerido: "vertical",
          },
        };
      }
    }
    return errorEnlace(FORMA_TIKTOK);
  }

  return errorEnlace("Solo se aceptan videos de YouTube o TikTok.");
}

/**
 * Un enlace GUARDADO, leído de vuelta. Solo vale si es exactamente la canónica
 * que produce `analizarEnlaceVideo`: lo que no lo sea no lo escribió el
 * servidor, y la portada no lo muestra.
 */
export function leerEnlaceGuardado(url: string | null | undefined): EnlaceVideo | null {
  if (!url) return null;
  const a = analizarEnlaceVideo(url);
  return a.tipo === "video" && a.enlace.urlCanonica === url ? a.enlace : null;
}

/**
 * La dirección del reproductor oficial. YouTube en su dominio sin cookies hasta
 * pulsar «play»; TikTok con su Embed Player (`player/v1`), sin la descripción ni
 * la música superpuestas, porque el texto de la carrera ya va al lado.
 */
export function urlInsercionVideo(plataforma: PlataformaVideo, id: string): string {
  const seguro = encodeURIComponent(id);
  return plataforma === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${seguro}?rel=0&playsinline=1`
    : `https://www.tiktok.com/player/v1/${seguro}?rel=0&description=0&music_info=0`;
}

/** «YouTube · horizontal 16:9», «YouTube Shorts · vertical 9:16», «TikTok · vertical 9:16». */
export function describirEnlace(e: EnlaceVideo): string {
  const origen =
    e.plataforma === "tiktok" ? "TikTok" : e.urlCanonica.includes("/shorts/") ? "YouTube Shorts" : "YouTube";
  return `${origen} · ${ETIQUETA_FORMATO[e.formatoSugerido].toLowerCase()}`;
}

/**
 * ¿Qué significa la respuesta del oEmbed de la plataforma? `status` 0 = no hubo
 * respuesta (sin red o tiempo agotado). YouTube contesta 401 cuando el dueño
 * desactivó la inserción y 403/404 cuando es privado o no existe.
 */
export function interpretarRespuestaOembed(plataforma: PlataformaVideo, status: number): Resultado {
  if (status === 200) return bien;
  if (status === 401) {
    return mal(
      plataforma === "youtube"
        ? "Ese video no permite insertarse en otras páginas. En YouTube: Studio › Detalles › Mostrar más › «Permitir insertar»."
        : "Ese video no permite insertarse en otras páginas. En TikTok, activa «Permitir insertar» en la privacidad de la cuenta.",
    );
  }
  if (status === 400 || status === 403 || status === 404) {
    return mal("No se encontró ese video o es privado. Tiene que ser público (o «no listado» en YouTube).");
  }
  return mal("No se pudo comprobar el video ahora mismo. Inténtalo en un momento.");
}
