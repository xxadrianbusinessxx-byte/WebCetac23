export type GeneroUsuario = "masculino" | "femenino";

export type ChatOrigen = "perfil" | "profesor" | "directivo";

/** Fila prevista en Supabase (`mensajes_chat`). */
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
  imagenUrl?: string | null;
};
