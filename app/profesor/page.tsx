import type { Metadata } from "next";
import { actionListarMateriasSupabase } from "@/app/actions/tablas";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { ProfesorClient } from "./profesor-client";

export const metadata: Metadata = {
  title: "AulaNube — Profesor",
  description:
    "Panel del profesor: materias, carga de calificaciones y comentarios a alumnos.",
};

export default async function ProfesorPage() {
  const [sesion, materias] = await Promise.all([
    obtenerSesionPortal(),
    actionListarMateriasSupabase(),
  ]);
  return <ProfesorClient sesion={sesion} materias={materias} />;
}
