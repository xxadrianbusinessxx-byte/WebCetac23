import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { ConfiguracionClient } from "./configuracion-client";

export const metadata: Metadata = {
  title: "AulaNube — Configuración",
  description:
    "Configuración del panel directivo: sincronización del roster de alumnos.",
};

export default async function ConfiguracionPage() {
  const sesion = await obtenerSesionPortal();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "directivo") redirect("/perfil");
  return <ConfiguracionClient sesion={sesion} />;
}
