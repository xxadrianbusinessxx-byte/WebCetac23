import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { puede } from "@/lib/auth/permisos";
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
  // Acceso por capacidad (PROMPT-3/T2): quien tenga documento.ver entra.
  const puedeVer = sesion ? puede(sesion.rol, "documento.ver") : false;
  if (!puedeVer) redirect("/perfil");
  return <DocumentosClient sesion={sesion} />;
}
