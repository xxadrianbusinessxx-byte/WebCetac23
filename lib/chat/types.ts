export type GeneroUsuario = "masculino" | "femenino";

export type ChatOrigen = "perfil" | "profesor" | "directivo";

/** Mensaje del chat (tabla COMENTARIOS en Supabase). */
export type MensajeChat = {
  id: string;
  fecha: string;
  remitenteMatricula: string;
  remitenteNombre: string;
  genero: GeneroUsuario;
  texto: string;
  imagenUrl?: string | null;
};

export type EnviarMensajeInput = {
  texto: string;
  remitenteMatricula: string;
  remitenteNombre: string;
  genero: GeneroUsuario;
  /** Clave corta Cloudinary (cetac23/chat_…) o URL. */
  imagenUrl?: string | null;
  imagenClave?: string | null;
};
