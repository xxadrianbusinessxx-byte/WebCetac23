import type { Metadata } from "next";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { DirectivoClient } from "./directivo-client";

export const metadata: Metadata = {
  title: "AulaNube — Directivo",
  description:
    "Panel del directivo: calificaciones, comentarios, publicaciones, noticias y acceso al perfil del alumno.",
};

export default async function DirectivoPage() {
  const sesion = await obtenerSesionPortal();
  return <DirectivoClient sesion={sesion} />;
}
