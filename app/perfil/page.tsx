import type { Metadata } from "next";
import { Suspense } from "react";
import { PerfilClient } from "./perfil-client";

export const metadata: Metadata = {
  title: "AulaNube — Perfil",
  description: "Perfil del alumno: materias, estatus, comentarios y boleta.",
};

export default function PerfilPage() {
  return (
    <Suspense fallback={null}>
      <PerfilClient />
    </Suspense>
  );
}
