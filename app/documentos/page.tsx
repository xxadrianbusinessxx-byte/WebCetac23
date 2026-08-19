import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { DocumentosClient } from "./documentos-client";

export const metadata: Metadata = {
  title: "AulaNube — Documentos institucionales",
  description:
    "Documentos institucionales: carpetas, archivos y permisos de acceso.",
};

export default async function DocumentosPage() {
  const sesion = await obtenerSesionPortal();
  if (!sesion) redirect("/login");
  if (sesion.rol !== "directivo" && sesion.rol !== "maestro") {
    redirect("/perfil");
  }
  return <DocumentosClient sesion={sesion} />;
}
