import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
  if (sesion.rol !== "tutor") redirect("/perfil");
  return <TutorClient sesion={sesion} />;
}
