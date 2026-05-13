import type { Metadata } from "next";
import { PerfilClient } from "./perfil-client";

export const metadata: Metadata = {
  title: "AulaNube — Perfil",
  description: "Perfil del alumno: materias, estatus, comentarios y boleta.",
};

export default function PerfilPage() {
  return <PerfilClient />;
}
