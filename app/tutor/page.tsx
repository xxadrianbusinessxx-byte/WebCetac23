import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { puede } from "@/lib/auth/permisos";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { TutorClient } from "./tutor-client";

export const metadata: Metadata = {
  title: "AulaNube — Tutor / Padre",
  description:
    "Portal del tutor: consulta de alumnos a cargo y gestión de credenciales.",
};

export default async function TutorPage() {
  const sesion = await obtenerSesionPortal();
  if (!sesion) redirect("/login");
  // Acceso por capacidad (PROMPT-3/T2): la vista "mi propio tutor" la usan el
  // tutor autenticado y el directivo (para administrar); el alcance sobre qué
  // registros puede cada uno se valida en las Server Actions.
  if (!puede(sesion.rol, "tutor.ver_propio")) redirect("/perfil");
  return <TutorClient sesion={sesion} />;
}


