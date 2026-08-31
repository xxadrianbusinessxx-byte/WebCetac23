import type { Metadata } from "next";
import { actionListarMateriasConNombreVisible } from "@/app/actions/materias";
import { actionListarRegistrosSupabase } from "@/app/actions/tablas";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { DirectivoClient } from "./directivo-client";

export const metadata: Metadata = {
  title: "AulaNube — Directivo",
  description:
    "Panel del directivo: calificaciones, comentarios, publicaciones y acceso al perfil del alumno.",
};

export default async function DirectivoPage() {
  const [sesion, materias, registros] = await Promise.all([
    obtenerSesionPortal(),
    actionListarMateriasConNombreVisible(),
    actionListarRegistrosSupabase(),
  ]);
  return <DirectivoClient sesion={sesion} materias={materias} registros={registros} />;
}
