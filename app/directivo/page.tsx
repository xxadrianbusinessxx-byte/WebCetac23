import type { Metadata } from "next";
import { DirectivoClient } from "./directivo-client";

export const metadata: Metadata = {
  title: "AulaNube — Directivo",
  description:
    "Panel del directivo: calificaciones, comentarios, publicaciones, noticias y acceso al perfil del alumno.",
};

export default function DirectivoPage() {
  return <DirectivoClient />;
}
