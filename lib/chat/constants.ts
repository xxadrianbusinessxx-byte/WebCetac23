import type { ChatOrigen } from "./types";

export const MENSAJES_CHAT_TABLE = "mensajes_chat";

export const CHAT_ORIGEN_NAV: Record<
  ChatOrigen,
  { label: string; href: string }
> = {
  perfil: { label: "Perfil", href: "/perfil" },
  profesor: { label: "Profesor", href: "/profesor" },
  directivo: { label: "Directivo", href: "/directivo" },
};
