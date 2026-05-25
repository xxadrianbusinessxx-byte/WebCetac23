import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";
import { urlCloudinaryDesdePublicId } from "@/lib/cloudinary/urls";

const IMG_OPEN = "[img]";
const IMG_CLOSE = "[/img]";

export type ComentarioChatParseado = {
  texto: string;
  imagenUrl: string | null;
};

/** Convierte URL larga de Cloudinary a clave corta (cetac23/chat_…). */
export function imagenAClaveGuardado(urlOrClave: string): string {
  const v = urlOrClave.trim();
  if (!v) return "";
  if (!v.startsWith("http")) return v.replace(/\.[a-z0-9]+$/i, "");
  try {
    const u = new URL(v);
    const marker = "/upload/";
    const i = u.pathname.indexOf(marker);
    if (i < 0) return v.slice(0, 90);
    let rest = u.pathname.slice(i + marker.length).replace(/^v\d+\//, "");
    rest = rest.replace(/\.[a-z0-9]+$/i, "");
    return rest;
  } catch {
    return v.slice(0, 90);
  }
}

export function claveAUrlImagen(clave: string): string {
  const c = clave.trim();
  if (!c) return "";
  if (c.startsWith("http")) return c;
  return urlCloudinaryDesdePublicId(c);
}

/** Codifica imagen (clave corta) + texto en COMENTARIO (≤200 chars). */
export function codificarComentarioChat(
  texto: string,
  imagenUrlOrClave: string | null,
): string {
  const t = texto.trim();
  const clave = imagenUrlOrClave ? imagenAClaveGuardado(imagenUrlOrClave) : "";
  if (!clave) return t;
  if (!t) return `${IMG_OPEN}${clave}${IMG_CLOSE}`;
  return `${IMG_OPEN}${clave}${IMG_CLOSE}${t}`;
}

export function decodificarComentarioChat(
  comentario: string,
): ComentarioChatParseado {
  const raw = comentario.trim();
  if (!raw.startsWith(IMG_OPEN)) {
    return { texto: raw, imagenUrl: null };
  }
  const fin = raw.indexOf(IMG_CLOSE);
  if (fin < 0) return { texto: raw, imagenUrl: null };
  const clave = raw.slice(IMG_OPEN.length, fin).trim();
  const texto = raw.slice(fin + IMG_CLOSE.length).trim();
  const imagenUrl = clave ? claveAUrlImagen(clave) : null;
  return {
    imagenUrl,
    texto: texto || "(imagen)",
  };
}

export function validarLongitudComentarioChat(
  texto: string,
  imagenUrlOrClave: string | null,
): string | null {
  const encoded = codificarComentarioChat(texto, imagenUrlOrClave);
  if (encoded.length > COMENTARIO_MAX_LENGTH) {
    return `Máximo ${COMENTARIO_MAX_LENGTH} caracteres (texto + imagen). Acorta el mensaje.`;
  }
  if (!encoded.trim()) return "Escribe un mensaje o adjunta una imagen.";
  return null;
}
