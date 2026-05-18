import type { Metadata } from "next";
import { Suspense } from "react";
import { actionObtenerPerfilAlumno } from "@/app/actions/escolar";
import { MATERIAS_ESCOLAR } from "@/lib/escolar/materias-list";
import { PerfilClient } from "./perfil-client";

export const metadata: Metadata = {
  title: "AulaNube — Perfil",
  description: "Perfil del alumno: materias, estatus, comentarios y boleta.",
};

type Props = {
  searchParams: Promise<{ modo?: string; curp?: string; alumno?: string }>;
};

export default async function PerfilPage({ searchParams }: Props) {
  const params = await searchParams;
  const curpConsulta = params.curp ?? params.alumno ?? null;
  const datos = await actionObtenerPerfilAlumno(curpConsulta);

  return (
    <Suspense fallback={null}>
      <PerfilClient
        materias={MATERIAS_ESCOLAR}
        modoDirectivo={params.modo === "directivo"}
        datos={datos}
      />
    </Suspense>
  );
}
