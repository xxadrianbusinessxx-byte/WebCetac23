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
  // [DIAGNÓSTICO TEMPORAL 6J] Log seguro: solo rol y matricula, NUNCA secretos.
  const sesion = await obtenerSesionPortal();
  console.log("[6J-login] /tutor → sesión:", sesion ? `rol=${sesion.rol} matricula=${sesion.matricula}` : "null");
  if (!sesion) {
    console.log("[6J-login] /tutor → sin sesión → redirect /login");
    redirect("/login");
  }
  if (sesion.rol !== "tutor") {
    console.log("[6J-login] /tutor → rol no tutor → redirect /perfil");
    redirect("/perfil");
  }
  console.log("[6J-login] /tutor → renderizando TutorClient");
  return <TutorClient sesion={sesion} />;
}


