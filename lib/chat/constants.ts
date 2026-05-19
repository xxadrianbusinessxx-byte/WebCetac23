import { TABLA_COMENTARIOS } from "@/lib/escolar/tables";
import type { ChatOrigen } from "./types";

/** Tabla global de mensajes del chat (nombre literal en Supabase). */
export const MENSAJES_CHAT_TABLE = TABLA_COMENTARIOS;

export const CHAT_ORIGEN_NAV: Record<
  ChatOrigen,
  { label: string; href: string }
> = {
  perfil: { label: "Perfil", href: "/perfil" },
  profesor: { label: "Profesor", href: "/profesor" },
  directivo: { label: "Directivo", href: "/directivo" },
};
