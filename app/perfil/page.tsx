import type { Metadata } from "next";
import { Suspense } from "react";
import { actionObtenerPerfilAlumno } from "@/app/actions/escolar";
import { PerfilClient } from "./perfil-client";

export const metadata: Metadata = {
  title: "AulaNube — Perfil",
  description: "Perfil del alumno: materias, estatus, comentarios y boleta.",
};

type Props = {
  searchParams: Promise<{
    modo?: string;
    curp?: string;
    alumno?: string;
    desde?: string;
  }>;
};

export default async function PerfilPage({ searchParams }: Props) {
  const params = await searchParams;
  const curpConsulta = params.curp ?? params.alumno ?? null;
  const datos = await actionObtenerPerfilAlumno(curpConsulta);
  const modoDirectivo = params.modo === "directivo";
  const urlRegreso =
    params.desde === "directivo" || modoDirectivo ? "/directivo" : "/perfil";

  return (
    <Suspense fallback={null}>
      <PerfilClient
        materias={datos.materias}
        modoDirectivo={modoDirectivo}
        urlRegreso={urlRegreso}
        datos={datos}
      />
    </Suspense>
  );
}
