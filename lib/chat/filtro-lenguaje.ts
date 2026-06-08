import BadWordsNext from "bad-words-next";
import en from "bad-words-next/lib/en";
import es from "bad-words-next/lib/es";

let filtroChat: BadWordsNext | null = null;

function obtenerFiltroChat(): BadWordsNext {
  if (!filtroChat) {
    filtroChat = new BadWordsNext();
    filtroChat.add(es);
    filtroChat.add(en);
  }
  return filtroChat;
}

/** true si el texto contiene lenguaje inapropiado (español + inglés). */
export function contieneLenguajeInapropiado(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  return obtenerFiltroChat().check(t);
}

/**
 * Valida el comentario del chat antes de publicarlo.
 * Retorna mensaje de error en español o null si pasa el filtro.
 */
export function validarLenguajeChat(texto: string): string | null {
  if (!contieneLenguajeInapropiado(texto)) return null;
  return "No se puede publicar tu comentario porque contiene lenguaje inapropiado. Revisa tu mensaje antes de enviarlo.";
}
